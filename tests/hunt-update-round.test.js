// Tests for the hunt/update round: WA version bump, conversation-flow back
// steps, url-watcher conditional requests, health probe timeouts,
// crash-guard alert throttling, webhook body caps, business short links,
// participant-diff formatting, boxed text and reminder lists.
import { test } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import * as B from '../lib/index.js';

const makeEv = () => {
	const handlers = {};
	return {
		on: (e, f) => { (handlers[e] ||= []).push(f); },
		off: (e, f) => { handlers[e] = (handlers[e] || []).filter(x => x !== f); },
		emit: (e, p) => Promise.all((handlers[e] || []).map(f => f(p)))
	};
};

test('WA web version bumped to the current live revision', () => {
	const defaults = readFileSync(new URL('../lib/Defaults/index.js', import.meta.url), 'utf8');
	assert.match(defaults, /\[2, 3000, 1048606905\]/);
	assert.ok(!defaults.includes('1048590665'));
});

test('conversation flow: back words rewind one step and re-prompt', async () => {
	const sent = [];
	const sock = { ev: makeEv(), sendMessage: async (_j, c) => sent.push(c.text) };
	const flows = B.createConversationFlow({ timeoutMs: 0 });
	flows.define('reg', [{ id: 'nama', prompt: 'Nama?' }, { id: 'umur', prompt: 'Umur?' }]);
	flows.bind(sock);
	const done = [];
	flows.onComplete(e => done.push(e.answers));

	await flows.start(sock, 'c', 'c', 'reg');
	const mk = (t) => ({ key: { remoteJid: 'c', id: `${Math.random()}` }, message: { conversation: t } });
	await sock.ev.emit('messages.upsert', { messages: [mk('Budi')] });
	await sock.ev.emit('messages.upsert', { messages: [mk('KEMBALI')] });
	assert.equal(sent.filter(s => s === 'Nama?').length, 2, 'back re-prompts the previous step');
	await sock.ev.emit('messages.upsert', { messages: [mk('Ani')] });
	await sock.ev.emit('messages.upsert', { messages: [mk('20')] });
	assert.deepEqual(done[0], { nama: 'Ani', umur: '20' }, 'rewound answer replaced');
	// back on the first step is a harmless re-prompt
	await flows.start(sock, 'c', 'c', 'reg');
	assert.equal(await flows.answer('c', 'c', 'back'), 'back');
});

test('url watcher: ETag conditional requests count as unchanged', async () => {
	let etagHits = 0;
	let fullHits = 0;
	const server = createServer((req, res) => {
		if (req.headers['if-none-match'] === '"v1"') {
			etagHits++;
			res.writeHead(304);
			res.end();
			return;
		}
		fullHits++;
		res.writeHead(200, { etag: '"v1"' });
		res.end('BODY');
	});
	await new Promise(r => server.listen(0, '127.0.0.1', r));
	const watcher = B.createUrlWatcher(`http://127.0.0.1:${server.address().port}/x`);
	const changes = [];
	watcher.onChange(() => changes.push(1));
	await watcher.check();
	const second = await watcher.check();
	assert.equal(fullHits, 1, 'body downloaded once');
	assert.equal(etagHits, 1);
	assert.equal(second.notModified, true);
	assert.equal(second.changed, false);
	assert.equal(watcher.stats.notModifiedHits, 1);
	assert.equal(changes.length, 0);
	server.close();
});

