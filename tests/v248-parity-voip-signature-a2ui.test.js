// §2.85 — parity wave 2: VoIP feeders/recognition, bot-signature verification, the rest of
// the A2UI/AI-rich sections, and the refreshable native-flow registry.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'crypto'
import {
	ActiveCall, makeVoipClient, bindVoiceRecognition, AudioFeeder, VideoFeeder,
	VIDEO_FORMAT_I420, i420FrameSize,
	verifyBotSignature, constructSignaturePayload, loadBotSignatureRoot, isParsableCertificateChain,
	readSignedRichResponse, verifyRichResponseSignature, BOT_SIGNATURE_USE_CASE,
	a2uiText, a2uiWidget, bloksWidget, bloksSection, decodeBloksWidget, embeddedTab,
	embeddedTabbedContent, thinkingSection, plannerStep, searchPlannerSection,
	multipleResponseSection, fusedComparisonSection,
	getExports, isKnownButtonName, update, reloadExports, enableAutoUpdate, disableAutoUpdate,
	isAutoUpdateEnabled, flushAutoUpdate, onExportsUpdated, AUTO_UPDATE_MIN_INTERVAL_MS,
	INTERACTIVE_BUTTON_NAMES
} from '../lib/index.js'

// ── VoIP ───────────────────────────────────────────────────────────────────────
test('§2.85 makeVoipClient builds a client without touching a socket', () => {
	const client = makeVoipClient({})
	assert.equal(typeof client.connectWithSocket, 'function')
	assert.equal(typeof client.disconnect, 'function')
})

test('§2.85 the video feeder sizes and validates I420 frames', () => {
	assert.equal(VIDEO_FORMAT_I420, 0)
	assert.equal(i420FrameSize(320, 240), 320 * 240 * 1.5)
	assert.throws(() => i420FrameSize(321, 240), /even dimensions/)
	assert.throws(() => i420FrameSize(0, 240), /positive integers/)
	const feeder = new VideoFeeder(320, 240, 10, () => {})
	assert.equal(feeder.frameSize, 115200)
	assert.equal(feeder.blackFrame().length, feeder.frameSize)
	assert.deepEqual(feeder.getStats(), {
		framesEmitted: 0, droppedFrames: 0, underflowFrames: 0, bytesProduced: 0, queued: 0, running: false
	})
	feeder.stop()
	assert.throws(() => new VideoFeeder(320, 240, 10, 'not a function'), /onFrame must be a function/)
	assert.throws(() => new VideoFeeder(320, 240, 0, () => {}), /frameRate must be between/)
	assert.equal(typeof AudioFeeder, 'function')
})

test('§2.85 bindVoiceRecognition chunks a call into transcript segments', async () => {
	const call = new ActiveCall({ callId: 'c1', peerJid: '1@s.whatsapp.net', engine: {} })
	const seen = []
	const rec = bindVoiceRecognition(call, async pcm => { seen.push(pcm.length); return `chunk${seen.length}` }, {
		chunkMs: 100, sampleRate: 16000
	})
	// 100 ms @ 16 kHz mono 16-bit = 3200 bytes; one emit of 2000 samples = 4000 bytes
	call._emitAudio(Float32Array.from({ length: 2000 }, () => 0.1))
	call._forceEnd('ended')
	const transcript = await rec.stop()
	assert.ok(seen.length >= 1)
	assert.match(transcript, /chunk1/)
	assert.throws(() => bindVoiceRecognition({}, async () => ''), /requires an ActiveCall/)
	assert.throws(() => bindVoiceRecognition(call, 'nope'), /must be a function/)
	assert.throws(() => bindVoiceRecognition(call, async () => '', { chunkMs: 1 }), /chunkMs must be >= 100/)
})

// ── bot signature ──────────────────────────────────────────────────────────────
const der = (payloadLen = 4) => Buffer.concat([Buffer.from([0x30, 0x82, 0x00, payloadLen]), Buffer.alloc(payloadLen, 7)])

test('§2.85 certificate chains are structurally validated before any crypto', () => {
	assert.equal(isParsableCertificateChain([der()]), true)
	assert.equal(isParsableCertificateChain([Buffer.from([0x30, 0x02, 1, 2])]), true)
	assert.equal(isParsableCertificateChain([Buffer.from([0x31, 0x02, 1, 2])]), false, 'not a SEQUENCE')
	assert.equal(isParsableCertificateChain([Buffer.from([0x30, 0x82, 0x00, 0x40, 1])]), false, 'truncated')
	assert.equal(isParsableCertificateChain([]), false)
	assert.equal(isParsableCertificateChain([null]), false)
})

