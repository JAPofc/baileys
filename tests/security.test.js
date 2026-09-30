import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
    encryptJSON, decryptJSON, isEncryptedPayload, ENC_MAGIC,
    useEncryptedFileAuthState, useEncryptedSingleFileAuthState,
    backupAuthState, restoreAuthState,
    writeAuthIntegrity, verifyAuthIntegrity,
    repairAuthState,
    createRateLimiter, withPairingGuard,
    createQRGuard,
    redactSecrets, secureLogger,
    secureLogout,
    useMultiFileAuthState, useSingleFileAuthState,
    initAuthCreds, makeCacheableSignalKeyStore, BufferJSON
} from '../lib/Utils/index.js';
import { proto } from '../WAProto/index.js';

const mkTmp = (p) => fs.mkdtemp(join(tmpdir(), p));
const PW = 'correct horse battery staple';

// ---------------------------------------------------------------- (1) crypto
describe('security: encryptJSON/decryptJSON', () => {
    it('round-trips objects incl. Buffers', () => {
        const v = { a: 1, buf: Buffer.from([1, 2, 3]), nested: { x: 'y' } };
        const enc = encryptJSON(v, PW);
        assert.ok(enc.startsWith(ENC_MAGIC + '.'));
        assert.deepEqual(decryptJSON(enc, PW), v);
    });
    it('same input → different ciphertext (random salt+iv)', () => {
        assert.notEqual(encryptJSON({ a: 1 }, PW), encryptJSON({ a: 1 }, PW));
    });
    it('wrong password throws', () => {
        assert.throws(() => decryptJSON(encryptJSON({ a: 1 }, PW), 'nope'), /decryption failed/);
    });
    it('tampered ciphertext/tag/salt throws', () => {
        const enc = encryptJSON({ a: 1 }, PW).split('.');
        for (const i of [1, 3, 4]) {
            const parts = [...enc];
            parts[i] = parts[i].slice(0, -2) + (parts[i].endsWith('AA') ? 'BB' : 'AA');
            assert.throws(() => decryptJSON(parts.join('.'), PW), /decryption failed|malformed/, `part ${i}`);
        }
    });
    it('malformed payloads rejected', () => {
        for (const bad of ['', 'nope', ENC_MAGIC + '.a.b', 'plaintext json {"a":1}']) {
            assert.throws(() => decryptJSON(bad, PW), /not a JAP|malformed/);
        }
        assert.equal(isEncryptedPayload('{"a":1}'), false);
    });
});

