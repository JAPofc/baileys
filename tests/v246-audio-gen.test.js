// Tests for the v2.4.6 round-2 audio helpers: PCM float conversion, tone/DTMF
// synthesis, and buffer concat/slice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    pcmToFloat32,
    float32ToPcm,
    generateTonePcm,
    generateDtmfPcm,
    concatPcm,
    slicePcmMs,
    rmsLevel,
    dtmfFrequencies
} from '../lib/Utils/voip-tools.js';

test('pcmToFloat32 normalizes into [-1, 1]', () => {
    const f = pcmToFloat32(Int16Array.of(0, 32767, -32768, 16384));
    assert.equal(f[0], 0);
    assert.ok(f[1] > 0.99 && f[1] <= 1);
    assert.equal(f[2], -1);
    assert.ok(Math.abs(f[3] - 0.5) < 0.01);
    assert.ok(f instanceof Float32Array);
});

test('float32ToPcm clamps out-of-range and is int16', () => {
    const p = float32ToPcm([0, 1, -1, 2, -2, 0.5]);
    assert.equal(p[0], 0);
    assert.equal(p[1], 32767);
    assert.equal(p[2], -32767); // -1 * 32767
    assert.equal(p[3], 32767);  // clamped from 2
    assert.equal(p[4], -32768); // clamped from -2
    assert.ok(p instanceof Int16Array);
});

test('float↔pcm roundtrip within 2 LSB', () => {
    for (let s = -32768; s <= 32767; s += 257) {
        const back = float32ToPcm(pcmToFloat32(Int16Array.of(s)))[0];
        assert.ok(Math.abs(back - s) <= 2, `roundtrip s=${s} back=${back}`);
    }
});

test('generateTonePcm has correct length and amplitude', () => {
    const tone = generateTonePcm(440, 100, { sampleRate: 8000, amplitude: 0.5 });
    assert.equal(tone.length, 800); // 8000 * 0.1
    // peak near 0.5 * 32767
    let peak = 0;
    for (const v of tone) peak = Math.max(peak, Math.abs(v));
    assert.ok(peak > 0.45 * 32767 && peak <= 0.5 * 32767 + 1, `peak=${peak}`);
    // RMS of a sine ≈ amplitude / sqrt(2)
    const rms = rmsLevel(tone);
    assert.ok(Math.abs(rms - 0.5 / Math.SQRT2) < 0.05, `rms=${rms}`);
});

test('generateTonePcm handles zero duration', () => {
    assert.equal(generateTonePcm(1000, 0).length, 0);
});

test('generateDtmfPcm uses the digit tone pair; null for invalid', () => {
    const d = generateDtmfPcm('5', 80, { sampleRate: 8000 });
    assert.ok(d instanceof Int16Array);
    assert.equal(d.length, 640); // 8000 * 0.08
    assert.ok(dtmfFrequencies('5')); // sanity: '5' is valid
    assert.equal(generateDtmfPcm('!', 80), null);
});

test('concatPcm joins chunks and ignores null', () => {
    const out = concatPcm(Int16Array.of(1, 2), null, Int16Array.of(3), [4, 5]);
    assert.deepEqual([...out], [1, 2, 3, 4, 5]);
    assert.equal(concatPcm().length, 0);
});

test('slicePcmMs slices by time window', () => {
    // 1000 samples @ 8000 Hz = 125 ms
    const pcm = new Int16Array(1000).map((_, i) => i % 100);
    const first10ms = slicePcmMs(pcm, 0, 10, { sampleRate: 8000 }); // 80 samples
    assert.equal(first10ms.length, 80);
    const fromMid = slicePcmMs(pcm, 100, undefined, { sampleRate: 8000 }); // 100ms→end = 800 samples
    assert.equal(fromMid.length, 200);
    // out-of-range window is safe
    assert.equal(slicePcmMs(pcm, 200, 300).length, 0);
});
