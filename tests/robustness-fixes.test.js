import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Tests for the robustness sweep: corrupted-store recovery, atomic store
// writes, cooldown map sweeping, and version-fetch timeouts.

describe('makeInMemoryStore file robustness', () => {
    it('readFromFile recovers from a corrupted store file instead of throwing', async () => {
        const { makeInMemoryStore } = await import('../lib/Store/make-in-memory-store.js');
        const dir = mkdtempSync(join(tmpdir(), 'jap-store-'));
        const file = join(dir, 'store.json');
        try {
            // truncated JSON — exactly what a crash mid-write used to leave
            writeFileSync(file, '{"chats":[{"id":"123@s.whatsapp.net","name":"tr');
            const store = makeInMemoryStore({});
            assert.doesNotThrow(() => store.readFromFile(file));
            // store must be usable and empty afterwards
            store.writeToFile(file);
            const roundTrip = JSON.parse(readFileSync(file, 'utf-8'));
            assert.ok(Array.isArray(roundTrip.chats));
        }
        finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('writeToFile is atomic (no lingering tmp file, valid JSON output)', async () => {
        const { makeInMemoryStore } = await import('../lib/Store/make-in-memory-store.js');
        const dir = mkdtempSync(join(tmpdir(), 'jap-store-'));
        const file = join(dir, 'store.json');
        try {
            const store = makeInMemoryStore({});
            store.writeToFile(file);
            assert.ok(existsSync(file));
            assert.doesNotThrow(() => JSON.parse(readFileSync(file, 'utf-8')));
            assert.ok(!existsSync(`${file}.tmp-${process.pid}`), 'tmp file cleaned up');
        }
        finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

describe('AutoReply cooldown map sweeping', () => {
    it('expired cooldown entries are swept once the map crosses the threshold', async () => {
        const mod = await import('../lib/Utils/auto-reply.js');
        const AutoReply = mod.AutoReply ?? mod.default ?? Object.values(mod).find((v) => typeof v === 'function' && /cooldown/i.test(String(v.prototype && Object.getOwnPropertyNames(v.prototype))));
        assert.ok(AutoReply, 'AutoReply class exported');
        const ar = new AutoReply();
        // fill with already-expired entries (expiry in the past)
        for (let i = 0; i < 10_001; i++) {
            ar.cooldowns.set(`rule:${i}@s.whatsapp.net`, Date.now() - 60_000);
        }
        // the next setCooldown crosses the >10k threshold and sweeps
        ar.setCooldown('fresh', 'x@s.whatsapp.net', 30_000);
        assert.ok(ar.cooldowns.size < 10_000, `swept (size=${ar.cooldowns.size})`);
        // the fresh (unexpired) entry must survive
        assert.ok(ar.cooldowns.has('fresh:x@s.whatsapp.net'));
    });
});

describe('version fetchers are time-bounded', () => {
    it('fetchLatestBaileysVersion resolves (fallback) on an immediate timeout', async () => {
        const { fetchLatestBaileysVersion } = await import('../lib/Utils/generics.js');
        const t0 = Date.now();
        const r = await fetchLatestBaileysVersion({ timeoutMs: 1 });
        assert.equal(r.isLatest, false);
        assert.ok(Array.isArray(r.version));
        assert.ok(Date.now() - t0 < 5_000, 'returned quickly, no hang');
    });

    it('fetchLatestWaWebVersion resolves (fallback) on an immediate timeout', async () => {
        const { fetchLatestWaWebVersion } = await import('../lib/Utils/generics.js');
        const r = await fetchLatestWaWebVersion({ timeoutMs: 1 });
        assert.equal(r.isLatest, false);
        assert.ok(Array.isArray(r.version));
    });

    it('both fetchers declare a default timeout in source (no unbounded fetch)', async () => {
        const { readFile } = await import('node:fs/promises');
        const src = await readFile(new URL('../lib/Utils/generics.js', import.meta.url), 'utf-8');
        const matches = src.match(/options\.timeoutMs \?\? 15_000/g) ?? [];
        assert.ok(matches.length >= 2, `both fetchers bounded (found ${matches.length})`);
    });
});