// ------------------------------------------------- (1) encrypted auth states
describe('security: encrypted auth-state backends', () => {
    it('multi-file: save/load roundtrip, files encrypted at rest', async () => {
        const dir = await mkTmp('jap-enc-multi-');
        const { state, saveCreds } = await useEncryptedFileAuthState(dir, { password: PW });
        state.creds.me = { id: '123@s.whatsapp.net', name: 'T' };
        await state.keys.set({ session: { 'abc': { x: 1 } } });
        await saveCreds();
        const rawCreds = await fs.readFile(join(dir, 'creds.json'), 'utf8');
        assert.ok(isEncryptedPayload(rawCreds.trim()), 'creds.json must be encrypted');
        assert.ok(!rawCreds.includes('whatsapp'), 'no plaintext secrets on disk');
        const rawSess = await fs.readFile(join(dir, 'session-abc.json'), 'utf8');
        assert.ok(isEncryptedPayload(rawSess.trim()));
        // reload with same password
        const re = await useEncryptedFileAuthState(dir, { password: PW });
        assert.equal(re.state.creds.me.id, '123@s.whatsapp.net');
        assert.deepEqual((await re.state.keys.get('session', ['abc'])).abc, { x: 1 });
        // missing key → null (upstream convention)
        assert.equal((await re.state.keys.get('session', ['zzz'])).zzz, null);
        // key removal
        await re.state.keys.set({ session: { abc: null } });
        await assert.rejects(fs.stat(join(dir, 'session-abc.json')));
    });
    it('multi-file: migrates legacy plaintext transparently', async () => {
        const dir = await mkTmp('jap-enc-mig-');
        const legacy = initAuthCreds();
        legacy.me = { id: '9@s.whatsapp.net', name: 'L' };
        await fs.writeFile(join(dir, 'creds.json'), JSON.stringify(legacy, BufferJSON.replacer));
        const { state, saveCreds } = await useEncryptedFileAuthState(dir, { password: PW });
        assert.equal(state.creds.me.id, '9@s.whatsapp.net');
        await saveCreds();
        assert.ok(isEncryptedPayload((await fs.readFile(join(dir, 'creds.json'), 'utf8')).trim()));
    });
    it('multi-file: wrong password REFUSES to open (protects the real session)', async () => {
        const dir = await mkTmp('jap-enc-wrong-');
        const s1 = await useEncryptedFileAuthState(dir, { password: PW });
        s1.state.creds.me = { id: '1@s.whatsapp.net', name: 'X' };
        await s1.saveCreds();
        // A wrong password must throw — NOT mint fresh creds that would
        // overwrite the real session on the next saveCreds().
        await assert.rejects(useEncryptedFileAuthState(dir, { password: 'wrong', logger: { warn() {} } }), /cannot decrypt creds\.json|wrong password/);
        // the real session survives untouched and still opens with the right password
        const s2 = await useEncryptedFileAuthState(dir, { password: PW });
        assert.equal(s2.state.creds.me.id, '1@s.whatsapp.net');
        await s2.clearState();
        assert.deepEqual(await fs.readdir(dir), []);
    });
    it('single-file: roundtrip + debounce flush', async () => {
        const dir = await mkTmp('jap-enc-single-');
        const file = join(dir, 'auth.json');
        const s1 = await useEncryptedSingleFileAuthState(file, { password: PW });
        assert.equal(s1.state.creds.registered, false);
        await s1.state.keys.set({ 'sender-key': { 'g1': { k: 2 } } });
        await s1.flush();
        assert.ok(isEncryptedPayload((await fs.readFile(file, 'utf8')).trim()));
        const s2 = await useEncryptedSingleFileAuthState(file, { password: PW });
        assert.deepEqual((await s2.state.keys.get('sender-key', ['g1'])).g1, { k: 2 });
        await s2.clearState();
        assert.deepEqual((await s2.state.keys.get('sender-key', ['g1'])).g1, undefined);
    });
    it('password is required', async () => {
        await assert.rejects(useEncryptedFileAuthState(await mkTmp('x-'), {}), /password/);
        await assert.rejects(useEncryptedSingleFileAuthState(join(await mkTmp('y-'), 'a.json'), {}), /password/);
    });
});

// ------------------------------------------------------- (6) backup/restore
describe('security: encrypted backup/restore', () => {
    it('folder → blob → folder roundtrip', async () => {
        const src = await mkTmp('jap-bak-src-');
        const s = await useEncryptedFileAuthState(src, { password: PW });
        s.state.creds.me = { id: '5@s.whatsapp.net', name: 'B' };
        await s.state.keys.set({ session: { s1: { v: 1 } } });
        await s.saveCreds();
        const blob = join(await mkTmp('jap-bak-'), 'b.jabackup');
        const info = await backupAuthState(src, blob, { password: 'bakpw' });
        assert.equal(info.files, 2);
        assert.ok(!(await fs.readFile(blob, 'utf8')).includes('whatsapp'));
        const dst = join(await mkTmp('jap-restore-'), 'auth');
        const r = await restoreAuthState(blob, dst, { password: 'bakpw' });
        assert.equal(r.files, 2);
        const re = await useEncryptedFileAuthState(dst, { password: PW });
        assert.equal(re.state.creds.me.id, '5@s.whatsapp.net');
    });
    it('single-file backup → single-file restore', async () => {
        const dir = await mkTmp('jap-bak1-');
        const file = join(dir, 'auth.json');
        const s1 = await useEncryptedSingleFileAuthState(file, { password: PW });
        s1.state.creds.pairingCode = 'should-stay-secret';
        await s1.flush();
        const blob = join(dir, 'b.jabackup');
        await backupAuthState(file, blob, { password: 'bakpw' });
        const dst = join(dir, 'restored.json');
        await restoreAuthState(blob, dst, { password: 'bakpw', single: true });
        const s2 = await useEncryptedSingleFileAuthState(dst, { password: PW });
        assert.equal(s2.state.creds.pairingCode, 'should-stay-secret');
    });
    it('wrong backup password / bad magic fails', async () => {
        const dir = await mkTmp('jap-bakbad-');
        await fs.writeFile(join(dir, 'creds.json'), '{}');
        const blob = join(dir, 'b.jabackup');
        await backupAuthState(dir, blob, { password: 'bakpw' });
        await assert.rejects(restoreAuthState(blob, join(dir, 'o'), { password: 'no' }), /decryption failed/);
        await fs.writeFile(join(dir, 'fake.jabackup'), '{"magic":"NOPE"}');
        await assert.rejects(restoreAuthState(join(dir, 'fake.jabackup'), join(dir, 'o2'), { password: 'x' }), /not a JAP auth backup/);
    });
});