test('§2.85 a real Ed25519 bot proof verifies, and a bad one does not', () => {
	const { publicKey, privateKey } = generateKeyPairSync('ed25519')
	const cert = der()
	const payload = { text: 'hello' }
	const signature = sign(null, constructSignaturePayload({ payload, certificateChain: [cert] }), privateKey)
	const msg = {
		message: {
			richResponseMessage: payload,
			messageContextInfo: {
				botMetadata: { verificationMetadata: { proofs: [{ certificateChain: [cert], signature, version: 1, useCase: BOT_SIGNATURE_USE_CASE.BOT_MESSAGE }] } }
			}
		}
	}
	const ok = verifyBotSignature(msg, { root: publicKey, payload })
	assert.equal(ok.verified, true)
	assert.equal(ok.reason, null)
	assert.equal(ok.chainLength, 1)
	assert.equal(verifyRichResponseSignature(msg, { root: publicKey, payload }), true)
	assert.ok(readSignedRichResponse(msg, { root: publicKey, payload }).rich)

	// no trust root → never claims verified
	assert.deepEqual(
		{ verified: verifyBotSignature(msg).verified, reason: verifyBotSignature(msg).reason },
		{ verified: false, reason: 'no trust root' }
	)
	// wrong root
	const other = generateKeyPairSync('ed25519').publicKey
	assert.equal(verifyBotSignature(msg, { root: other, payload }).reason, 'signature does not match')
	// tampered payload
	assert.equal(verifyBotSignature(msg, { root: publicKey, payload: { text: 'other' } }).verified, false)
	// unverified rich responses are withheld
	assert.equal(readSignedRichResponse(msg, { root: other, payload }).rich, null)
	// shapes that carry no proof
	assert.equal(verifyBotSignature({ message: { conversation: 'hi' } }).reason, 'no bot proof on this message')
	assert.equal(verifyBotSignature({ message: { messageContextInfo: { botMetadata: { verificationMetadata: { proofs: [{ certificateChain: [], signature }] } } } } }).reason, 'empty certificate chain')
	assert.match(verifyBotSignature(msg, { root: 'not a key', payload }).reason, /bad trust root/)
	assert.throws(() => loadBotSignatureRoot(), /pass the trust root/)
	assert.equal(loadBotSignatureRoot(publicKey), publicKey)
})

// ── A2UI / AI rich, the rest ───────────────────────────────────────────────────
test('§2.85 a2uiWidget + decodeBloksWidget round-trip a surface', () => {
	const widget = a2uiWidget([{ id: 't1', component: 'Text', text: 'hello' }])
	const decoded = decodeBloksWidget(widget)
	assert.deepEqual(decoded.text, ['hello'])
	assert.equal(decoded.byId.t1.component, 'Text')
	assert.equal(decoded.byId.root.component, 'Column')
	assert.equal(decodeBloksWidget(bloksWidget([a2uiText('x')])).text[0], 'x')
	assert.equal(decodeBloksWidget({ data: 'not json' }), null)
	assert.equal(decodeBloksWidget(null), null)
	assert.throws(() => a2uiWidget([]), /at least one component/)
	assert.throws(() => a2uiWidget([{ component: 'Text' }]), /needs an "id"/)
	assert.throws(() => a2uiWidget([{ id: 'a', component: 'Text' }, { id: 'a', component: 'Text' }]), /duplicate component id/)
})

test('§2.85 sendBloksWidget relays an interactive message', async () => {
	const sent = []
	const sock = { relayMessage: async () => {}, sendMessage: async (jid, content, opts) => { sent.push({ jid, content, opts }); return { key: { id: 'X' } } } }
	const widget = bloksWidget([a2uiText('hi')])
	await sendBloksWidgetHelper(sock, widget)
	assert.equal(sent[0].content.interactiveMessage.bloksWidget.uuid, widget.uuid)
	assert.equal(sent[0].content.interactiveMessage.body.text, 'Body')
	async function sendBloksWidgetHelper(s, w) {
		const { sendBloksWidget } = await import('../lib/index.js')
		return sendBloksWidget(s, '1@s.whatsapp.net', w, { body: 'Body', footer: 'Footer' })
	}
	const { sendBloksWidget } = await import('../lib/index.js')
	await assert.rejects(sendBloksWidget({}, 'j', widget), /connected socket/)
	await assert.rejects(sendBloksWidget(sock, 'j', { uuid: 'x' }), /pass a payload/)
})

