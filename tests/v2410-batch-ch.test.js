/**
 * tests/v2410-batch-ch.test.js — Batch CH (§2.182–§2.184).
 *
 * The remaining halves of the VoIP media path: inbound video frames (decoded by the stack and
 * dropped), the uplink audio (sent and unobservable), and participant RX subscriptions.
 *
 * Fake engine for the wiring, real ffmpeg for anything that claims to produce a playable file.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, existsSync, statSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'

import { ActiveCall, VoipClient, i420FrameSize } from '../lib/VoIP/index.js'

const ffmpegBin = await (async () => {
	try {
		const { requireFfmpegPath } = await import('../lib/Utils/ffmpeg-path.js')
		return await requireFfmpegPath()
	} catch {
		return null
	}
})()
const needsFfmpeg = { skip: ffmpegBin ? false : 'no ffmpeg binary available' }
const dir = mkdtempSync(join(tmpdir(), 'ch-'))

const idleEngine = () => ({ endCall() {}, setMute() {} })

/** A deterministic I420 frame: every plane filled with a known byte. */
const frameOf = (width, height, fill) => ({
	userJid: 'peer@s.whatsapp.net',
	frame: new Uint8Array(i420FrameSize(width, height)).fill(fill),
	width, height, orientation: 0, format: 0, timestamp: 0, isKeyFrame: true
})

// ── §2.182: inbound video ────────────────────────────────────────────────────

describe('§2.182 inbound video frames', () => {
	test('the worker payload is normalised into a usable frame', async () => {
		const { _normalizeInboundVideoFrame } = await import('../lib/VoIP/wasm-engine.js')

		// the worker transfers an ArrayBuffer...
		const transferred = _normalizeInboundVideoFrame({
			userJid: 'peer@s.whatsapp.net', frameBuffer: new ArrayBuffer(12),
			width: 4, height: 2, orientation: 90, format: 0, timestamp: 17, isKeyFrame: 1
		})
		assert.ok(transferred.frame instanceof Uint8Array)
		assert.strictEqual(transferred.frame.length, 12)
		assert.strictEqual(transferred.userJid, 'peer@s.whatsapp.net')
		assert.strictEqual(transferred.orientation, 90)
		assert.strictEqual(transferred.isKeyFrame, true, 'coerced from 1')

		// ...or a view into a larger buffer, which must not be copied wholesale
		const backing = new Uint8Array(32)
		const view = backing.subarray(8, 20)
		const windowed = _normalizeInboundVideoFrame({ frameBuffer: view, width: '4', height: '3' })
		assert.strictEqual(windowed.frame.length, 12, 'the view bounds must be preserved')
		assert.strictEqual(windowed.width, 4, 'numeric strings coerced')
		assert.strictEqual(windowed.isKeyFrame, false)
		assert.strictEqual(windowed.userJid, null)

		assert.strictEqual(_normalizeInboundVideoFrame({}), null, 'no buffer, no frame')
		assert.strictEqual(_normalizeInboundVideoFrame(undefined), null)
	})

	test('a normalised frame reaches listeners as a "video" event', () => {
		// NOTE: with an injected config.engine the client never builds the callback object, so
		// this covers the ActiveCall half only. The engine half is covered by the normaliser
		// test above; the one line joining them is exercised in production, not here.
		const call = new ActiveCall('C1', idleEngine(), 0)
		const seen = []
		call.on('video', f => seen.push(f))
		call._emitVideo(frameOf(16, 16, 7))
		assert.strictEqual(seen.length, 1)
		assert.strictEqual(seen[0].frame.length, i420FrameSize(16, 16))
	})

	test('recordVideoToFile writes a playable file from raw I420', { ...needsFfmpeg }, async () => {
		const out = join(dir, 'peer.mp4')
		const call = new ActiveCall('C1', idleEngine(), 0)
		const stop = call.recordVideoToFile(out, { fps: 10 })
		for (let i = 0; i < 10; i++) {
			call._emitVideo(frameOf(64, 48, 16 + i))
		}
		const stopped = once(call, 'video-recording-stopped')
		stop('test')
		await stopped
		// ffmpeg needs a moment after stdin closes
		for (let i = 0; i < 40 && !(existsSync(out) && statSync(out).size > 0); i++) {
			await new Promise(r => setTimeout(r, 100))
		}
		assert.ok(existsSync(out) && statSync(out).size > 0, 'no video file was produced')
		const head = readFileSync(out).subarray(4, 8).toString('latin1')
		assert.strictEqual(head, 'ftyp', 'output is not an MP4 container')
	})

	test('a mid-call resolution change stops the recording instead of writing torn frames', async () => {
		const call = new ActiveCall('C1', idleEngine(), 0)
		const reasons = []
		call.on('video-recording-stopped', e => reasons.push(e.reason))
		call.recordVideoToFile(join(dir, 'torn.mp4'), { fps: 10 })
		call._emitVideo(frameOf(16, 16, 1))
		call._emitVideo(frameOf(32, 32, 2))
		assert.deepStrictEqual(reasons, ['geometry_changed'])
	})

	test('recording stops when the call ends, and refuses to start twice', () => {
		const call = new ActiveCall('C1', idleEngine(), 0)
		const reasons = []
		call.on('video-recording-stopped', e => reasons.push(e.reason))
		call.recordVideoToFile(join(dir, 'ends.mp4'))
		assert.throws(() => call.recordVideoToFile(join(dir, 'other.mp4')), /Already recording video/)
		call._forceEnd('test')
		assert.deepStrictEqual(reasons, ['call_ended'])
		// and after the call ended a new recorder may be created again
		assert.doesNotThrow(() => call.recordVideoToFile(join(dir, 'after.mp4')))
	})

	test('frames from other participants can be filtered out', () => {
		const call = new ActiveCall('C1', idleEngine(), 0)
		const reasons = []
		call.on('video-recording-stopped', e => reasons.push(e.reason))
		call.recordVideoToFile(join(dir, 'filtered.mp4'), { userJid: 'wanted@s.whatsapp.net' })
		// a frame from someone else must not even set the geometry — a later size change from
		// the wanted participant would otherwise look like a mid-call resolution change
		call._emitVideo({ ...frameOf(16, 16, 1), userJid: 'other@s.whatsapp.net' })
		call._emitVideo({ ...frameOf(32, 32, 2), userJid: 'wanted@s.whatsapp.net' })
		assert.deepStrictEqual(reasons, [], 'the foreign frame must be ignored, not adopted')
		call._forceEnd('test')
	})
})