// ---------------------------------------------------------------- (8) integrity
describe('security: integrity snapshots', () => {
    it('write → verify ok → tamper detected → missing detected', async () => {
        const dir = await mkTmp('jap-int-');
        await fs.writeFile(join(dir, 'creds.json'), '{"a":1}');
        await fs.writeFile(join(dir, 'session-x.json'), '{"b":2}');
        await writeAuthIntegrity(dir);
        assert.deepEqual((await verifyAuthIntegrity(dir)).ok, true);
        await fs.writeFile(join(dir, 'session-x.json'), '{"b":3}');
        let v = await verifyAuthIntegrity(dir);
        assert.equal(v.ok, false);
        assert.deepEqual(v.mismatched, ['session-x.json']);
        await fs.unlink(join(dir, 'session-x.json'));
        v = await verifyAuthIntegrity(dir);
        assert.deepEqual(v.missing, ['session-x.json']);
        await fs.writeFile(join(dir, 'session-new.json'), '{}');
        v = await verifyAuthIntegrity(dir);
        assert.deepEqual(v.extra, ['session-new.json']);
    });
    it('HMAC mode requires the secret', async () => {
        const dir = await mkTmp('jap-inth-');
        await fs.writeFile(join(dir, 'creds.json'), '{}');
        await writeAuthIntegrity(dir, { secret: 's3cr3t' });
        assert.equal((await verifyAuthIntegrity(dir, { secret: 's3cr3t' })).ok, true);
        assert.equal((await verifyAuthIntegrity(dir)).ok, false);
        assert.equal((await verifyAuthIntegrity(dir, { secret: 'wrong' })).ok, false);
    });
    it('no snapshot → ok:false', async () => {
        assert.equal((await verifyAuthIntegrity(await mkTmp('jap-int0-'))).ok, false);
    });
});

// ------------------------------------------------------------------- (9) repair
describe('security: corruption repair', () => {
    it('quarantines corrupt files, restores creds from backup', async () => {
        const dir = await mkTmp('jap-rep-');
        const s = await useEncryptedFileAuthState(dir, { password: PW });
        s.state.creds.me = { id: '7@s.whatsapp.net', name: 'R' };
        await s.state.keys.set({ session: { good: { v: 1 } } });
        await s.saveCreds();
        const blob = join(dir, '..', 'r.jabackup');
        await backupAuthState(dir, blob, { password: 'bakpw' });
        // corrupt creds + one session
        await fs.writeFile(join(dir, 'creds.json'), 'NOT JSON{{{');
        await fs.writeFile(join(dir, 'session-bad.json'), encryptJSON({ a: 1 }, 'other-password'));
        const rep = await repairAuthState(dir, { password: PW, backupFile: blob, backupPassword: 'bakpw' });
        assert.equal(rep.ok, true);
        assert.deepEqual(rep.quarantined.sort(), ['creds.json', 'session-bad.json']);
        assert.equal(rep.credsRestored, true);
        const re = await useEncryptedFileAuthState(dir, { password: PW });
        assert.equal(re.state.creds.me.id, '7@s.whatsapp.net');
        // quarantined copies preserved, originals handled
        const files = await fs.readdir(dir);
        assert.ok(files.some((f) => f.startsWith('.corrupt-') && f.endsWith('creds.json')));
        assert.deepEqual((await re.state.keys.get('session', ['good'])).good, { v: 1 });
    });
    it('healthy folder → no-op; missing creds without backup → ok:false', async () => {
        const dir = await mkTmp('jap-repok-');
        await fs.writeFile(join(dir, 'creds.json'), '{}');
        const rep = await repairAuthState(dir);
        assert.equal(rep.ok, true);
        assert.deepEqual(rep.quarantined, []);
        const dir2 = await mkTmp('jap-repno-');
        await fs.writeFile(join(dir2, 'creds.json'), '{{{broken');
        const rep2 = await repairAuthState(dir2);
        assert.equal(rep2.ok, false);
        assert.match(rep2.error, /re-pair/);
    });
});

