/**
 * tests/v2410-batch-cg.test.js — Batch CG (§2.178–§2.181).
 *
 * Found by making the environment-gated tests actually runnable: §2.177 showed that a test
 * which skips itself reports green without proving anything, so ffmpeg was installed and the
 * media paths were driven for real. §2.178 and §2.179 are what fell out.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'

import { jpegDimensions, extractVideoDimensions, extractVideoThumb, generateThumbnail } from '../lib/Utils/messages-media.js'
import { createWavRecorder } from '../lib/VoIP/call-recorder.js'
import { VoipClient } from '../lib/VoIP/index.js'

/** Resolve ffmpeg the same way the library does, so the tests run wherever it does. */
const ffmpegBin = await (async () => {
	try {
		const { requireFfmpegPath } = await import('../lib/Utils/ffmpeg-path.js')
		return await requireFfmpegPath()
	} catch {
		return null
	}
})()
const needsFfmpeg = { skip: ffmpegBin ? false : 'no ffmpeg binary available' }

const dir = mkdtempSync(join(tmpdir(), 'cg-'))
const clip = join(dir, 'clip.mp4')
const still = join(dir, 'still.jpg')
if (ffmpegBin) {
	// 320x240 is deliberately not square and not the 32px the thumbnail is scaled to
	execFileSync(ffmpegBin, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=10', '-pix_fmt', 'yuv420p', clip])
	execFileSync(ffmpegBin, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=duration=1:size=640x480:rate=1', '-frames:v', '1', still])
}

// ── §2.178 ───────────────────────────────────────────────────────────────────

describe('§2.178 videos carry their dimensions', () => {
	test('jpegDimensions reads the frame header without any image library', { ...needsFfmpeg }, () => {
		const jpeg = readFileSync(still)
		assert.deepStrictEqual(jpegDimensions(jpeg), { width: 640, height: 480 })
	})

	test('jpegDimensions refuses anything that is not a readable JPEG', () => {
		assert.strictEqual(jpegDimensions(Buffer.from([0x89, 0x50, 0x4e, 0x47])), null, 'PNG')
		assert.strictEqual(jpegDimensions(Buffer.alloc(0)), null)
		assert.strictEqual(jpegDimensions(Buffer.from([0xff, 0xd8])), null, 'header only, no frame')
		assert.strictEqual(jpegDimensions('not a buffer'), null)
		assert.strictEqual(jpegDimensions(undefined), null)
	})

	test('extractVideoDimensions reports the native size, not the thumbnail size', { ...needsFfmpeg }, async () => {
		assert.deepStrictEqual(await extractVideoDimensions(clip), { width: 320, height: 240 })
	})

	test('generateThumbnail(video) fills originalImageDimensions like the image branch does', { ...needsFfmpeg }, async () => {
		const out = await generateThumbnail(clip, 'video', {})
		assert.ok(out.thumbnail, 'thumbnail still produced')
		assert.deepStrictEqual(
			out.originalImageDimensions,
			{ width: 320, height: 240 },
			'prepareWAMessageMedia fills uploadData.width/height from nothing else — without this a video ships dimensionless'
		)
	})

	test('a dimension probe that fails does not take the thumbnail down with it', async () => {
		// no such file: both the thumb and the probe fail, and generateThumbnail still resolves
		const out = await generateThumbnail(join(dir, 'missing.mp4'), 'video', {})
		assert.strictEqual(out.thumbnail, undefined)
		assert.strictEqual(out.originalImageDimensions, undefined)
	})
})

// ── §2.179 ───────────────────────────────────────────────────────────────────

describe('§2.179 extractVideoThumb size argument', () => {
	test('defaults to 32px wide, like its sibling extractImageThumb', { ...needsFfmpeg }, async () => {
		const buf = await extractVideoThumb(clip, '00:00:00')
		assert.ok(buf.length > 0)
		assert.strictEqual(buf[0], 0xff, 'a JPEG came back')
		assert.strictEqual(jpegDimensions(buf).width, 32)
	})

	test('a size with no usable width is named, not passed to ffmpeg', { ...needsFfmpeg }, async () => {
		for (const bad of [{}, { width: 0 }, { width: -5 }, { width: 'wide' }, { width: NaN }]) {
			await assert.rejects(
				extractVideoThumb(clip, '00:00:00', bad),
				err => /size\.width/.test(err.message),
				`size ${JSON.stringify(bad)} must be refused by name`
			)
		}
	})
})

// ── §2.180 ───────────────────────────────────────────────────────────────────

describe('§2.180 createCallLink is reachable from the VoIP client', () => {
	test('asks the socket for a token and returns a usable url', async () => {
		const asked = []
		// before a socket is attached there is nothing to ask
		await assert.rejects(new VoipClient({ engine: {} }).createCallLink(), /not connected/)

		const { attachVoip } = await import('../lib/VoIP/index.js')
		const full = makeMinimalSock({ createCallLink: async (...args) => { asked.push(args); return 'TOKEN123' } })
		const voip = await attachVoip(full, { engine: makeIdleEngine(), relay: makeRelay() })
		const audio = await voip.createCallLink()
		assert.deepStrictEqual(asked[0], ['audio', undefined, undefined])
		assert.strictEqual(audio.token, 'TOKEN123')
		assert.match(audio.url, /^https:\/\/call\.whatsapp\.com\/voice\/TOKEN123$/)

		const video = await voip.createCallLink({ video: true, startTime: 1700000000 })
		assert.deepStrictEqual(asked[1], ['video', { startTime: 1700000000 }, undefined])
		assert.match(video.url, /\/video\//)
		voip.disconnect()
	})

	test('a server that returns no token is an error, not an undefined link', async () => {
		const { attachVoip } = await import('../lib/VoIP/index.js')
		const voip = await attachVoip(makeMinimalSock({ createCallLink: async () => undefined }), { engine: makeIdleEngine(), relay: makeRelay() })
		await assert.rejects(voip.createCallLink(), /no token/)
		voip.disconnect()
	})
})

// ── WAV recorder: a characterisation test, not a fix ─────────────────────────
//
// The Math.max/Math.min clamp in call-recorder.js is the shape that was a genuine bug three
// times over (§2.141, §2.142, §2.157), so it was examined here too. It turned out NOT to be
// one: NaN already reached the file as 0. Reverting the source leaves these assertions
// passing, which is exactly why there is no § number attached to them. They are kept to pin
// the behaviour down so it cannot drift unnoticed later.
describe('WAV recorder sample conversion (characterisation)', () => {
	test('NaN becomes silence, +-Infinity clamps to full scale, finite samples are unchanged', () => {
		const file = join(dir, 'rec.wav')
		const rec = createWavRecorder(file, { sampleRate: 8000, channels: 1 })
		rec.write(Float32Array.from([0, 1, -1, NaN, Infinity, -Infinity, 0.5]))
		rec.close()
		const wav = readFileSync(file)
		const pcm = wav.subarray(44)
		const samples = []
		for (let i = 0; i < pcm.length; i += 2) samples.push(pcm.readInt16LE(i))
		assert.deepStrictEqual(samples, [0, 32767, -32768, 0, 32767, -32768, 16384])
	})

	test('the header sizes are patched on close', () => {
		const file = join(dir, 'rec2.wav')
		const rec = createWavRecorder(file, { sampleRate: 16000, channels: 1 })
		rec.write(Float32Array.from([0.1, 0.2, 0.3]))
		rec.close()
		const wav = readFileSync(file)
		assert.strictEqual(wav.readUInt32LE(4), 36 + 6, 'RIFF size')
		assert.strictEqual(wav.readUInt32LE(40), 6, 'data size')
	})
})

// ── helpers ──────────────────────────────────────────────────────────────────

function makeIdleEngine() {
	return {
		initialize: async () => {}, initVoipStack: () => {}, waitForVoipStackReady: async () => {},
		updateNetworkMedium: () => {}, destroy: () => {}, getCallInfo: () => ({ state: 0 }),
		handleSignalingOffer: () => {}, handleSignalingMessage: () => {},
		handleSignalingAck: () => {}, handleSignalingReceipt: () => {},
		handleOnTransportMessage: () => {}, updateIceRtt: () => {}
	}
}
function makeRelay() {
	return { getStats: () => ({ openConnections: 1 }), send: () => {}, closeAll: () => {} }
}
function makeMinimalSock(extras) {
	return {
		ws: new EventEmitter(),
		ev: new EventEmitter(),
		authState: { creds: { me: { id: '627000000000:3@s.whatsapp.net', lid: '999@lid' } }, keys: { get: async () => ({}), set: async () => ({}) } },
		generateMessageTag: () => 'cg-tag',
		query: async () => ({}),
		sendNode: async () => ({}),
		waitForMessage: async () => null,
		presenceSubscribe: async () => {},
		getUSyncDevices: async () => [],
		rejectCall: async () => {},
		sendMessage: async () => ({}),
		signalRepository: { lidMapping: { getLIDForPN: async () => null }, jidToSignalProtocolAddress: j => j },
		...extras
	}
}
