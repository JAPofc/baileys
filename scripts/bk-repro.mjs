// §2.107 repro -- AudioFeeder.stop() can leave ffmpeg alive forever, which keeps the whole
// Node process alive. Back-pressure pauses the decoder's stdout; stop() then SIGTERMs ffmpeg
// while it is blocked writing into that full, never-drained pipe, so it never dies -- and the
// open pipe keeps the event loop busy. Needs a real ffmpeg.
import { AudioFeeder } from '../lib/VoIP/audio-feeder.js'
import { execSync } from 'node:child_process'

const alive = () => {
	try {
		const out = execSync("ps -eo pid,args | grep ffmpeg | grep aevalsrc | grep -v grep || true", { encoding: 'utf8' })
		return out.split('\n').filter(Boolean).length
	} catch { return '?' }
}

const feeder = new AudioFeeder(16000, 1, 320, () => {}, 'silence')
feeder.start()
await new Promise(r => setTimeout(r, 1200))   // long enough for the queue to hit the watermark
console.log('while running   : ffmpeg processes =', alive())
feeder.stop()
await new Promise(r => setTimeout(r, 1500))
console.log('1.5s after stop(): ffmpeg processes =', alive(), '  ← should be 0')

const handles = process._getActiveHandles().filter(h => h.constructor?.name !== 'WriteStream' && h.constructor?.name !== 'ReadStream')
console.log('child-process handles still open:', handles.filter(h => h.constructor?.name === 'ChildProcess').length)
setTimeout(() => {
	console.log('\n*** still running 3s later — this is what hangs `node --test` ***')
	process.exit(1)
}, 3000).unref()