// ------------------------------------------------- (2) rate limit + pairing guard
describe('security: rate limiter + pairing guard', () => {
    it('sliding window allow/block/reset', () => {
        let t = 1_000_000;
        const rl = createRateLimiter({ max: 2, windowMs: 1000, now: () => t });
        assert.equal(rl.check('a').allowed, true);
        assert.equal(rl.check('a').allowed, true);
        const blocked = rl.check('a');
        assert.equal(blocked.allowed, false);
        assert.ok(blocked.retryAfterMs > 0);
        assert.equal(rl.check('b').allowed, true); // per-key isolation
        t += 1001;
        assert.equal(rl.check('a').allowed, true); // window slid
        assert.deepEqual(rl.stats, { allowed: 4, blocked: 1 });
        rl.reset('a');
        assert.equal(rl.check('a').allowed, true);
    });
    it('min-interval (anti-burst) enforced', () => {
        let t = 0;
        const rl = createRateLimiter({ max: 100, windowMs: 60_000, minIntervalMs: 5000, now: () => t });
        assert.equal(rl.check().allowed, true);
        t += 1000;
        const b = rl.check();
        assert.equal(b.allowed, false);
        assert.equal(b.retryAfterMs, 4000);
        t += 4000;
        assert.equal(rl.check().allowed, true);
    });
    it('withPairingGuard wraps sock.requestPairingCode', async () => {
        let t = 0;
        let calls = 0;
        const sock = { requestPairingCode: async (pn) => { calls++; return 'CODE-' + pn; } };
        const g = withPairingGuard(sock, { maxPerHour: 2, minIntervalMs: 1000, now: () => t });
        assert.equal(await sock.requestPairingCode('111'), 'CODE-111');
        t += 1001;
        assert.equal(await sock.requestPairingCode('111'), 'CODE-111');
        t += 1001;
        await assert.rejects(sock.requestPairingCode('111'), /rate limited/);
        assert.equal(calls, 2);
        t += 3_600_001;
        assert.equal(await sock.requestPairingCode('111'), 'CODE-111');
        g.restore();
        t += 1;
        assert.equal(await sock.requestPairingCode('111'), 'CODE-111'); // unwrapped
        assert.equal(calls, 4);
    });
    it('withPairingGuard requires requestPairingCode', () => {
        assert.throws(() => withPairingGuard({}), /requestPairingCode/);
    });
});

// ---------------------------------------------------------------- (3) QR guard
describe('security: QR guard', () => {
    it('first passes, repeats swallowed, ttl re-arms', () => {
        let t = 0;
        let firsts = 0;
        const g = createQRGuard({ ttlMs: 1000, now: () => t, onFirst: () => firsts++ });
        assert.equal(g.handle('QR1'), 'QR1');
        assert.equal(g.handle('QR1-NEW'), null);
        assert.equal(g.active, true);
        assert.deepEqual(g.stats, { passed: 1, blocked: 1 });
        t += 1001;
        assert.equal(g.active, false);
        assert.equal(g.handle('QR2'), 'QR2');
        assert.equal(firsts, 2);
        assert.equal(g.handle(null), null);
        g.reset();
        assert.equal(g.active, false);
    });
});

