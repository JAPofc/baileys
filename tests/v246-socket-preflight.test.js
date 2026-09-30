// Tests for validateSocketConfig (socket-preflight) — previously uncovered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSocketConfig } from '../lib/Utils/socket-preflight.js';

const validAuth = () => ({ creds: {}, keys: { get() {}, set() {} } });
const base = (over = {}) => ({ auth: validAuth(), ...over });

test('a well-formed config passes with no errors or warnings', () => {
    const r = validateSocketConfig(base({
        version: [2, 3000, 1048680055],
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
        connectTimeoutMs: 20000,
        logger: { child() {} }
    }));
    assert.equal(r.ok, true);
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.warnings, []);
});

test('missing auth is a hard error', () => {
    const r = validateSocketConfig({});
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes('auth is missing')));
});

test('missing auth.creds is flagged (passed {state,saveCreds} by mistake)', () => {
    const r = validateSocketConfig({ auth: { keys: { get() {}, set() {} } } });
    assert.ok(r.errors.some((e) => e.includes('auth.creds is missing')));
});

test('auth.keys must expose get() and set()', () => {
    assert.ok(validateSocketConfig({ auth: { creds: {}, keys: { get() {} } } })
        .errors.some((e) => e.includes('auth.keys must expose')));
    assert.ok(validateSocketConfig({ auth: { creds: {}, keys: {} } })
        .errors.some((e) => e.includes('auth.keys must expose')));
});

test('version validation: array shape and legacy warning', () => {
    assert.ok(validateSocketConfig(base({ version: [2, 3000] }))
        .errors.some((e) => e.includes('3 integers')));
    assert.ok(validateSocketConfig(base({ version: [2, 3000, 1.5] }))
        .errors.some((e) => e.includes('3 integers')));
    assert.ok(validateSocketConfig(base({ version: [2, 2000, 1] }))
        .warnings.some((w) => w.includes('retired legacy')));
    assert.equal(validateSocketConfig(base({ version: 'auto' })).ok, true);
    assert.equal(validateSocketConfig(base({ version: undefined })).ok, true);
});

test('browser tuple validation + retired WIN32 warning', () => {
    assert.ok(validateSocketConfig(base({ browser: ['x', 'y'] }))
        .errors.some((e) => e.includes('tuple of 3')));
    assert.ok(validateSocketConfig(base({ browser: ['Mac OS', 'Safari', 'WIN32'] }))
        .warnings.some((w) => w.includes('WIN32')));
});

test('syncFullHistory warns for non-Desktop identities only', () => {
    assert.ok(validateSocketConfig(base({ syncFullHistory: true, browser: ['Ubuntu', 'Chrome', '1'] }))
        .warnings.some((w) => w.includes('syncFullHistory')));
    assert.ok(!validateSocketConfig(base({ syncFullHistory: true, browser: ['Mac OS', 'Safari', '1'] }))
        .warnings.some((w) => w.includes('syncFullHistory')));
    assert.ok(!validateSocketConfig(base({ syncFullHistory: true, browser: ['Windows', 'Desktop', '1'] }))
        .warnings.some((w) => w.includes('syncFullHistory')));
});

test('sub-1000ms timeouts warn about ms-vs-seconds confusion', () => {
    for (const key of ['connectTimeoutMs', 'defaultQueryTimeoutMs', 'keepAliveIntervalMs']) {
        const r = validateSocketConfig(base({ [key]: 20 }));
        assert.ok(r.warnings.some((w) => w.includes(key)), `${key} should warn`);
    }
    // null / undefined / >=1000 do not warn
    assert.deepEqual(validateSocketConfig(base({ connectTimeoutMs: null })).warnings, []);
    assert.deepEqual(validateSocketConfig(base({ connectTimeoutMs: 5000 })).warnings, []);
});

test('logger must be pino-compatible (needs .child)', () => {
    assert.ok(validateSocketConfig(base({ logger: {} }))
        .errors.some((e) => e.includes('pino-compatible')));
    assert.equal(validateSocketConfig(base({ logger: { child() {} } })).ok, true);
});

test('no-arg call does not throw and reports missing auth', () => {
    const r = validateSocketConfig();
    assert.equal(r.ok, false);
    assert.ok(Array.isArray(r.errors) && Array.isArray(r.warnings));
});
