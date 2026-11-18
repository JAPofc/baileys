// §2.82 — playback frames must be copies of the WASM heap, and inbound audio must be streamable.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { copyPlaybackFrame } from '../lib/VoIP/wasm-engine.js'
import { ActiveCall } from '../lib/index.js'

const FRAME = 320

const makeHeap = () => {
	const heap = new Float32Array(4096)
	return { heap, ptr: 1024 }
}

test('§2.82 copyPlaybackFrame returns data that survives the heap being overwritten', () => {
	const { heap, ptr } = makeHeap()
	const index = ptr / 4
	heap.fill(0.25, index, index + FRAME)
	const frame = copyPlaybackFrame(heap, ptr, FRAME * 4)
	assert.equal(frame.length, FRAME)
	assert.equal(frame[0], 0.25)
	heap.fill(-0.75, index, index + FRAME)
	assert.equal(frame[0], 0.25, 'the frame aliased the heap')
	assert.notEqual(frame.buffer, heap.buffer)
})

test('§2.82 copyPlaybackFrame refuses pointers that do not fit the heap', () => {
	const { heap } = makeHeap()
	assert.equal(copyPlaybackFrame(heap, 4096 * 4, FRAME * 4), null)
	assert.equal(copyPlaybackFrame(heap, -4, FRAME * 4), null)
	assert.equal(copyPlaybackFrame(heap, 0, 0), null)
	assert.equal(copyPlaybackFrame(null, 0, FRAME * 4), null)
	assert.equal(copyPlaybackFrame(heap, Number.NaN, FRAME * 4), null)
	assert.equal(copyPlaybackFrame(heap, 0, FRAME * 4).length, FRAME)
})

test('§2.82 the playback loop uses the copy helper, not a heap view', () => {
	const src = readFileSync(new URL('../lib/VoIP/wasm-engine.js', import.meta.url), 'utf8')
	const start = src.indexOf('#startAudioPlaybackLoop = () =>')
	const loop = src.slice(start, src.indexOf('#stopAudioPlaybackLoop = () =>', start))
	assert.match(loop, /copyPlaybackFrame\(heapF32, this\.#audioPlaybackBuffer, bufferSize\)/)
	assert.doesNotMatch(loop, /new Float32Array\(heapF32\.buffer/)
})

const makeCall = () => new ActiveCall({ callId: 'c1', peerJid: '1@s.whatsapp.net', engine: {} })

test('§2.82 audioStream delivers float32 frames and ends with the call', async () => {
	const call = makeCall()
	const stream = call.audioStream()
	const got = []
	stream.on('data', chunk => got.push(chunk))
	call._emitAudio(Float32Array.of(0.5, -0.5))
	call._emitAudio(Float32Array.of(0.25))
	call._forceEnd('ended')
	await new Promise(r => stream.on('end', r))
	assert.equal(got.length, 2)
	assert.ok(got[0] instanceof Float32Array)
	assert.deepEqual([...got[0]], [0.5, -0.5])
})

test('§2.82 audioStream can emit 16-bit PCM buffers', async () => {
	const call = makeCall()
	const stream = call.audioStream({ encoding: 'pcm16' })
	const chunks = []
	stream.on('data', c => chunks.push(c))
	call._emitAudio(Float32Array.of(0, 1, -1))
	call._forceEnd('ended')
	await new Promise(r => stream.on('end', r))
	const out = Buffer.concat(chunks)
	assert.equal(out.length, 6)
	assert.equal(out.readInt16LE(0), 0)
	assert.equal(out.readInt16LE(2), 32767)
	assert.equal(out.readInt16LE(4), -32768)
})

test('§2.82 audioStream().stop() detaches without ending the call', async () => {
	const call = makeCall()
	const stream = call.audioStream()
	const got = []
	stream.on('data', c => got.push(c))
	call._emitAudio(Float32Array.of(1))
	stream.stop()
	call._emitAudio(Float32Array.of(2))
	await new Promise(r => stream.on('end', r))
	assert.equal(got.length, 1)
	assert.equal(call.listenerCount('audio'), 0)
	assert.equal(call.listenerCount('ended'), 0)
})

test('§2.82 audioStream validates its encoding and is declared for TypeScript', () => {
	const call = makeCall()
	assert.throws(() => call.audioStream({ encoding: 'mp3' }), /unsupported encoding/)
	const dts = readFileSync(new URL('../lib/VoIP/index.d.ts', import.meta.url), 'utf8')
	assert.match(dts, /audioStream\(opts\?: \{/)
	assert.match(dts, /'float32' \| 'pcm16'/)
	assert.match(readFileSync(new URL('../lib/VoIP/wasm-engine.d.ts', import.meta.url), 'utf8'), /copyPlaybackFrame/)
})