// ------------------------------------------------- (7) redaction + fuzz (10)
describe('security: secret redaction', () => {
    it('redacts nested secrets, keeps safe fields', () => {
        const input = {
            qr: 'secret-qr', pairingCode: '123-456', password: 'hunter2',
            mediaKey: Buffer.from([1, 2]), signedIdentityKey: { x: 1 },
            nested: { authToken: 'tok', list: [{ apiKey: 'k' }] },
            safe: 'visible', count: 3, jid: '1@s.whatsapp.net'
        };
        const out = redactSecrets(input);
        assert.equal(out.qr, '[REDACTED]');
        assert.equal(out.pairingCode, '[REDACTED]');
        assert.equal(out.password, '[REDACTED]');
        assert.equal(out.mediaKey, '[REDACTED]');
        assert.equal(out.signedIdentityKey, '[REDACTED]');
        assert.equal(out.nested.authToken, '[REDACTED]');
        assert.equal(out.nested.list[0].apiKey, '[REDACTED]');
        assert.equal(out.safe, 'visible');
        assert.equal(out.count, 3);
        assert.equal(out.jid, '1@s.whatsapp.net');
        assert.equal(input.qr, 'secret-qr'); // no mutation
    });
    it('handles cycles, Buffers, Dates, class instances', () => {
        const cyc = { a: 1 };
        cyc.self = cyc;
        const out = redactSecrets({ cyc, when: new Date(0), buf: Buffer.from([9]), re: /x/ });
        assert.equal(out.cyc.self, out.cyc);
        assert.ok(out.when instanceof Date);
        assert.ok(Buffer.isBuffer(out.buf));
        class K { constructor() { this.privateKey = 's3kret'; } }
        const k = redactSecrets({ k: new K() });
        assert.ok(k.k instanceof K); // untouched (never JSON-serialised anyway)
    });
    it('extraKeys option', () => {
        assert.deepEqual(redactSecrets({ businessId: 'B1' }, { extraKeys: ['businessId'] }), { businessId: '[REDACTED]' });
    });
    it('secureLogger wraps pino-style loggers', () => {
        const lines = [];
        const base = {
            level: 'info',
            info: (o, m) => lines.push([o, m]),
            warn: (o) => lines.push([o]),
            child: (b) => ({ bindings: b, info: (o) => lines.push([o]) })
        };
        const log = secureLogger(base);
        log.info({ qr: 'SHH', ok: 1 }, 'conn');
        assert.deepEqual(lines[0][0], { qr: '[REDACTED]', ok: 1 });
        log.warn('plain string passes');
        assert.equal(lines[1][0], 'plain string passes');
        let childBindings = null;
        base.child = (b) => {
            childBindings = b;
            return { info: (o) => lines.push([o]) };
        };
        const log2 = secureLogger(base);
        log2.child({ apiToken: 'T' });
        assert.deepEqual(childBindings, { apiToken: '[REDACTED]' });
        assert.throws(() => secureLogger(null), /base logger/);
    });
});

describe('security: redaction fuzz (10)', () => {
    const SECRET_KEYS = ['qr', 'pairingCode', 'mediaKey', 'authToken', 'password', 'noiseKey', 'secret', 'api_key'];
    const SAFE_KEYS = ['msg', 'count', 'jid', 'name', 'id', 'text'];
    const rnd = (() => {
        let s = 0xC0FFEE;
        return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    })();
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const randStr = (n) => Array.from({ length: n }, () => 'abcdef0123456789'[Math.floor(rnd() * 16)]).join('');
    function randVal(depth, secrets) {
        const r = rnd();
        if (depth > 3 || r < 0.3)
            return randStr(8);
        if (r < 0.45)
            return Math.floor(rnd() * 1000);
        if (r < 0.6)
            return Array.from({ length: Math.floor(rnd() * 3) }, () => randVal(depth + 1, secrets));
        const o = {};
        for (let i = 0; i < Math.floor(rnd() * 4); i++) {
            if (rnd() < 0.5) {
                const k = pick(SECRET_KEYS);
                const v = 'SECRET-' + randStr(12);
                secrets.push(v);
                o[k] = v;
            } else {
                o[pick(SAFE_KEYS)] = randVal(depth + 1, secrets);
            }
        }
        return o;
    }
    it('200 random nested objects never leak injected secrets', () => {
        for (let i = 0; i < 200; i++) {
            const secrets = [];
            const obj = randVal(0, secrets);
            const red = redactSecrets(obj);
            const blob = JSON.stringify(red);
            for (const s of secrets) {
                assert.ok(!blob.includes(s), `leak of ${s} in ${blob}`);
            }
        }
    });
    it('100 random encrypted payloads never survive as bare strings', () => {
        for (let i = 0; i < 100; i++) {
            const enc = encryptJSON({ v: randStr(16) }, PW);
            const red = redactSecrets({ arr: [enc, 'ok'] });
            assert.ok(!JSON.stringify(red).includes(enc.slice(0, 40)));
        }
    });
});