test('health probe timeout, crash-guard alert throttle, webhook body cap', async () => {
	const monitor = B.createHealthMonitor({ probeTimeoutMs: 50 });
	monitor.addProbe('hang', () => new Promise(() => { }));
	monitor.addProbe('fast', () => 1);
	const snap = await monitor.snapshot();
	assert.equal(snap.probes.hang.error, 'probe timed out');
	assert.equal(snap.probes.fast, 1, 'other probes unaffected');

	const alerts = [];
	const silent = { error: () => { }, child: () => silent };
	const guard = B.installCrashGuard({ onError: e => alerts.push(e.type), minAlertIntervalMs: 60_000, logger: silent });
	const handler = process.listeners('uncaughtException').at(-1);
	handler(new Error('1'));
	handler(new Error('2'));
	handler(new Error('3'));
	assert.equal(alerts.length, 1, 'alert storm throttled');
	assert.equal(guard.stats.uncaughtException, 3, 'still counted');
	guard.uninstall();

	let received;
	const server = createServer((req, res) => {
		let b = '';
		req.on('data', c => (b += c));
		req.on('end', () => {
			received = b;
			res.writeHead(200);
			res.end();
		});
	});
	await new Promise(r => server.listen(0, '127.0.0.1', r));
	const bridge = B.createWebhookBridge(`http://127.0.0.1:${server.address().port}/x`, { maxBodyBytes: 200 });
	await bridge.send('big', { blob: 'x'.repeat(10_000) });
	const parsed = JSON.parse(received);
	assert.equal(parsed.payload.truncated, true);
	assert.ok(parsed.payload.originalBytes > 10_000);
	assert.ok(Buffer.byteLength(received) < 300);
	server.close();
});

test('business links, diff formatting, boxes, reminder lists', () => {
	const biz = B.parseWaLink('https://wa.me/message/ABC123xyz');
	assert.deepEqual(biz, { type: 'business-message', code: 'ABC123xyz', url: 'https://wa.me/message/ABC123xyz' });
	assert.equal(B.parseWaLink('https://wa.me/628123').type, 'chat', 'plain wa.me untouched');

	const text = B.formatParticipantChanges({ added: ['a@s'], removed: ['b@s'], promoted: ['c@s'], demoted: [] });
	assert.ok(text.includes('➕ @a') && text.includes('➖ @b') && text.includes('⬆️ @c'));
	assert.ok(!text.includes('⬇️'));
	assert.equal(B.formatParticipantChanges({}), '(no changes)');

	const box = B.boxText('MENU');
	assert.equal(box.split('\n')[0], '╔══════╗');
	assert.ok(box.includes('║ MENU ║'));
	assert.ok(box.endsWith('╚══════╝'));
	const multi = B.boxText('AB\nCDEF', { style: 'round' });
	assert.ok(multi.startsWith('╭') && multi.includes('│ AB   │') && multi.includes('│ CDEF │'));

	let t = 0;
	const reminders = B.createReminderManager({ now: () => t });
	reminders.add({ chat: 'c', user: 'u', text: 'meeting', inMs: 90 * 60_000 });
	reminders.add({ chat: 'c', user: 'u', text: 'tiap jam', inMs: 5 * 60_000, repeatMs: 3_600_000 });
	const list = reminders.renderList({ chat: 'c' });
	assert.ok(list.includes('tiap jam — 5m lagi 🔁'));
	assert.ok(list.includes('meeting — 1j 30m lagi'));
	assert.ok(reminders.renderList({ chat: 'x' }).includes('kosong'));
	reminders.clear();
});

test('type definitions declare the round', () => {
	const checks = [
		['conversation-flow.d.ts', ['backWords']],
		['url-watcher.d.ts', ['notModified', 'notModifiedHits']],
		['health-monitor.d.ts', ['probeTimeoutMs']],
		['crash-guard.d.ts', ['minAlertIntervalMs']],
		['webhook-bridge.d.ts', ['maxBodyBytes']],
		['wa-links.d.ts', ['business-message']],
		['group-tools.d.ts', ['formatParticipantChanges']],
		['fancy-text.d.ts', ['boxText']],
		['reminders.d.ts', ['renderList']]
	];
	for (const [file, needles] of checks) {
		const src = readFileSync(new URL(`../lib/Utils/${file}`, import.meta.url), 'utf8');
		for (const needle of needles) {
			assert.ok(src.includes(needle), `${file} declares ${needle}`);
		}
	}
});
