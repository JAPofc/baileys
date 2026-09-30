import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pino from 'pino';
import jsQR from 'jsqr';
import {
    qrToMatrix, renderQRToTerminal, qrToSVG, formatPairingCode,
    buildPairingQRData,
    makeWASocket, initAuthCreds,
} from '../lib/index.js';

// Rasterize the boolean matrix and decode with an independent decoder (jsQR)
// so the vendored qrcodegen engine is verified end-to-end, not self-attested.
const decodeMatrix = (matrix, scale = 4) => {
    const size = matrix.length * scale;
    const data = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            const v = matrix[(y / scale) | 0][(x / scale) | 0] ? 0 : 255;
            const i = (y * size + x) * 4;
            data[i] = data[i + 1] = data[i + 2] = v;
            data[i + 3] = 255;
        }
    }
    return jsQR(data, size, size)?.data ?? null;
};

const waPayload = () => buildPairingQRData(
    '2@AbCdEfGhIjKlMnOpQrStUvWxYz0123456789+/=',
    Buffer.from('noise-key-32-bytes-xxxxxxxxxxxxx').toString('base64'),
    Buffer.from('identity-key-32-bytes-xxxxxxxxxx').toString('base64'),
    Buffer.from('adv-secret-key-32-bytes-xxxxxxxx').toString('base64'),
    ['Chrome (Linux)', 'Chrome', '110.0.0.0'],
);

describe('qr: vendored engine round-trip', () => {
    it('encodes a real WA pairing payload that an independent decoder reads back', () => {
        const payload = waPayload();
        assert.equal(decodeMatrix(qrToMatrix(payload)), payload);
    });
    it('encodes short text and each ECC level', () => {
        for (const ecc of ['L', 'M', 'Q', 'H']) {
            assert.equal(decodeMatrix(qrToMatrix('wa.me/test', { ecc })), 'wa.me/test');
        }
    });
    it('quiet zone and matrix geometry are correct', () => {
        const m = qrToMatrix('hello', { quietZone: 3 });
        assert.equal(m.length, m[0].length, 'square');
        // quiet zone rows/cols must be all-light
        assert.ok(m[0].every((c) => c === false));
        assert.ok(m.map((r) => r[0]).every((c) => c === false));
        // top-left finder center (offset by quiet zone) must be dark
        assert.equal(m[3 + 3][3 + 3], true);
    });
    it('rejects empty input', () => {
        assert.throws(() => qrToMatrix(''), /non-empty/);
    });
});

describe('qr: renderers', () => {
    it('terminal half-block output has half the rows and full width', () => {
        const m = qrToMatrix('wa.me/test');
        const lines = renderQRToTerminal('wa.me/test').split('\n');
        assert.equal(lines.length, Math.ceil(m.length / 2));
        assert.ok(lines.every((l) => [...l].length === m.length));
        assert.match(lines.join(''), /[▀▄█]/);
    });
    it('full-block mode doubles width; inverted flips glyphs', () => {
        const m = qrToMatrix('wa.me/test');
        const lines = renderQRToTerminal('wa.me/test', { small: false }).split('\n');
        assert.equal(lines.length, m.length);
        assert.ok(lines.every((l) => [...l].length === m.length * 2));
        const norm = renderQRToTerminal('wa.me/test');
        const inv = renderQRToTerminal('wa.me/test', { inverted: true });
        assert.notEqual(norm, inv);
        assert.equal(norm.length, inv.length);
    });
    it('SVG contains one path cell per dark module', () => {
        const m = qrToMatrix('wa.me/test');
        const dark = m.flat().filter(Boolean).length;
        const svg = qrToSVG('wa.me/test');
        assert.ok(svg.startsWith('<?xml'));
        assert.equal((svg.match(/h1v1h-1z/g) ?? []).length, dark);
        assert.match(svg, new RegExp(`viewBox="0 0 ${m.length} ${m.length}"`));
    });
    it('formatPairingCode groups 8-char codes and passes others through', () => {
        assert.equal(formatPairingCode('JAPJAPAP'), 'JAPJ-APAP');
        assert.equal(formatPairingCode('ABC'), 'ABC');
        assert.equal(formatPairingCode(undefined), '');
    });
});

describe('qr: printQRInTerminal wiring', () => {
    it('prints a QR to console when a connection.update carries one', async () => {
        const keys = { get: async () => ({}), set: async () => { } };
        const sock = makeWASocket({
            auth: { creds: initAuthCreds(), keys },
            logger: pino({ level: 'silent' }),
            printQRInTerminal: true,
        });
        sock.ws?.on?.('error', () => { });
        const captured = [];
        const origLog = console.log;
        console.log = (...args) => { captured.push(args.join(' ')); };
        try {
            sock.ev.emit('connection.update', { qr: waPayload() });
            await new Promise((r) => setImmediate(r));
        }
        finally {
            console.log = origLog;
            await sock.end();
        }
        const out = captured.join('\n');
        assert.match(out, /[▀▄█]/, 'QR blocks must be printed');
        assert.match(out, /Linked devices/);
    });
    it('stays silent without the flag', async () => {
        const keys = { get: async () => ({}), set: async () => { } };
        const sock = makeWASocket({
            auth: { creds: initAuthCreds(), keys },
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
        });
        sock.ws?.on?.('error', () => { });
        const captured = [];
        const origLog = console.log;
        console.log = (...args) => { captured.push(args.join(' ')); };
        try {
            sock.ev.emit('connection.update', { qr: waPayload() });
            await new Promise((r) => setImmediate(r));
        }
        finally {
            console.log = origLog;
            await sock.end();
        }
        assert.equal(captured.length, 0);
    });
});
