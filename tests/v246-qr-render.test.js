// Tests for qr-render (qrToMatrix / qrToSVG / renderQRToTerminal / formatPairingCode).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qrToMatrix, qrToSVG, renderQRToTerminal, formatPairingCode } from '../lib/Utils/qr-render.js';

test('qrToMatrix returns a square boolean matrix including the quiet zone', () => {
    const m = qrToMatrix('hello', { quietZone: 2 });
    assert.ok(Array.isArray(m) && Array.isArray(m[0]));
    assert.equal(typeof m[0][0], 'boolean');
    assert.equal(m.length, m[0].length); // square
    // quiet zone rows/cols on the border are all light (false)
    assert.ok(m[0].every((v) => v === false));
    assert.ok(m[m.length - 1].every((v) => v === false));
});

test('qrToMatrix quiet zone size affects dimensions', () => {
    const a = qrToMatrix('data', { quietZone: 0 });
    const b = qrToMatrix('data', { quietZone: 4 });
    assert.equal(b.length, a.length + 8); // +4 each side
});

test('qrToMatrix rejects empty / non-string input', () => {
    assert.throws(() => qrToMatrix(''), /non-empty string/);
    assert.throws(() => qrToMatrix(null), /non-empty string/);
});

test('qrToSVG returns a self-contained SVG document', () => {
    const svg = qrToSVG('hi');
    assert.match(svg, /^<\?xml/);
    assert.ok(svg.includes('<svg'));
    assert.ok(svg.includes('</svg>'));
});

test('renderQRToTerminal returns a non-empty multi-line string', () => {
    const out = renderQRToTerminal('hi');
    assert.equal(typeof out, 'string');
    assert.ok(out.length > 0);
    assert.ok(out.includes('\n'));
});

test('formatPairingCode groups an 8-char code and passes others through', () => {
    assert.equal(formatPairingCode('ABCD1234'), 'ABCD-1234');
    assert.equal(formatPairingCode('SHORT'), 'SHORT');
    assert.equal(formatPairingCode(''), '');
    assert.equal(formatPairingCode(null), '');
    assert.equal(formatPairingCode(undefined), '');
});
