// Tests for the v2.4.6 decrypt-failure log rate-limiter (mitigates the log-flood
// / heap-exhaustion pattern from WhiskeySockets/Baileys#2234) and its opt-in
// wiring into decryptMessageNode.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proto } from '../WAProto/index.js';
import { createDecryptFailureTracker, resolveDecryptFailureTracker, decryptMessageNode } from '../lib/Utils/index.js';
import { DEFAULT_CONNECTION_CONFIG } from '../lib/Defaults/index.js';

test('decrypt-failure log rate-limiting is enabled by default in the socket config', () => {
    assert.deepEqual(DEFAULT_CONNECTION_CONFIG.decryptFailureLog, { windowMs: 60000, maxPerWindow: 5 });
    // the default config resolves to a real tracker (not disabled)
    assert.ok(resolveDecryptFailureTracker(DEFAULT_CONNECTION_CONFIG.decryptFailureLog));
});

// ── pure tracker ────────────────────────────────────────────────────────────

test('logs up to maxPerWindow per key, then suppresses', () => {
    const tr = createDecryptFailureTracker({ maxPerWindow: 3, windowMs: 1000, now: () => 0 });
    const results = Array.from({ length: 6 }, () => tr.hit('sessionA').log);
    assert.deepEqual(results, [true, true, true, false, false, false]);
    assert.equal(tr.suppressedFor('sessionA'), 3);
});

test('separate keys have independent budgets', () => {
    const tr = createDecryptFailureTracker({ maxPerWindow: 1, windowMs: 1000, now: () => 0 });
    assert.equal(tr.hit('A').log, true);
    assert.equal(tr.hit('A').log, false);
    assert.equal(tr.hit('B').log, true, 'key B unaffected by key A');
});

test('a new window resets the budget and reports the previous window backlog', () => {
    let t = 0;
    const tr = createDecryptFailureTracker({ maxPerWindow: 2, windowMs: 1000, now: () => t });
    tr.hit('A'); tr.hit('A');            // 2 logged
    tr.hit('A'); tr.hit('A'); tr.hit('A'); // 3 suppressed
    assert.equal(tr.suppressedFor('A'), 3);
    t = 1000; // roll into next window
    const first = tr.hit('A');
    assert.equal(first.log, true, 'budget resets');
    assert.equal(first.suppressedSincePrevWindow, 3, 'reports the suppressed backlog once');
    const second = tr.hit('A');
    assert.equal(second.suppressedSincePrevWindow, 0, 'only reported once');
});

test('validates options', () => {
    assert.throws(() => createDecryptFailureTracker({ windowMs: 0 }), /windowMs/);
    assert.throws(() => createDecryptFailureTracker({ maxPerWindow: -1 }), /maxPerWindow/);
    assert.throws(() => createDecryptFailureTracker({ maxPerWindow: 1.5 }), /maxPerWindow/);
});

test('prunes to the max number of tracked keys', () => {
    const tr = createDecryptFailureTracker({ max: 2, now: () => 0 });
    tr.hit('A'); tr.hit('B'); tr.hit('C');
    assert.ok(tr.size <= 2, 'oldest key pruned');
});

// ── socket config resolution ─────────────────────────────────────────────────

test('resolveDecryptFailureTracker: false disables (unlimited logging)', () => {
    assert.equal(resolveDecryptFailureTracker(false), undefined);
});

test('resolveDecryptFailureTracker: undefined/default yields a working tracker', () => {
    const tr = resolveDecryptFailureTracker(undefined);
    assert.ok(tr && typeof tr.hit === 'function');
    assert.equal(tr.hit('x').log, true);
});

test('resolveDecryptFailureTracker: options object is forwarded', () => {
    const tr = resolveDecryptFailureTracker({ maxPerWindow: 1, windowMs: 1000 });
    assert.equal(tr.hit('x').log, true);
    assert.equal(tr.hit('x').log, false, 'maxPerWindow:1 respected');
});

// ── integration with decryptMessageNode ─────────────────────────────────────

const silentCountingLogger = () => {
    let errors = 0;
    const noop = () => {};
    const l = { trace: noop, debug: noop, info: noop, warn: noop, error: () => { errors++; }, get errors() { return errors; } };
    l.child = () => l;
    return l;
};

const makeStanza = (id) => ({
    attrs: { id, from: '5511999@s.whatsapp.net', addressing_mode: 'pn' }, // no alt form → single attempt
    content: [{ tag: 'enc', attrs: { type: 'msg' }, content: new Uint8Array([1, 2, 3]) }]
});

const failingRepo = () => ({
    lidMapping: { getLIDForPN: async () => null, storeLIDPNMappings: async () => {} },
    migrateSession: async () => {},
    decryptGroupMessage: async () => { throw new Error('nope'); },
    decryptMessage: async () => { throw new Error('Bad MAC'); },
    processSenderKeyDistributionMessage: async () => {}
});

test('tracker suppresses repeated decrypt-failure logs but still stubs every message', async () => {
    const tracker = createDecryptFailureTracker({ maxPerWindow: 2, windowMs: 10_000, now: () => 0 });
    const repo = failingRepo();
    const logger = silentCountingLogger();
    for (let i = 0; i < 5; i++) {
        const node = decryptMessageNode(makeStanza(`M${i}`), '620@s.whatsapp.net', '620@lid', repo, logger, { failureTracker: tracker });
        await node.decrypt();
        // correctness: every failed message is still stubbed as CIPHERTEXT
        assert.equal(node.fullMessage.messageStubType, proto.WebMessageInfo.StubType.CIPHERTEXT);
        assert.deepEqual(node.fullMessage.messageStubParameters, ['Bad MAC']);
    }
    assert.equal(logger.errors, 2, 'only 2 error lines logged for 5 identical failures');
    assert.equal(tracker.suppressedFor('5511999@s.whatsapp.net|msg'), 3);
});

test('without a tracker, behaviour is unchanged (every failure logs)', async () => {
    const repo = failingRepo();
    const logger = silentCountingLogger();
    for (let i = 0; i < 3; i++) {
        const node = decryptMessageNode(makeStanza(`N${i}`), '620@s.whatsapp.net', '620@lid', repo, logger);
        await node.decrypt();
        assert.equal(node.fullMessage.messageStubType, proto.WebMessageInfo.StubType.CIPHERTEXT);
    }
    assert.equal(logger.errors, 3, 'no suppression when no tracker is passed');
});
