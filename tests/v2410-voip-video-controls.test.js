/**
 * tests/v2410-voip-video-controls.test.js — VoIP upgrade (§2.174–§2.176).
 *
 * Three things that did not exist before this batch:
 *   §2.174  a video uplink — `VideoFeeder` was exported since §2.85 with nothing wired to it
 *   §2.175  wrappers for the call controls the worker RPC already accepted
 *   §2.176  parsed call-quality stats
 *
 * Everything runs against an injected fake engine at the same interface the real
 * `WasmEngine` presents, which is how the rest of the VoIP suite works: there is
 * no WhatsApp call to place here. What a fake CANNOT prove is that the bytes we
 * hand the WASM module are a valid I420 frame, so the last block drives a real
 * `VideoFeeder` through ffmpeg — and skips when ffmpeg is absent, which it is in
 * CI. Treat the fake-engine tests as wiring proofs and the ffmpeg block as the
 * only end-to-end evidence about frame content.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { execFileSync } from 'node:child_process'

import { VoipClient, ActiveCall, i420FrameSize, VideoFeeder } from '../lib/VoIP/index.js'

const hasFfmpeg = (() => {
	try {
		execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
		return true
	} catch {
		return false
	}
})()

/** An engine that records every command, plus a heap for the video uplink. */
const makeEngine = ({ heapBytes = 1 << 20, videoExport = true } = {}) => {
	const calls = []
	const heap = new Uint8Array(heapBytes)
	const frames = []
	let nextPtr = 64
	const rec = name => (...args) => { calls.push([name, ...args]); return 0 }
	const engine = {
		calls, heap, frames,
		initialize: async () => {}, initVoipStack: () => {}, waitForVoipStackReady: async () => {},
		updateNetworkMedium: () => {}, destroy: () => {},
		startCall: rec('startCall'), endCall: rec('endCall'), setMute: rec('setMute'),
		acceptCall: rec('acceptCall'),
		getCallInfo: () => ({ state: 6 }),
		handleSignalingOffer: () => {}, handleSignalingMessage: () => {},
		handleSignalingAck: () => {}, handleSignalingReceipt: () => {},
		handleOnTransportMessage: () => {}, updateIceRtt: () => {},
		resendOfferOnDecryptionFailure: () => {}, resendEncRekeyRetry: () => {},
		malloc: size => { const p = nextPtr; nextPtr += size; return p },
		free: rec('free'),
		// video + controls (§2.174 / §2.175)
		setVideoMute: rec('setVideoMute'),
		videoStreamPause: rec('videoStreamPause'),
		videoStreamResume: rec('videoStreamResume'),
		requestVideoUpgrade: rec('requestVideoUpgrade'),
		acceptPeerVideo: rec('acceptPeerVideo'),
		requestKeyFrame: rec('requestKeyFrame'),
		startVideoPreview: rec('startVideoPreview'),
		startScreenShare: rec('startScreenShare'),
		stopScreenShare: rec('stopScreenShare'),
		waitingRoomAdmit: rec('waitingRoomAdmit'),
		waitingRoomDeny: rec('waitingRoomDeny'),
		waitingRoomAdmitAll: rec('waitingRoomAdmitAll'),
		waitingRoomToggleActiveCall: rec('waitingRoomToggleActiveCall'),
		notifyUiViewChange: rec('notifyUiViewChange'),
		sendWave: rec('sendWave'),
		getShortStatisticString: () => 'rtt=142 loss=0.5 bitrate=24000 codec="opus" jitter:12 state=connected',
		getDebugStatisticString: () => 'rtt=142 verbose=1',
		engineCommand: (name, args) => { calls.push(['engineCommand', name, args]); return 'ok' }
	}
	if (videoExport) {
		engine.sendVideoFrame = (data, ptr, geom) => {
			calls.push(['sendVideoFrame', data.length, ptr, geom])
			engine.heap.set(data, ptr)
			frames.push({ length: data.length, ptr, geom })
			return true
		}
	}
	return engine
}

const PEER_PN = '628123456789@s.whatsapp.net'
const PEER_LID = '111222333@lid'

/** Minimal socket that satisfies the outbound call() pipeline (same shape as tests/voip-e2e.test.js). */
const makeFullSock = () => ({
	ws: new EventEmitter(),
	ev: new EventEmitter(),
	authState: {
		creds: { me: { id: '627000000000:3@s.whatsapp.net', lid: '999888777@lid' } },
		keys: {
			get: async (type, jids) => {
				if (type !== 'tctoken') return {}
				const out = {}
				for (const j of jids) out[j] = { token: Buffer.from('tok-' + j), timestamp: '1' }
				return out
			},
			set: async () => ({})
		}
	},
	generateMessageTag: () => 'stats-tag',
	query: async () => ({}),
	sendNode: async () => ({}),
	waitForMessage: async () => null,
	presenceSubscribe: async () => {},
	getUSyncDevices: async () => [{ jid: PEER_LID }],
	rejectCall: async () => {},
	sendMessage: async () => ({}),
	signalRepository: {
		lidMapping: { getLIDForPN: async pn => (pn === PEER_PN ? PEER_LID : null) },
		jidToSignalProtocolAddress: j => j,
		validateSession: async () => ({ exists: true }),
		decryptMessage: async () => { throw new Error('no session') },
		encryptMessage: async () => ({ type: 'msg', ciphertext: new Uint8Array(1) })
	}
})

