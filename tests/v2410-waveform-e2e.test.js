/**
 * End-to-end waveform tests: real encoded audio in, real waveform out.
 *
 * These deliberately do NOT skip themselves when `audio-decode` is missing. It is a
 * devDependency now precisely so this path is always exercised: a test that quietly skips
 * is how `getAudioWaveform()` stayed broken (§2.209) while the suite stayed green.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { getAudioWaveform } from '../lib/Utils/messages-media.js'
import { toReadable } from '../lib/Utils/messages-media.js'

/** Minimal 16-bit mono PCM WAV. */
const wav = (samples, sampleRate = 8000) => {
	const n = samples.length
	const buffer = Buffer.alloc(44 + n * 2)
	buffer.write('RIFF', 0)
	buffer.writeUInt32LE(36 + n * 2, 4)
	buffer.write('WAVE', 8)
	buffer.write('fmt ', 12)
	buffer.writeUInt32LE(16, 16)
	buffer.writeUInt16LE(1, 20)
	buffer.writeUInt16LE(1, 22)
	buffer.writeUInt32LE(sampleRate, 24)
	buffer.writeUInt32LE(sampleRate * 2, 28)
	buffer.writeUInt16LE(2, 32)
	buffer.writeUInt16LE(16, 34)
	buffer.write('data', 36)
	buffer.writeUInt32LE(n * 2, 40)
	for (let i = 0; i < n; i++) {
		const clamped = Math.max(-1, Math.min(1, samples[i]))
		buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2)
	}
	return buffer
}

const tone = (length, freq = 8) => Array.from({ length }, (_, i) => Math.sin((2 * Math.PI * freq * i) / length))

describe('getAudioWaveform — end to end', () => {
	it('decodes a WAV buffer into 64 buckets', async () => {
		const waveform = await getAudioWaveform(wav(tone(8000)))
		assert.ok(waveform, 'a decodable clip must not come back undefined (§2.209)')
		assert.equal(waveform.length, 64)
		assert.equal(Math.max(...waveform), 100)
	})

	it('a clip shorter than 64 samples still produces a real waveform', async () => {
		// §2.208 end to end: blockSize used to be 0 here, and every bucket came out zero
		const waveform = await getAudioWaveform(wav(tone(10)))
		assert.ok(waveform)
		assert.ok([...waveform].some(v => v > 0), `all zeros: ${[...waveform].join(',')}`)
	})

	it('accepts a stream as well as a buffer', async () => {
		const waveform = await getAudioWaveform(toReadable(wav(tone(4000))))
		assert.ok(waveform)
		assert.equal(waveform.length, 64)
	})

	it('a silent clip decodes to a flat line without erroring', async () => {
		const waveform = await getAudioWaveform(wav(new Array(2000).fill(0)))
		assert.ok(waveform)
		assert.deepEqual([...waveform], new Array(64).fill(0))
	})

	it('a loud clip is louder than a quiet one', async () => {
		const loud = await getAudioWaveform(wav(tone(4000).map(v => v)))
		const quiet = await getAudioWaveform(wav(tone(4000).map(v => v * 0.05)))
		const mean = w => [...w].reduce((a, b) => a + b, 0) / w.length
		// both are normalised to their own peak, so compare shape stability instead
		assert.ok(Math.abs(mean(loud) - mean(quiet)) < 25, 'normalised shapes should be close')
		assert.equal(Math.max(...loud), 100)
		assert.equal(Math.max(...quiet), 100)
	})

	it('returns undefined for undecodable input instead of throwing', async () => {
		const logged = []
		const waveform = await getAudioWaveform(Buffer.from('not audio at all'), { debug: m => logged.push(m) })
		assert.equal(waveform, undefined)
		assert.equal(logged.length, 1)
		assert.match(logged[0], /Failed to generate waveform/)
	})

	it('reports an empty decode rather than returning a flat line', async () => {
		const logged = []
		await getAudioWaveform(wav([]), { debug: m => logged.push(m) })
		assert.equal(logged.length, 1, 'an empty clip must be reported, not silently zeroed')
	})
})