// ── §2.183: the uplink half of a recording ───────────────────────────────────

describe('§2.183 recording both sides of a call', () => {
	test('mono recording is unchanged: inbound only, one channel', () => {
		const out = join(dir, 'mono.wav')
		const call = new ActiveCall('C1', idleEngine(), 0)
		const stop = call.recordToFile(out, { sampleRate: 8000 })
		call._emitAudio(Float32Array.from([1, -1]))
		call._emitUplinkAudio(Float32Array.from([0.5, 0.5]))
		stop()
		const wav = readFileSync(out)
		assert.strictEqual(wav.readUInt16LE(22), 1, 'channel count')
		assert.strictEqual(wav.readUInt32LE(40), 4, 'only the inbound frame was written')
	})

	test('mix: true puts the peer left and our uplink right', () => {
		const out = join(dir, 'mix.wav')
		const call = new ActiveCall('C1', idleEngine(), 0)
		const stop = call.recordToFile(out, { sampleRate: 8000, mix: true })
		call._emitAudio(Float32Array.from([1, 1]))
		call._emitUplinkAudio(Float32Array.from([-1, -1]))
		stop()
		const wav = readFileSync(out)
		assert.strictEqual(wav.readUInt16LE(22), 2, 'stereo')
		const pcm = wav.subarray(44)
		const s = []
		for (let i = 0; i < pcm.length; i += 2) s.push(pcm.readInt16LE(i))
		// inbound frame: left full scale, right silent — then the uplink frame, mirrored
		assert.deepStrictEqual(s, [32767, 0, 32767, 0, 0, -32768, 0, -32768])
	})

	test('the uplink event fires while a call is feeding audio', () => {
		const call = new ActiveCall('C1', idleEngine(), 0)
		const out = []
		call.on('audio-out', c => out.push(c.length))
		call._emitUplinkAudio(Float32Array.from([0, 0, 0]))
		assert.deepStrictEqual(out, [3])
	})
})

// ── §2.184: participant subscriptions ────────────────────────────────────────

describe('§2.184 participant RX subscriptions', () => {
	test('forwards both lists to the engine', () => {
		const calls = []
		const client = new VoipClient({
			engine: { updateParticipantsRxSubscription: (...args) => { calls.push(args); return 0 } }
		})
		client.setParticipantSubscriptions(['a@s.whatsapp.net', 'b@s.whatsapp.net'], [2, 0])
		assert.deepStrictEqual(calls, [[['a@s.whatsapp.net', 'b@s.whatsapp.net'], [2, 0]]])
	})

	test('an engine without the export says so by name', () => {
		const client = new VoipClient({ engine: {} })
		assert.throws(
			() => client.setParticipantSubscriptions(['a@s.whatsapp.net']),
			/updateParticipantsRxSubscription: not supported/
		)
	})
})