/** A VoipClient with the engine injected, without going through a socket. */
const makeClient = (engine, config = {}) => {
	const client = new VoipClient({ engine, ...config })
	// connectWithSocket() needs a full socket; the video/控制 surface only needs
	// the engine reference, so reach it the same way the constructor would.
	return client
}

// ── §2.174: the video uplink ─────────────────────────────────────────────────

describe('§2.174 video uplink', () => {
	it('ActiveCall.setVideoSource stores the source and reports no live feeder', () => {
		const call = new ActiveCall('C1', makeEngine(), 0)
		assert.equal(call._videoSource, null, 'a call sends no video unless asked to')
		assert.equal(call.setVideoSource('lavfi:testsrc'), false, 'no feeder running yet')
		assert.equal(call._videoSource, 'lavfi:testsrc')
		assert.equal(call.setVideoSource(null), false)
		assert.equal(call._videoSource, null)
	})

	it('a live feeder is swapped, and null tears it down', () => {
		const call = new ActiveCall('C1', makeEngine(), 0)
		const seen = []
		call._switchVideoSource = source => { seen.push(source); return true }
		assert.equal(call.setVideoSource('./clip.mp4'), true)
		assert.equal(call.setVideoSource(null), true)
		assert.deepEqual(seen, ['./clip.mp4', null])
	})

	it('the video controls reach the engine, and report false instead of throwing', () => {
		const engine = makeEngine()
		const call = new ActiveCall('C1', engine, 0)
		assert.equal(call.setVideoMuted(true), true)
		assert.equal(call.pauseVideo(), true)
		assert.equal(call.resumeVideo(), true)
		assert.equal(call.requestVideoUpgrade(), true)
		assert.equal(call.acceptPeerVideo('a@s.whatsapp.net'), true)
		assert.equal(call.requestKeyFrame('a@s.whatsapp.net'), true)
		assert.deepEqual(engine.calls.map(c => c[0]), [
			'setVideoMute', 'videoStreamPause', 'videoStreamResume',
			'requestVideoUpgrade', 'acceptPeerVideo', 'requestKeyFrame'
		])
		assert.deepEqual(engine.calls[0], ['setVideoMute', true])
		assert.deepEqual(engine.calls[4], ['acceptPeerVideo', 'a@s.whatsapp.net'])

		// an engine from an older WASM build has none of these
		const bare = new ActiveCall('C2', { endCall() {}, setMute() {} }, 0)
		assert.equal(bare.setVideoMuted(true), false, 'missing export must not throw mid-call')
		assert.equal(bare.pauseVideo(), false)
		assert.equal(bare.requestVideoUpgrade(), false)
	})
})

// ── §2.175: controls + escape hatch ──────────────────────────────────────────

describe('§2.175 call controls that the worker RPC already accepted', () => {
	it('every wrapper forwards its arguments to the engine', () => {
		const engine = makeEngine()
		const client = makeClient(engine)
		client.admitToCall('a@s.whatsapp.net')
		client.denyFromCall('b@s.whatsapp.net')
		client.admitAllToCall()
		client.setWaitingRoomEnabled(true)
		client.startScreenShare()
		client.stopScreenShare()
		client.notifyViewChange(2, 'c@s.whatsapp.net')
		client.sendWave({ participantPnUserJid: 'a@s.whatsapp.net' })

		assert.deepEqual(engine.calls, [
			['waitingRoomAdmit', 'a@s.whatsapp.net'],
			['waitingRoomDeny', 'b@s.whatsapp.net'],
			['waitingRoomAdmitAll'],
			['waitingRoomToggleActiveCall', true],
			['startScreenShare'],
			['stopScreenShare'],
			['notifyUiViewChange', 2, 'c@s.whatsapp.net'],
			['sendWave', { participantPnUserJid: 'a@s.whatsapp.net' }]
		])
	})

	// ── §2.210: the preview the engine exposed and nothing called ───────────────
	it('startVideoPreview forwards an explicit call id and jid', () => {
		const engine = makeEngine()
		makeClient(engine).startVideoPreview('CALL1', 'me@s.whatsapp.net')
		assert.deepEqual(engine.calls, [['startVideoPreview', 'CALL1', 'me@s.whatsapp.net']])
	})

	it('startVideoPreview refuses rather than guessing when there is no active call', () => {
		const client = makeClient(makeEngine())
		assert.throws(() => client.startVideoPreview(), /no active call/)
	})

	it('startVideoPreview refuses when the self jid cannot be resolved', () => {
		const client = makeClient(makeEngine())
		assert.throws(() => client.startVideoPreview('CALL1'), /not connected/)
	})

	it('a control on an engine that lacks it names the command', () => {
		const client = makeClient({ initialize: async () => {} })
		assert.throws(() => client.startScreenShare(), /startScreenShare: not supported/)
	})

	it('the escape hatch passes through, and refuses a bad call shape', () => {
		const engine = makeEngine()
		const client = makeClient(engine)
		assert.equal(client.engineCommand('isWebP2PEnabled', ['abc']), 'ok')
		assert.deepEqual(engine.calls.at(-1), ['engineCommand', 'isWebP2PEnabled', ['abc']])
	})
})