// ------------------------------------------------------------- (4) secure logout
describe('security: secureLogout', () => {
    it('logs out, wipes files, scrubs creds', async () => {
        const dir = await mkTmp('jap-slogout-');
        await fs.writeFile(join(dir, 'creds.json'), '{"a":1}');
        await fs.writeFile(join(dir, 'session-x.json'), '{"b":2}');
        await fs.writeFile(join(dir, '.corrupt-1-creds.json'), 'junk');
        await fs.writeFile(join(dir, 'keep.txt'), 'txt');
        let logoutMsg = null;
        const sock = {
            logout: async (m) => { logoutMsg = m; },
            authState: { creds: { noiseKey: { x: 1 }, me: { id: '1' }, registered: true } }
        };
        const rep = await secureLogout(sock, { authFolder: dir });
        assert.equal(rep.loggedOut, true);
        assert.ok(logoutMsg.includes('secure'));
        assert.equal(rep.wiped.length, 3);
        assert.deepEqual(await fs.readdir(dir), ['keep.txt']);
        assert.equal(rep.credsScrubbed, true);
        assert.equal(sock.authState.creds.noiseKey, undefined);
        assert.equal(sock.authState.creds.registered, true); // non-secret kept
    });
    it('survives remote-logout failure + single-file mode', async () => {
        const dir = await mkTmp('jap-slogout1-');
        const file = join(dir, 'auth.json');
        await fs.writeFile(file, '{}');
        const sock = { logout: async () => { throw new Error('net down'); } };
        const rep = await secureLogout(sock, { authFile: file, logger: { warn() {} } });
        assert.equal(rep.loggedOut, false);
        assert.equal(rep.wiped.length, 1);
        await assert.rejects(fs.stat(file));
    });
});

// -------------------------------------------- (5) auth/Signal regression (offline)
describe('security: auth/Signal regression', () => {
    it('initAuthCreds shape', () => {
        const c = initAuthCreds();
        for (const k of ['noiseKey', 'pairingEphemeralKeyPair', 'signedIdentityKey', 'signedPreKey', 'registrationId', 'advSecretKey']) {
            assert.ok(c[k], k);
        }
        assert.equal(c.registered, false);
        assert.ok(c.noiseKey.private && c.noiseKey.public);
    });
    it('multi-file backend roundtrip (sessions + app-state key coercion)', async () => {
        const dir = await mkTmp('jap-reg-multi-');
        const { state, saveCreds } = await useMultiFileAuthState(dir);
        state.creds.me = { id: '2@s.whatsapp.net', name: 'R' };
        const syncKey = proto.Message.AppStateSyncKeyData.fromObject({ keyData: Buffer.from([7, 7]), fingerprint: { currentIndex: 1 } });
        await state.keys.set({
            session: { 'a@s.whatsapp.net': { counter: 5 } },
            'app-state-sync-key': { '1': syncKey }
        });
        await saveCreds();
        const re = await useMultiFileAuthState(dir);
        assert.equal(re.state.creds.me.id, '2@s.whatsapp.net');
        assert.deepEqual((await re.state.keys.get('session', ['a@s.whatsapp.net']))['a@s.whatsapp.net'], { counter: 5 });
        const got = (await re.state.keys.get('app-state-sync-key', ['1']))['1'];
        assert.ok(got instanceof proto.Message.AppStateSyncKeyData);
        assert.equal(got.fingerprint.currentIndex, 1);
    });
    it('single-file backend roundtrip', async () => {
        const file = join(await mkTmp('jap-reg-single-'), 'auth.json');
        const s1 = await useSingleFileAuthState(file);
        await s1.state.keys.set({ 'sender-key': { g: { v: 9 } } });
        s1.state.creds.pairingCode = '111-222';
        await s1.saveCreds();
        await new Promise((r) => setTimeout(r, 3500)); // upstream debounced flush (3s)
        const s2 = await useSingleFileAuthState(file);
        assert.deepEqual((await s2.state.keys.get('sender-key', ['g'])).g, { v: 9 });
        assert.equal(s2.state.creds.pairingCode, '111-222');
    });
    it('cacheable Signal key store wraps backend', async () => {
        const dir = await mkTmp('jap-reg-cache-');
        const { state } = await useMultiFileAuthState(dir);
        const silent = { level: 'silent', trace() {}, debug() {}, info() {}, warn() {}, error() {}, child() { return silent; } };
        const cached = makeCacheableSignalKeyStore(state.keys, silent);
        await cached.set({ session: { x: { n: 1 } } });
        assert.deepEqual((await cached.get('session', ['x'])).x, { n: 1 });
        await cached.set({ session: { x: null } });
        assert.ok((await cached.get('session', ['x'])).x == null);
    });
});
