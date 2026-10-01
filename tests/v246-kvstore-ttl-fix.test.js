// Regression tests for the v2.4.6 kv-store TTL shadow-key leak fixes.
// delete()/clear() used to orphan the hidden `__ttl__:` expiry keys, which then
// grew unbounded in memory and on disk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createKVStore } from '../lib/Utils/kv-store.js';

const withTmpFile = async (fn) => {
    const dir = await mkdtemp(join(tmpdir(), 'kv-ttl-'));
    const file = join(dir, 'db.json');
    try {
        await fn(file);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
};

test('delete() also removes the TTL shadow key (memory + disk)', async () => {
    await withTmpFile(async (file) => {
        const db = await createKVStore(file, { debounceMs: 1 });
        db.set('k', 1, { ttlMs: 60_000 });
        assert.equal(db.delete('k'), true);
        assert.equal(db.get('k'), undefined);
        await db.flush();
        const disk = JSON.parse(await readFile(file, 'utf8'));
        assert.ok(!('k' in disk), 'value gone');
        assert.ok(!('__ttl__:k' in disk), 'shadow key must not be orphaned');
    });
});

test('clear() on a namespace removes TTL shadow keys too', async () => {
    await withTmpFile(async (file) => {
        const db = await createKVStore(file, { debounceMs: 1 });
        const ns = db.namespace('eco');
        ns.set('x', 5, { ttlMs: 60_000 });
        ns.set('y', 6);
        ns.clear();
        assert.equal(ns.size, 0);
        assert.equal(ns.get('x'), undefined);
        await db.flush();
        const disk = JSON.parse(await readFile(file, 'utf8'));
        assert.ok(!('__ttl__:eco:x' in disk), 'namespace shadow key must not be orphaned');
    });
});

test('clear() on the root store removes TTL shadow keys too', async () => {
    await withTmpFile(async (file) => {
        const db = await createKVStore(file, { debounceMs: 1 });
        db.set('r', 9, { ttlMs: 60_000 });
        db.clear();
        assert.equal(db.get('r'), undefined);
        await db.flush();
        const disk = JSON.parse(await readFile(file, 'utf8'));
        assert.ok(!('__ttl__:r' in disk), 'root shadow key must not be orphaned');
    });
});

test('TTL enforcement still works after the fix', async () => {
    const db = await createKVStore(null);
    db.set('gone', 'v', { ttlMs: -1 }); // already in the past → expired
    assert.equal(db.get('gone'), undefined);
    assert.equal(db.has('gone'), false);

    db.set('live', 'v', { ttlMs: 60_000 });
    assert.equal(db.get('live'), 'v');
    assert.equal(db.has('live'), true);
});

test('setting a key without ttl clears a previous expiry', async () => {
    const db = await createKVStore(null);
    db.set('p', 1, { ttlMs: 60_000 });
    db.set('p', 2); // no ttl → must not expire
    assert.equal(db.get('p'), 2);
});
