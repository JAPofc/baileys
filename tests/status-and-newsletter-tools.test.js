// Tests for status and newsletter tools: status auto-styling (wired into
// the status broadcast path) and paced batch newsletter operations.
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
	prepareStatusContent,
	randomStatusColor,
	randomStatusFont,
	followManyNewsletters,
	unfollowManyNewsletters,
	muteManyNewsletters
} from '../lib/index.js';

// ------------------------------------------------------------ status tools

test('status tools: text auto-style, pins respected, media/audio normalization', () => {
	assert.match(randomStatusColor(), /^#[0-9a-f]{6}$/);
	assert.equal(randomStatusColor({ random: () => 0 }), '#000000');
	assert.equal(randomStatusFont({ random: () => 0.99 }), 8);
	assert.equal(randomStatusFont({ random: () => 0 }), 0);

	const seq = (values) => {
		let i = 0;
		return () => values[i++ % values.length];
	};
	const text = prepareStatusContent({ text: 'Halo!' }, { random: seq([0.5]) });
	assert.equal(text.styleOptions.font, 4);
	assert.match(text.styleOptions.textColor, /^#/);
	assert.match(text.styleOptions.backgroundColor, /^#/);
	assert.equal(text.content.text, 'Halo!');
	assert.ok(!('font' in text.content), 'style fields moved out of the content');

	const pinned = prepareStatusContent({ text: 'x', font: 2, backgroundColor: '#112233' });
	assert.equal(pinned.styleOptions.font, 2, 'explicit font wins over random');
	assert.equal(pinned.styleOptions.backgroundColor, '#112233');

	const off = prepareStatusContent({ text: 'x' }, { autoStyle: false });
	assert.deepEqual(off.styleOptions, {}, 'autoStyle: false leaves everything alone');

	const image = prepareStatusContent({ image: { url: 'x' }, text: 'cap', font: 3, backgroundColor: '#fff' });
	assert.equal(image.content.caption, 'cap', 'text becomes caption on media');
	assert.ok(!('text' in image.content) && !('font' in image.content));
	assert.deepEqual(image.styleOptions, {});
	assert.equal(prepareStatusContent({ image: { url: 'x' }, caption: 'asli', text: 'ignored' }).content.caption, 'asli');

	const audio = prepareStatusContent({ audio: { url: 'x' }, text: 'drop', backgroundColor: '#aabbcc' });
	assert.equal(audio.styleOptions.ptt, true, 'voice statuses default to ptt');
	assert.equal(audio.styleOptions.backgroundColor, '#aabbcc', 'audio keeps the card color');
	assert.ok(!('text' in audio.content));
	assert.equal(prepareStatusContent({ audio: { url: 'x' }, ptt: false }).styleOptions.ptt, false);

	const source = { text: 'a', font: 1 };
	prepareStatusContent(source);
	assert.deepEqual(source, { text: 'a', font: 1 }, 'input never mutated');
});

test('status auto-styling is wired into the status broadcast path', () => {
	const src = readFileSync(new URL('../lib/Socket/messages-send.js', import.meta.url), 'utf8');
	assert.ok(src.includes("import { prepareStatusContent } from '../Utils/status-tools.js'"));
	const branch = src.slice(src.indexOf('if (Array.isArray(jid))'));
	assert.ok(branch.includes('prepareStatusContent(content'), 'array/status branch prepares the content');
	assert.ok(branch.includes('...styleOptions'), 'derived styles passed to generateWAMessage');
	assert.ok(branch.includes("options.autoStyle !== false"), 'opt-out supported');
});

// ------------------------------------------------------- newsletter batches

test('newsletter batches: pacing, per-jid verdicts, progress, guards', async () => {
	const calls = [];
	const sock = {
		newsletterFollow: async (jid) => {
			calls.push(['follow', jid]);
			if (jid === 'bad@newsletter') {
				throw new Error('nope');
			}
		},
		newsletterUnfollow: async (jid) => calls.push(['unfollow', jid]),
		newsletterMute: async (jid) => calls.push(['mute', jid])
	};

	const progress = [];
	const start = Date.now();
	const report = await followManyNewsletters(
		sock,
		['a@newsletter', 'bad@newsletter', 'c@newsletter'],
		{ delayMs: 30, onProgress: (p) => progress.push(p.index) }
	);
	assert.equal(report.total, 3);
	assert.deepEqual(report.ok, ['a@newsletter', 'c@newsletter']);
	assert.equal(report.failed.length, 1);
	assert.equal(report.failed[0].jid, 'bad@newsletter', 'failures never abort the batch');
	assert.ok(Date.now() - start >= 60, 'paced between operations');
	assert.deepEqual(progress, [1, 2, 3]);

	assert.equal((await unfollowManyNewsletters(sock, ['x@newsletter'], { delayMs: 0 })).ok.length, 1);
	assert.equal((await muteManyNewsletters(sock, 'y@newsletter', { delayMs: 0 })).ok.length, 1, 'single jid accepted');
	assert.ok(calls.some(c => c[0] === 'unfollow') && calls.some(c => c[0] === 'mute'));

	await assert.rejects(() => followManyNewsletters({}, ['a']), /newsletterFollow/);
	const empty = await followManyNewsletters(sock, [], { delayMs: 0 });
	assert.deepEqual(empty, { ok: [], failed: [], total: 0 });
});

// ------------------------------------------------------------------ exports

test('barrel and type definitions export the status and newsletter tools', () => {
	const utilsIndex = readFileSync(new URL('../lib/Utils/index.js', import.meta.url), 'utf8');
	const utilsDts = readFileSync(new URL('../lib/Utils/index.d.ts', import.meta.url), 'utf8');
	for (const mod of ['status-tools', 'newsletter-tools']) {
		assert.ok(utilsIndex.includes(`./${mod}.js`), `index.js exports ${mod}`);
		assert.ok(utilsDts.includes(`./${mod}`), `index.d.ts exports ${mod}`);
		const src = readFileSync(new URL(`../lib/Utils/${mod}.d.ts`, import.meta.url), 'utf8');
		assert.match(src, /export declare const/, `${mod}.d.ts declares its API`);
	}
});
