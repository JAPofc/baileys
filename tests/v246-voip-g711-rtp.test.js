// Tests for the v2.4.6 VoIP additions: G.711 μ-law / A-law codecs + RTP counters.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    encodeMulaw,
    decodeMulaw,
    encodeAlaw,
    decodeAlaw,
    rtpSequenceNext,
    rtpTimestampNext,
    codecClockRate
} from '../lib/Utils/voip-tools.js';

// ---------------------------------------------------------------- μ-law
test('μ-law: known reference values', () => {
    // silence (0) encodes to 0xFF and decodes back to 0
    assert.equal(encodeMulaw(Int16Array.of(0))[0], 0xff);
    assert.equal(decodeMulaw(Uint8Array.of(0xff))[0], 0);
    // full negative clip decodes to a large negative value near -32k
    assert.ok(decodeMulaw(Uint8Array.of(0x00))[0] < -32000);
    assert.ok(decodeMulaw(Uint8Array.of(0x00))[0] >= -32768);
});

test('μ-law: output is 1 byte per sample and in byte range', () => {
    const pcm = Int16Array.of(0, 1000, -1000, 32767, -32768, 5, -5);
    const enc = encodeMulaw(pcm);
    assert.equal(enc.length, pcm.length);
    assert.ok(enc instanceof Uint8Array);
    for (const b of enc) assert.ok(b >= 0 && b <= 255);
});

test('μ-law: roundtrip stays within companding quantization error', () => {
    // sweep the 16-bit range; μ-law error grows with amplitude but stays bounded
    for (let s = -32768; s <= 32767; s += 137) {
        const back = decodeMulaw(encodeMulaw(Int16Array.of(s)))[0];
        const err = Math.abs(back - s);
        const tol = Math.max(64, Math.abs(s) * 0.09); // ~8% companding + floor
        assert.ok(err <= tol, `μ-law roundtrip s=${s} back=${back} err=${err} > tol=${tol}`);
    }
});

// ---------------------------------------------------------------- A-law
test('A-law: output shape and range', () => {
    const pcm = Int16Array.of(0, 2000, -2000, 32767, -32768);
    const enc = encodeAlaw(pcm);
    assert.equal(enc.length, pcm.length);
    for (const b of enc) assert.ok(b >= 0 && b <= 255);
});

test('A-law: roundtrip within quantization error', () => {
    for (let s = -32768; s <= 32767; s += 151) {
        const back = decodeAlaw(encodeAlaw(Int16Array.of(s)))[0];
        const err = Math.abs(back - s);
        const tol = Math.max(128, Math.abs(s) * 0.09);
        assert.ok(err <= tol, `A-law roundtrip s=${s} back=${back} err=${err} > tol=${tol}`);
    }
});

test('codecs accept Buffer / Uint8Array / number[] input', () => {
    const arr = [0, 1234, -1234];
    const fromArr = encodeMulaw(arr);
    const fromI16 = encodeMulaw(Int16Array.from(arr));
    assert.deepEqual([...fromArr], [...fromI16]);
    // Buffer of 16-bit LE PCM
    const buf = Buffer.alloc(4);
    buf.writeInt16LE(1234, 0);
    buf.writeInt16LE(-1234, 2);
    const fromBuf = encodeMulaw(buf);
    assert.equal(fromBuf.length, 2);
});

// ---------------------------------------------------------------- RTP counters
test('rtpSequenceNext wraps at 16 bits', () => {
    assert.equal(rtpSequenceNext(0), 1);
    assert.equal(rtpSequenceNext(65535), 0);
    assert.equal(rtpSequenceNext(undefined), 1);
});

test('rtpTimestampNext wraps at 32 bits (unsigned)', () => {
    assert.equal(rtpTimestampNext(0, 160), 160);
    assert.equal(rtpTimestampNext(0xffffffff, 1), 0);
    assert.equal(rtpTimestampNext(0xfffffffe, 3), 1);
});

test('codecClockRate maps known codecs', () => {
    assert.equal(codecClockRate('pcmu'), 8000);
    assert.equal(codecClockRate('PCMA'), 8000);
    assert.equal(codecClockRate('opus'), 48000);
    assert.equal(codecClockRate('l16'), 44100);
    assert.equal(codecClockRate('unknown-thing'), 8000);
});
