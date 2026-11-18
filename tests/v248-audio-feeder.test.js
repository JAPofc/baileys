/**
 * tests/v248-audio-feeder.test.js — batch AB (v2.4.8)
 *
 * Covers BUGREPORT §2.65: the call-audio metering loop died when ffmpeg exited, so a
 * prerecorded greeting was cut to its first chunk and the uplink went dead afterwards.
 *
 * `scripts/fixtures/fake-ffmpeg.sh` stands in for ffmpeg: it writes a fixed amount of f32le
 * PCM as fast as it can and exits 0 — the behaviour of real ffmpeg on a short file.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chmodSync } from 'node:fs';

import { AudioFeeder } from '../lib/VoIP/audio-feeder.js';

const FAKE_FFMPEG = fileURLToPath(new URL('../scripts/fixtures/fake-ffmpeg.sh', import.meta.url));
const SAMPLE_RATE = 16000;
const FRAMES = 320; // 20 ms
const CHUNK_MS = 20;

const collect = async (ms, { bytes = SAMPLE_RATE * 4, source = './greeting.mp3' } = {}) => {
	process.env.BYTES = String(bytes);
	const chunks = [];
	const feeder = new AudioFeeder(SAMPLE_RATE, 1, FRAMES, (chunk) => chunks.push(chunk), source);
	feeder.start();
	await new Promise((r) => setTimeout(r, ms));
	feeder.stop();
	return {
		feeder,
		total: chunks.length,
		audio: chunks.filter((c) => c.some((v) => v !== 0)).length
	};
};

describe('§2.65 call audio survives ffmpeg exiting', () => {
	let previous;

	before(() => {
		// the executable bit does not always survive packaging/checkout — restore it
		chmodSync(FAKE_FFMPEG, 0o755);
		previous = process.env.FFMPEG_PATH;
		process.env.FFMPEG_PATH = FAKE_FFMPEG;
	});

	after(() => {
		if (previous === undefined) {
			delete process.env.FFMPEG_PATH;
		} else {
			process.env.FFMPEG_PATH = previous;
		}
	});

	it('meters out the whole file, not just the first chunk', async () => {
		// 1 s of audio = 50 chunks; ffmpeg writes it all and exits within milliseconds
		const { total, audio } = await collect(1600, { bytes: SAMPLE_RATE * 4 });
		assert.ok(audio >= 45, `expected ~50 chunks of real audio, got ${audio}`);
		assert.ok(total >= audio, 'every audio chunk is emitted');
	});

	it('keeps the uplink alive with silence once the audio runs out', async () => {
		const { feeder, total } = await collect(1600, { bytes: SAMPLE_RATE * 4 / 2 }); // 0.5 s of audio
		assert.ok(feeder.underflowChunks > 0, 'silence fillers took over after the file ended');
		assert.ok(total > 50, `the loop kept running: ${total} chunks in 1.6 s`);
	});

	it('emits at roughly real-time cadence, not as fast as it can', async () => {
		const windowMs = 1200;
		const { total } = await collect(windowMs, { bytes: SAMPLE_RATE * 4 * 4 }); // 4 s of audio queued
		const expected = windowMs / CHUNK_MS;
		assert.ok(total <= expected * 1.5, `expected ~${expected} chunks in ${windowMs}ms, got ${total}`);
		assert.ok(total >= expected * 0.4, `expected ~${expected} chunks in ${windowMs}ms, got ${total}`);
	});

	it('stop() really stops it', async () => {
		process.env.BYTES = String(SAMPLE_RATE * 4 * 4);
		let count = 0;
		const feeder = new AudioFeeder(SAMPLE_RATE, 1, FRAMES, () => count++, './greeting.mp3');
		feeder.start();
		await new Promise((r) => setTimeout(r, 400));
		feeder.stop();
		const atStop = count;
		await new Promise((r) => setTimeout(r, 300));
		assert.equal(count, atStop, 'no chunk may be emitted after stop()');
	});

	it('swapSource() reports whether it restarted a running feeder', async () => {
		const feeder = new AudioFeeder(SAMPLE_RATE, 1, FRAMES, () => {}, 'silence');
		assert.equal(feeder.swapSource('./a.mp3'), false, 'not started yet → stored for later');
		assert.equal(feeder.source, './a.mp3');
		feeder.start();
		assert.equal(feeder.swapSource('./b.mp3'), true);
		assert.equal(feeder.source, './b.mp3');
		feeder.stop();
	});

	it('the loop is tied to the feeder, not to the decoder process', async () => {
		const fs = await import('node:fs/promises');
		const source = await fs.readFile(new URL('../lib/VoIP/audio-feeder.js', import.meta.url), 'utf8');
		assert.match(source, /#scheduleNext = \([^)]*\) => \{[\s\S]{0,700}?if \(!this\.#started\) return;/);
		assert.doesNotMatch(source, /#scheduleNext = \([^)]*\) => \{\s*if \(!this\.#proc\) return;/);
	});
});
