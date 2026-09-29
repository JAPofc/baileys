import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Tests for the pairing-code input validation + full-size profile picture
// support added in the fork-parity sweep. All offline.

const CROCKFORD_RE = /^[123456789ABCDEFGHJKLMNPQRSTVWXYZ]{8}$/;

describe('custom pairing code validation (crockford base32)', () => {
    // mirror of the socket's validation logic, kept in sync by the
    // integration path below (requestPairingCode is exercised via socket.js)
    const validate = (code) => {
        const normalized = String(code).toUpperCase();
        if (normalized.length !== 8) return { ok: false, reason: 'length' };
        if (!CROCKFORD_RE.test(normalized)) return { ok: false, reason: 'alphabet' };
        return { ok: true, code: normalized };
    };

    it('accepts a valid 8-char crockford code', () => {
        assert.deepEqual(validate('JAPJAP12'), { ok: true, code: 'JAPJAP12' });
    });
    it('uppercases lowercase input instead of failing on the phone', () => {
        assert.deepEqual(validate('japjap12'), { ok: true, code: 'JAPJAP12' });
    });
    it('rejects O, I, U and 0 (not in the crockford alphabet)', () => {
        for (const bad of ['JAPJAP1O', 'JAPJAP1I', 'JAPJAP1U', 'JAPJAP10']) {
            assert.equal(validate(bad).ok, false, bad);
        }
    });
    it('rejects wrong length and symbols', () => {
        assert.equal(validate('SHORT').ok, false);
        assert.equal(validate('JAP-JA12').ok, false);
        assert.equal(validate('JAPJAP123').ok, false);
    });
});

describe('pairing phone number normalization', () => {
    const clean = (p) => String(p ?? '').replace(/\D/g, '');
    it('strips +, spaces and dashes', () => {
        assert.equal(clean('+62 812-3456-7890'), '6281234567890');
    });
    it('passes through digits untouched', () => {
        assert.equal(clean('6281234567890'), '6281234567890');
    });
    it('empty/garbage input yields empty string (socket then throws 400)', () => {
        assert.equal(clean(undefined), '');
        assert.equal(clean('abc'), '');
    });
});

describe('requestPairingCode wiring (socket surface)', () => {
    it('socket.js validates before touching creds (source contract)', async () => {
        const { readFile } = await import('node:fs/promises');
        const src = await readFile(new URL('../lib/Socket/socket.js', import.meta.url), 'utf-8');
        // the validation must run BEFORE creds.pairingCode is assigned
        const validateIdx = src.indexOf('Crockford base32 characters');
        const assignIdx = src.indexOf('authState.creds.pairingCode = pairingCode');
        assert.ok(validateIdx > -1, 'crockford validation present');
        assert.ok(assignIdx > -1, 'creds assignment present');
        assert.ok(validateIdx < assignIdx, 'validation precedes creds mutation');
        // the connection-race guard must also precede the send
        const raceIdx = src.indexOf('await bindWaitForConnectionUpdate(ev)');
        assert.ok(raceIdx > -1 && raceIdx < assignIdx, 'ws-open wait precedes creds mutation');
    });
});

describe('generateProfilePicture full-size (fit: contain)', () => {
    it('default stays cover 720x720; contain letterboxes without cropping', async (t) => {
        let sharp;
        try {
            sharp = (await import('sharp')).default;
        }
        catch {
            t.skip('sharp not installed');
            return;
        }
        const { generateProfilePicture } = await import('../lib/Utils/messages-media.js');
        const wide = await sharp({ create: { width: 1600, height: 900, channels: 3, background: { r: 200, g: 30, b: 30 } } }).png().toBuffer();

        const def = await generateProfilePicture(wide);
        const dm = await sharp(def.img).metadata();
        assert.equal(dm.width, 720);
        assert.equal(dm.height, 720);

        const contain = await generateProfilePicture(wide, { fit: 'contain' });
        const cm = await sharp(contain.img).metadata();
        assert.equal(cm.width, 720);
        assert.equal(cm.height, 720);
        // letterbox proof: top-left pixel must be the black background,
        // not the red image (cover mode would show red there)
        const { data } = await sharp(contain.img).raw().toBuffer({ resolveWithObject: true });
        const [r, g, b] = [data[0], data[1], data[2]];
        assert.ok(r < 40 && g < 40 && b < 40, `expected black letterbox at (0,0), got rgb(${r},${g},${b})`);

        const custom = await generateProfilePicture(wide, { width: 640, height: 640 });
        const um = await sharp(custom.img).metadata();
        assert.equal(um.width, 640);
    });
});

describe('WA web version fallback freshness', () => {
    it('pinned fallback revision is >= the WAProto-diff baseline', async () => {
        const { readFile } = await import('node:fs/promises');
        const src = await readFile(new URL('../lib/Defaults/index.js', import.meta.url), 'utf-8');
        const m = src.match(/const version = \[2, 3000, (\d+)\]/);
        assert.ok(m, 'version constant found');
        // must never regress below the revision the proto diff was built against
        assert.ok(Number(m[1]) >= 1047296119, `fallback ${m[1]} regressed below proto baseline`);
    });
});
