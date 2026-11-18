// Regression tests for the odd-byteOffset crash in voip-tools' PCM helpers.
//
// Bug 71: `asInt16` / `toInt16Array` created a zero-copy `new Int16Array(
// buf.buffer, buf.byteOffset, …)`. Int16Array requires a 2-byte-aligned
// byteOffset, but pooled Buffers and `.subarray(oddIndex)` views (a PCM frame
// sliced out of a larger call-audio buffer, an RTP payload landing on an odd
// offset, etc.) routinely start on an ODD byteOffset — which threw
// `RangeError: start offset of Int16Array should be a multiple of 2`.
//
// The fix copies misaligned bytes into a fresh aligned buffer, so every PCM
// helper accepts odd-offset input AND returns byte-identical results to the
// aligned case. These tests assert both: (1) no throw, (2) parity with aligned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    rmsLevel, peakLevelPcm, isSilentPcm, applyGainPcm, mixPcm, downmixStereoToMono,
    encodeMulaw, encodeAlaw, decodeMulaw, pcmToFloat32, concatPcm, slicePcmMs
} from '../lib/Utils/voip-tools.js';

// Build an aligned reference frame plus an odd-offset view over the SAME bytes.
const makeFrames = (samples = 400) => {
    const ref = Buffer.alloc(samples * 2);
    for (let i = 0; i < samples; i++) {
        ref.writeInt16LE(Math.round(Math.sin(i / 7) * 20000), i * 2);
    }
    const holder = Buffer.alloc(samples * 2 + 1);
    ref.copy(holder, 1);                                 // shift by one byte
    const odd = holder.subarray(1, samples * 2 + 1);     // byteOffset === 1
    return { ref, odd };
};

const bytesOf = (typed) => Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);

test('odd-offset PCM view does not throw and matches aligned (scalar readers)', () => {
    const { ref, odd } = makeFrames();
    assert.equal(odd.byteOffset, 1, 'precondition: view starts on an odd byte offset');
    assert.equal(rmsLevel(odd), rmsLevel(ref));
    assert.equal(peakLevelPcm(odd), peakLevelPcm(ref));
    assert.equal(isSilentPcm(odd), isSilentPcm(ref));
});

test('odd-offset PCM view matches aligned (buffer-returning transforms)', () => {
    const { ref, odd } = makeFrames();
    assert.equal(Buffer.compare(applyGainPcm(odd, 1.5), applyGainPcm(ref, 1.5)), 0);
    assert.equal(Buffer.compare(mixPcm(odd, odd), mixPcm(ref, ref)), 0);
    assert.equal(Buffer.compare(downmixStereoToMono(odd), downmixStereoToMono(ref)), 0);
});

test('odd-offset PCM view matches aligned (G.711 + conversion helpers)', () => {
    const { ref, odd } = makeFrames();
    assert.equal(Buffer.compare(bytesOf(encodeMulaw(odd)), bytesOf(encodeMulaw(ref))), 0);
    assert.equal(Buffer.compare(bytesOf(encodeAlaw(odd)), bytesOf(encodeAlaw(ref))), 0);
    assert.equal(Buffer.compare(bytesOf(pcmToFloat32(odd)), bytesOf(pcmToFloat32(ref))), 0);
    assert.equal(Buffer.compare(bytesOf(concatPcm(odd)), bytesOf(concatPcm(ref))), 0);
    assert.equal(Buffer.compare(bytesOf(slicePcmMs(odd, 0, 10)), bytesOf(slicePcmMs(ref, 0, 10))), 0);
});

test('odd-offset AND odd-length view is handled (trailing byte dropped, no throw)', () => {
    const { ref } = makeFrames(400);
    const holder = Buffer.alloc(ref.byteLength + 1);
    ref.copy(holder, 1);
    const oddBoth = holder.subarray(1, ref.byteLength); // odd offset, odd length
    assert.equal(oddBoth.byteOffset, 1);
    assert.equal(oddBoth.byteLength % 2, 1);
    assert.doesNotThrow(() => rmsLevel(oddBoth));
    assert.doesNotThrow(() => encodeMulaw(oddBoth));
    // 799-byte view -> 399 whole samples (trailing odd byte dropped)
    assert.equal(oddBoth.byteLength, 799);
    assert.equal(encodeMulaw(oddBoth).length, 399);
});

test('regression: G.711 mu-law still round-trips from an odd-offset frame', () => {
    const { ref, odd } = makeFrames(256);
    const decoded = decodeMulaw(encodeMulaw(odd));
    assert.equal(decoded.length, 256);
    // decoding is lossy but must equal the aligned path exactly
    assert.equal(Buffer.compare(bytesOf(decoded), bytesOf(decodeMulaw(encodeMulaw(ref)))), 0);
});