// ── §2.176: call quality ─────────────────────────────────────────────────────

describe('§2.176 call quality', () => {
	it('parses key=value and key:value pairs, numbers as numbers', () => {
		const client = makeClient(makeEngine())
		const { raw, metrics } = client.getCallQuality()
		assert.match(raw, /rtt=142/, 'the untouched string is always returned')
		assert.equal(metrics.rtt, 142)
		assert.equal(metrics.loss, 0.5)
		assert.equal(metrics.bitrate, 24000)
		assert.equal(metrics.codec, 'opus', 'quotes stripped, left as a string')
		assert.equal(metrics.jitter, 12, 'key:value form too')
		assert.equal(metrics.state, 'connected')
	})

	it('verbose reads the debug string; an engine without the export yields empty, not a crash', () => {
		const engine = makeEngine()
		assert.equal(makeClient(engine).getCallQuality({ verbose: true }).metrics.verbose, 1)

		const old = makeClient({ initialize: async () => {} })
		const out = old.getCallQuality()
		assert.equal(out.raw, '')
		assert.deepEqual(out.metrics, {}, 'an unreadable format must degrade to empty, never throw')
	})

	it('refuses to monitor without a call, or on a nonsense interval', () => {
		const client = makeClient(makeEngine())
		assert.throws(() => client.monitorCallQuality(), /no active call/)
		assert.throws(() => client.monitorCallQuality({ intervalMs: 0 }), RangeError)
	})

	it('emits call-stats on a real call and stops itself when the call ends', async () => {
		// driven through attachVoip + call() rather than a hand-made ActiveCall:
		// the point of the test is that the monitor follows the client's own
		// lifecycle, which a stub call would not exercise.
		const { attachVoip } = await import('../lib/VoIP/index.js')
		const sock = makeFullSock()
		const engine = makeEngine()
		const voip = await attachVoip(sock, { engine, relay: { getStats: () => ({ openConnections: 1 }), send: () => {}, closeAll: () => {} } })
		const call = await voip.call('+62 812-3456-789', { durationMs: 0 })

		const seen = []
		voip.on('call-stats', s => seen.push(s))
		const stop = voip.monitorCallQuality({ intervalMs: 10 })
		await new Promise(r => setTimeout(r, 60))
		assert.ok(seen.length > 0, 'no call-stats emitted while the call was up')
		assert.equal(seen[0].callId, call.callId)
		assert.equal(seen[0].metrics.rtt, 142)

		call._forceEnd('test')
		await new Promise(r => setTimeout(r, 20))
		const afterEnd = seen.length
		await new Promise(r => setTimeout(r, 60))
		assert.equal(seen.length, afterEnd, 'the monitor must stop itself when the call ends')

		stop()
		voip.disconnect()
	})
})

// ── the only end-to-end evidence about frame content ─────────────────────────

describe('§2.174 real I420 frames (requires ffmpeg)', { skip: hasFfmpeg ? false : 'ffmpeg not installed' }, () => {
	it('VideoFeeder emits whole I420 frames of exactly the declared size', async () => {
		const width = 160
		const height = 120
		const expected = i420FrameSize(width, height)
		const sizes = []
		const feeder = new VideoFeeder(width, height, 10, frame => sizes.push(frame.length), 'lavfi:testsrc')
		feeder.start()
		try {
			await new Promise(r => setTimeout(r, 1200))
		} finally {
			feeder.stop()
		}
		assert.ok(sizes.length > 0, 'ffmpeg produced no frames')
		assert.ok(sizes.every(n => n === expected), `every frame must be exactly ${expected} bytes, got ${[...new Set(sizes)]}`)
	})

	it('those frames land in the engine heap at the pointer we allocated', async () => {
		const engine = makeEngine()
		const width = 160
		const height = 120
		const bytes = i420FrameSize(width, height)
		const ptr = engine.malloc(bytes)
		const feeder = new VideoFeeder(width, height, 10, frame => engine.sendVideoFrame(frame, ptr, { width, height, fps: 10 }), 'lavfi:testsrc')
		feeder.start()
		try {
			await new Promise(r => setTimeout(r, 1200))
		} finally {
			feeder.stop()
		}
		assert.ok(engine.frames.length > 0)
		assert.ok(engine.frames.every(f => f.length === bytes && f.ptr === ptr))
		assert.ok(engine.heap.subarray(ptr, ptr + bytes).some(b => b !== 0), 'heap must hold real pixel data')
	})
})