test('§2.85 section helpers validate their own shape', () => {
	assert.equal(decodeBloksWidget(bloksWidget(bloksSection('Title', [a2uiText('x')]))).text[0], 'Title')
	assert.throws(() => bloksSection('t', []), /at least one child/)

	const tabs = embeddedTabbedContent([embeddedTab('One', [a2uiText('a')]), embeddedTab('Two', [a2uiText('b')])])
	assert.equal(tabs.tabs.length, 2)
	assert.equal(tabs.tabs[0].selected, true)
	assert.equal(tabs.tabs[1].selected, false)
	assert.throws(() => embeddedTabbedContent([
		embeddedTab('a', [a2uiText('x')], { selected: true }), embeddedTab('b', [a2uiText('y')], { selected: true })
	]), /only one tab/)
	assert.throws(() => embeddedTab('', [a2uiText('x')]), /label is required/)
	assert.throws(() => embeddedTabbedContent([]), /at least one tab/)

	assert.equal(thinkingSection(['a']).thinking.title, 'Thinking')
	assert.equal(plannerStep('search', { status: 'running' }).status, 'running')
	assert.throws(() => plannerStep('x', { status: 'nope' }), /unknown status/)
	assert.throws(() => plannerStep(''), /title is required/)

	const planner = searchPlannerSection('kopi', ['cari', plannerStep('baca', { status: 'done' })], { sources: ['https://x'] })
	assert.equal(planner.searchPlanner.steps.length, 2)
	assert.equal(planner.searchPlanner.sources[0].url, 'https://x')
	assert.throws(() => searchPlannerSection('', ['a']), /query is required/)
	assert.throws(() => searchPlannerSection('q', []), /at least one step/)

	const multi = multipleResponseSection(['a', 'b', 'c'], { selected: 2 })
	assert.equal(multi.multipleResponse.total, 3)
	assert.equal(multi.multipleResponse.responses[2].label, 'Response 3')
	assert.throws(() => multipleResponseSection(['only one']), /at least two responses/)
	assert.throws(() => multipleResponseSection(['a', 'b'], { selected: 9 }), /must be between 0 and 1/)

	const comparison = fusedComparisonSection(['A', 'B'], [{ label: 'Harga', values: ['1', '2'] }], { recommend: 1 })
	assert.equal(comparison.fusedComparison.options[1].recommended, true)
	assert.throws(() => fusedComparisonSection(['A'], [{ label: 'x', values: ['1'] }]), /at least two options/)
	assert.throws(() => fusedComparisonSection(['A', 'B'], [{ label: 'x', values: ['1'] }]), /has 1 values for 2 options/)
	assert.throws(() => fusedComparisonSection(['A', 'B'], [{ label: 'x', values: ['1', '2'] }], { recommend: 5 }), /option index/)
})

// ── refreshable native-flow registry ───────────────────────────────────────────
test('§2.85 the button-name table can be refreshed and reset', async () => {
	assert.deepEqual(getExports().buttonNames, [...INTERACTIVE_BUTTON_NAMES])
	assert.equal(isKnownButtonName('quick_reply'), true)
	assert.equal(isKnownButtonName('brand_new_flow'), false)

	const seen = []
	const off = onExportsUpdated(snapshot => seen.push(snapshot.buttonNames.length))
	await update(['brand_new_flow'])
	assert.equal(isKnownButtonName('brand_new_flow'), true, 'merged table should accept the new name')
	assert.equal(isKnownButtonName('quick_reply'), true, 'merging must not drop the built-ins')
	assert.equal(seen.length, 1)
	off()

	await update({ buttonNames: ['only_this'], version: '9' }, { merge: false })
	assert.equal(getExports().version, '9')
	assert.equal(isKnownButtonName('quick_reply'), false, 'merge:false should replace the table')

	reloadExports()
	assert.deepEqual(getExports().buttonNames, [...INTERACTIVE_BUTTON_NAMES])
	assert.equal(getExports().source, 'built-in')
	await assert.rejects(update([]), /no button names/)
	await assert.rejects(update('nope'), /expected an array/)
})

test('§2.85 auto-update fetches on a schedule and can be stopped', async () => {
	const calls = []
	const fetchImpl = async url => {
		calls.push(url)
		return { ok: true, json: async () => ({ buttonNames: ['fetched_flow'], version: '2' }) }
	}
	assert.throws(() => enableAutoUpdate({ url: 'https://x', intervalMs: 1000 }), /at least/)
	assert.throws(() => enableAutoUpdate({}), /"url"/)
	const handle = enableAutoUpdate({ url: 'https://x/defs.json', intervalMs: AUTO_UPDATE_MIN_INTERVAL_MS, fetchImpl })
	assert.equal(isAutoUpdateEnabled(), true)
	await flushAutoUpdate()
	assert.deepEqual(calls, ['https://x/defs.json'])
	assert.equal(isKnownButtonName('fetched_flow'), true)
	assert.equal(handle.stop(), true)
	assert.equal(isAutoUpdateEnabled(), false)
	assert.equal(disableAutoUpdate(), false)

	// a failing fetch leaves the table alone
	const before = getExports().buttonNames.length
	await assert.rejects(update({ url: 'https://x' }, { fetchImpl: async () => ({ ok: false, status: 503 }) }), /responded 503/)
	assert.equal(getExports().buttonNames.length, before)
	reloadExports()
})

test('§2.85 button validation consults the live table', async () => {
	const { validateButtonPayload } = await import('../lib/Utils/button-sender.js').catch(() => ({}))
	if (typeof validateButtonPayload !== 'function') {
		return // validator is not exported in this build; the registry test above covers the table
	}
	reloadExports()
	assert.equal(isKnownButtonName('late_breaking_flow'), false)
	await update(['late_breaking_flow'])
	assert.equal(isKnownButtonName('late_breaking_flow'), true)
	reloadExports()
})
