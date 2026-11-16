// §2.82 repro -- lib/VoIP/wasm-engine.js hands out a VIEW into the WASM heap as call audio.
//
// The playback loop built the frame like this (verbatim, pre-fix):
//
//   const audioData = new Float32Array(heapF32.buffer, heapF32.byteOffset + index * 4, numFloats)
//   this.#config.callbacks?.onAudioPlaybackData?.(audioData)
//
// That is a window onto live WASM memory, not a copy, and it is handed straight to
// `call.emit('audio', pcm)`. The next tick (16 ms later) writes the next frame into the exact
// same bytes, so any listener that does not consume the array synchronously -- buffering it,
// awaiting an upload, feeding a transcriber -- reads whatever audio arrived later. If the
// WASM heap grows, the old view is detached and the listener gets nothing at all.
const FRAME = 320                 // floats per 20 ms frame, as in the engine
const heap = new Float32Array(4096)
const ptr = 1024                  // byte offset into the heap
const index = Math.floor(ptr / 4)

const writeFrame = value => heap.fill(value, index, index + FRAME)

const oldWay = () => new Float32Array(heap.buffer, heap.byteOffset + index * 4, FRAME)
const { copyPlaybackFrame } = await import('../lib/VoIP/wasm-engine.js')
const newWay = () => copyPlaybackFrame(heap, ptr, FRAME * 4)

console.log('an async listener keeps each frame and inspects it one tick later:\n')
for (const [label, grab] of [['BEFORE (heap view)', oldWay], ['AFTER  (copied frame)', newWay]]) {
	writeFrame(0.25)
	const kept = grab()
	const sawAtCapture = kept[0]
	writeFrame(-0.75)              // the engine overwrites the same memory 16 ms later
	await new Promise(r => setImmediate(r))
	const sawLater = kept[0]
	console.log(`  ${label}  captured ${sawAtCapture}, reads back ${sawLater} ` +
		`${sawAtCapture === sawLater ? ' ok' : ' *** FRAME CORRUPTED ***'}`)
}

// and what a heap growth does to a frame that is still queued
writeFrame(0.5)
const keptView = oldWay()
const keptCopy = newWay()
structuredClone(heap.buffer, { transfer: [heap.buffer] })   // detach, like a wasm memory.grow
console.log(`\n  after the heap is replaced (memory.grow):`)
console.log(`    view  -> ${keptView.length} samples (silence / nothing to write)`)
console.log(`    copy  -> ${keptCopy.length} samples, first = ${keptCopy[0]}`)
