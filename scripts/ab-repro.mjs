/**
 * scripts/ab-repro.mjs --- batch AB repro for BUGREPORT 2.65
 *
 * `AudioFeeder` decodes the call's audio source with ffmpeg and meters it out to the WASM
 * uplink at real-time cadence (one 20 ms chunk at a time). ffmpeg, however, finishes
 * decoding a short file almost instantly and exits — and the metering loop was gated on the
 * decoder process still being alive. The moment ffmpeg exited, the loop stopped: everything
 * still queued was dropped and the uplink stalled.
 *
 * The "before" run is the real module with that one guard reverted (written to a temporary
 * sibling file so its relative imports still resolve), driven by a stand-in ffmpeg that
 * writes a fixed amount of PCM and exits — exactly what real ffmpeg does with a greeting.
 *
 * Run: node scripts/ab-repro.mjs
 */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chmodSync } from 'fs'

chmodSync(new URL('./fixtures/fake-ffmpeg.sh', import.meta.url), 0o755)

const here = new URL('./', import.meta.url);
process.env.FFMPEG_PATH = fileURLToPath(new URL('./fixtures/fake-ffmpeg.sh', here));
process.env.BYTES = String(16000 * 4 * 2); // 2 s of 16 kHz mono f32le

const SOURCE = fileURLToPath(new URL('../lib/VoIP/audio-feeder.js', here));
const FIXED = 'if (!this.#started) return;';
const BUGGY = 'if (!this.#proc) return;';

const run = async (moduleUrl, label) => {
	const { AudioFeeder } = await import(moduleUrl);
	let emitted = 0;
	let nonSilent = 0;
	const feeder = new AudioFeeder(16000, 1, 320, (chunk) => {
		emitted += 1;
		if (chunk.some((v) => v !== 0)) {
			nonSilent += 1;
		}
	}, './greeting.mp3');

	feeder.start();
	await new Promise((r) => setTimeout(r, 3000));
	feeder.stop();

	console.log(
		`${label.padEnd(7)} decoded ${feeder.bytesProduced} bytes (= 100 chunks of 20 ms) ` +
		`→ emitted ${String(emitted).padStart(3)} chunks, ${String(nonSilent).padStart(3)} of them real audio, ` +
		`${feeder.underflowChunks} silence fillers`
	);
	return { emitted, nonSilent };
};

const source = readFileSync(SOURCE, 'utf8');
if (!source.includes(FIXED)) {
	throw new Error('audio-feeder.js no longer contains the fixed guard — update this repro');
}

const buggyPath = SOURCE.replace(/audio-feeder\.js$/, 'audio-feeder.__prefix__.mjs');
writeFileSync(buggyPath, source.replace(FIXED, BUGGY));

try {
	console.log('=== a 2 s greeting, metered to the call uplink ===');
	const before = await run(`file://${buggyPath}`, 'BEFORE');
	const after = await run(`file://${SOURCE}`, 'AFTER');
	console.log(`\nthe caller hears ~${(before.nonSilent * 20) / 1000}s of the greeting before the fix, ` +
		`~${(after.nonSilent * 20) / 1000}s after it`);
	console.log('and after the greeting the uplink keeps flowing (silence) instead of going dead');
} finally {
	try {
		unlinkSync(buggyPath);
	} catch {
		/* best effort */
	}
}
