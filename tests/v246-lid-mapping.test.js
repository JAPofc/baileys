import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIDMappingStore } from '../lib/Signal/lid-mapping.js';

// Minimal in-memory `keys` store mimicking the SignalKeyStore surface the
// LIDMappingStore relies on: get(type, ids) -> {id: value}, set({type:{...}}),
// transaction(fn). Backs the whole suite so no real socket/DB is needed.
const makeKeys = () => {
    const db = { 'lid-mapping': {} };
    const stats = { gets: 0, sets: 0, txns: 0 };
    return {
        db,
        stats,
        async get(type, ids) {
            stats.gets++;
            const out = {};
            for (const id of ids) {
                if (db[type] && db[type][id] !== undefined && db[type][id] !== null) {
                    out[id] = db[type][id];
                }
            }
            return out;
        },
        async set(data) {
            stats.sets++;
            for (const [type, entries] of Object.entries(data)) {
                db[type] = db[type] || {};
                for (const [id, val] of Object.entries(entries)) {
                    if (val === null) delete db[type][id];
                    else db[type][id] = val;
                }
            }
        },
        async transaction(fn) {
            stats.txns++;
            return fn();
        }
    };
};

const silentLogger = () => {
    const noop = () => {};
    return { trace: noop, debug: noop, info: noop, warn: noop, error: noop };
};

test('storeLIDPNMappings persists forward + reverse rows and populates cache', async () => {
    const keys = makeKeys();
    const store = new LIDMappingStore(keys, silentLogger());
    await store.storeLIDPNMappings([{ lid: '88887777@lid', pn: '5511999@s.whatsapp.net' }]);
    // forward row keyed by pn user, reverse row keyed by `${lidUser}_reverse`
    assert.equal(keys.db['lid-mapping']['5511999'], '88887777');
    assert.equal(keys.db['lid-mapping']['88887777_reverse'], '5511999');
});

test('storeLIDPNMappings rejects invalid (non lid<->pn) pairs', async () => {
    const keys = makeKeys();
    const store = new LIDMappingStore(keys, silentLogger());
    // two PNs — neither is a LID, so the pair is invalid and skipped
    await store.storeLIDPNMappings([{ lid: '111@s.whatsapp.net', pn: '222@s.whatsapp.net' }]);
    assert.deepEqual(keys.db['lid-mapping'], {});
});

test('storeLIDPNMappings is idempotent — existing identical mapping skips DB write', async () => {
    const keys = makeKeys();
    const store = new LIDMappingStore(keys, silentLogger());
    await store.storeLIDPNMappings([{ lid: '88887777@lid', pn: '5511999@s.whatsapp.net' }]);
    const txnsAfterFirst = keys.stats.txns;
    await store.storeLIDPNMappings([{ lid: '88887777@lid', pn: '5511999@s.whatsapp.net' }]);
    assert.equal(keys.stats.txns, txnsAfterFirst, 'no second transaction for identical mapping');
});

test('getLIDForPN resolves device 0 with no device suffix', async () => {
    const keys = makeKeys();
    const store = new LIDMappingStore(keys, silentLogger());
    await store.storeLIDPNMappings([{ lid: '88887777@lid', pn: '5511999@s.whatsapp.net' }]);
    assert.equal(await store.getLIDForPN('5511999@s.whatsapp.net'), '88887777@lid');
});

test('getLIDForPN preserves device separation (pn:3 -> lid:3)', async () => {
    const keys = makeKeys();
    const store = new LIDMappingStore(keys, silentLogger());
    await store.storeLIDPNMappings([{ lid: '88887777@lid', pn: '5511999@s.whatsapp.net' }]);
    assert.equal(await store.getLIDForPN('5511999:3@s.whatsapp.net'), '88887777:3@lid');
});

test('getLIDForPN returns null for unknown PN with no USync func', async () => {
    const keys = makeKeys();
    const store = new LIDMappingStore(keys, silentLogger());
    assert.equal(await store.getLIDForPN('40404040@s.whatsapp.net'), null);
});

test('getPNForLID resolves via reverse mapping (always device-qualified)', async () => {
    const keys = makeKeys();
    const store = new LIDMappingStore(keys, silentLogger());
    await store.storeLIDPNMappings([{ lid: '88887777@lid', pn: '5511999@s.whatsapp.net' }]);
    assert.equal(await store.getPNForLID('88887777@lid'), '5511999:0@s.whatsapp.net');
});

test('getPNForLID resolves HOSTED LID companion (@hosted.lid) — JAP@Fix reverse path', async () => {
    const keys = makeKeys();
    const store = new LIDMappingStore(keys, silentLogger());
    await store.storeLIDPNMappings([{ lid: '88887777@lid', pn: '5511999@s.whatsapp.net' }]);
    // hosted companion shares the same lid user; reverse path must NOT skip it
    assert.equal(await store.getPNForLID('88887777@hosted.lid'), '5511999:0@hosted');
});

test('getPNForLID returns null for unmapped LID', async () => {
    const keys = makeKeys();
    const store = new LIDMappingStore(keys, silentLogger());
    assert.equal(await store.getPNForLID('99990000@lid'), null);
});

test('reverse lookup survives a cold cache (reads *_reverse row from DB)', async () => {
    const keys = makeKeys();
    const store = new LIDMappingStore(keys, silentLogger());
    await store.storeLIDPNMappings([{ lid: '88887777@lid', pn: '5511999@s.whatsapp.net' }]);
    store.close(); // clears the in-memory LRU, forcing a DB read
    assert.equal(await store.getPNForLID('88887777@lid'), '5511999:0@s.whatsapp.net');
});

test('USync fallback: pnToLIDFunc fills a missing mapping and result is persisted', async () => {
    const keys = makeKeys();
    let calls = 0;
    const pnToLID = async (_jids) => {
        calls++;
        return [{ lid: '77776666@lid', pn: '5522888@s.whatsapp.net' }];
    };
    const store = new LIDMappingStore(keys, silentLogger(), pnToLID);
    const lid = await store.getLIDForPN('5522888@s.whatsapp.net');
    assert.equal(lid, '77776666@lid');
    assert.equal(calls, 1, 'USync consulted once');
    // subsequent lookup is served from cache/DB, no extra USync call
    await store.getLIDForPN('5522888@s.whatsapp.net');
    assert.equal(calls, 1, 'no redundant USync fetch after mapping is stored');
});

test('in-flight coalescing: concurrent identical getLIDsForPNs share one USync fetch', async () => {
    const keys = makeKeys();
    let calls = 0;
    const pnToLID = async (_jids) => {
        calls++;
        await new Promise(r => setTimeout(r, 20));
        return [{ lid: '12341234@lid', pn: '5599000@s.whatsapp.net' }];
    };
    const store = new LIDMappingStore(keys, silentLogger(), pnToLID);
    const [a, b] = await Promise.all([
        store.getLIDsForPNs(['5599000@s.whatsapp.net']),
        store.getLIDsForPNs(['5599000@s.whatsapp.net'])
    ]);
    assert.deepEqual(a, b);
    assert.equal(calls, 1, 'duplicate concurrent requests coalesced into a single fetch');
});

test('empty input short-circuits to null', async () => {
    const keys = makeKeys();
    const store = new LIDMappingStore(keys, silentLogger());
    assert.equal(await store.getLIDsForPNs([]), null);
    assert.equal(await store.getPNsForLIDs([]), null);
});
