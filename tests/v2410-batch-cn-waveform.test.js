import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { computeAudioWaveform } from '../lib/Utils/messages-media.js'

const sine = (n, freq = 4) => Float32Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * freq * i) / n))

describe('computeAudioWaveform (§2.208)', () => {
	it('always returns 64 buckets', () => {
		for (const n of [0, 1, 10, 63, 64, 65, 1000, 44100]) {
			assert.equal(computeAudioWaveform(sine(n)).length, 64, `length for ${n} samples`)
		}
	})

	it('a clip shorter than 64 samples is not flattened to all zeros', () => {
		// the regression: blockSize = floor(10 / 64) = 0, so every bucket was sum / 0 = NaN,
		// and new Uint8Array([NaN, ...]) is all zeros
		const waveform = computeAudioWaveform(sine(10))
		assert.ok(
			waveform.some(v => v > 0),
			`expected some non-zero buckets, got ${[...waveform].join(',')}`
		)
	})

	it('scales the loudest bucket to 100', () => {
		for (const n of [5, 64, 500]) {
			const waveform = computeAudioWaveform(sine(n))
			assert.equal(Math.max(...waveform), 100, `peak for ${n} samples`)
		}
	})

	it('keeps every bucket inside 0..100', () => {
		const waveform = computeAudioWaveform(sine(777))
		for (const v of waveform) {
			assert.ok(v >= 0 && v <= 100, `bucket out of range: ${v}`)
		}
	})

	it('never emits NaN, which Uint8Array would silently turn into 0', () => {
		for (const n of [1, 7, 63, 128]) {
			const raw = Float32Array.from({ length: n }, () => 0.5)
			const waveform = computeAudioWaveform(raw)
			assert.ok([...waveform].every(Number.isFinite), `non-finite bucket for ${n} samples`)
		}
	})

	it('a single sample puts all of its energy in the first bucket', () => {
		const waveform = computeAudioWaveform(Float32Array.of(-0.8))
		assert.equal(waveform[0], 100)
		assert.equal(waveform[63], 0)
	})

	it('digital silence is all zeros, not NaN-zeros', () => {
		const waveform = computeAudioWaveform(new Float32Array(2048))
		assert.deepEqual([...waveform], Array(64).fill(0))
	})

	it('an empty clip is all zeros rather than a throw', () => {
		assert.deepEqual([...computeAudioWaveform(new Float32Array(0))], Array(64).fill(0))
		assert.deepEqual([...computeAudioWaveform(undefined)], Array(64).fill(0))
	})

	it('uses absolute amplitude, so a negative half-cycle is as loud as a positive one', () => {
		const positive = computeAudioWaveform(Float32Array.from({ length: 256 }, (_, i) => (i < 128 ? 0.5 : 0)))
		const negative = computeAudioWaveform(Float32Array.from({ length: 256 }, (_, i) => (i < 128 ? -0.5 : 0)))
		assert.deepEqual([...positive], [...negative])
	})

	it('tracks loudness: a ramp rises across the buckets', () => {
		const ramp = Float32Array.from({ length: 6400 }, (_, i) => i / 6400)
		const waveform = computeAudioWaveform(ramp)
		assert.ok(waveform[0] < waveform[32], 'start should be quieter than the middle')
		assert.ok(waveform[32] < waveform[63], 'middle should be quieter than the end')
	})

	it('honours a custom bucket count', () => {
		assert.equal(computeAudioWaveform(sine(1000), 16).length, 16)
	})
})
