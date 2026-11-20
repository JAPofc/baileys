// Tests for round: conversation flows, webhook bridge (against a real HTTP
// server), WhatsApp link helpers, pure-JS media probe, media-type guard and
// the process health monitor.
import { test } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import {
	createConversationFlow,
	createWebhookBridge,
	verifyWebhookSignature,
	buildWaMeLink,
	buildGroupInviteUrl,
	buildChannelUrl,
	parseWaLink,
	extractUrls,
	containsWaLink,
	getImageFormat,
	getImageDimensions,
	createMediaGuard,
	detectMediaType,
	createHealthMonitor
} from '../lib/index.js';

const makeEv = () => {
	const handlers = {};
	return {
		on: (event, fn) => {
			(handlers[event] ||= []).push(fn);
		},
		off: (event, fn) => {
			handlers[event] = (handlers[event] || []).filter(f => f !== fn);
		},
		emit: (event, payload) => Promise.all((handlers[event] || []).map(fn => fn(payload)))
	};
};

// -------------------------------------------------------- conversation flow

test('conversation flow: prompts, validation, parse, completion', async () => {
	const sent = [];
	const sock = { ev: makeEv(), sendMessage: async (_jid, content) => sent.push(content.text) };
	const flows = createConversationFlow({ timeoutMs: 0 });
	flows.define('order', [
		{ id: 'item', prompt: 'Mau pesan apa?' },
		{ id: 'qty', prompt: 'Berapa banyak?', validate: t => /^\d+$/.test(t) || 'Angka saja!', parse: t => +t },
		{ id: 'confirm', prompt: a => `${a.qty}x ${a.item} — ketik yes` }
	]);
	flows.bind(sock);
	const done = [];
	flows.onComplete(e => done.push(e));
	const steps = [];
	flows.onStep(s => steps.push(s.step));

	await flows.start(sock, 'g@g.us', 'u@s.whatsapp.net', 'order');
	assert.equal(flows.isActive('g@g.us', 'u@s.whatsapp.net'), true);
	assert.equal(flows.getSession('g@g.us', 'u@s.whatsapp.net').totalSteps, 3);

	const mk = (text) => ({ key: { remoteJid: 'g@g.us', id: `${Math.random()}`, participant: 'u@s.whatsapp.net' }, message: { conversation: text } });
	await sock.ev.emit('messages.upsert', { messages: [mk('Nasi Goreng')] });
	await sock.ev.emit('messages.upsert', { messages: [mk('dua')] }); // invalid → re-prompt
	await sock.ev.emit('messages.upsert', { messages: [mk('2')] });
	await sock.ev.emit('messages.upsert', { messages: [mk('yes')] });

	assert.equal(done.length, 1);
	assert.deepEqual(done[0].answers, { item: 'Nasi Goreng', qty: 2, confirm: 'yes' });
	assert.equal(sent[0], 'Mau pesan apa?');
	assert.equal(sent[2], 'Angka saja!', 'validation message sent without advancing');
	assert.equal(sent[3], '2x Nasi Goreng — ketik yes', 'dynamic prompt sees earlier answers');
	assert.deepEqual(steps, ['item', 'qty', 'confirm']);
	assert.equal(flows.isActive('g@g.us', 'u@s.whatsapp.net'), false);
	assert.equal(await flows.answer('g@g.us', 'u@s.whatsapp.net', 'x'), null, 'no session → null');
	await assert.rejects(() => flows.start(sock, 'g@g.us', 'u@s.whatsapp.net', 'ghost'), /unknown flow/);
});

test('conversation flow: cancel words, manual cancel, seeded answers', async () => {
	const sock = { ev: makeEv(), sendMessage: async () => ({}) };
	const flows = createConversationFlow({ timeoutMs: 0 });
	flows.define('reg', [{ id: 'name', prompt: 'Nama?' }, { id: 'age', prompt: 'Umur?' }]);
	flows.bind(sock);
	const cancelled = [];
	flows.onCancel(e => cancelled.push([e.reason, e.answers]));

	await flows.start(sock, 'dm@s.whatsapp.net', 'dm@s.whatsapp.net', 'reg', { source: 'ad' });
	const mk = (text) => ({ key: { remoteJid: 'dm@s.whatsapp.net', id: `${Math.random()}` }, message: { conversation: text } });
	await sock.ev.emit('messages.upsert', { messages: [mk('Budi')] });
	await sock.ev.emit('messages.upsert', { messages: [mk(' BATAL ')] });
	assert.equal(cancelled.length, 1);
	assert.equal(cancelled[0][0], 'cancelled');
	assert.deepEqual(cancelled[0][1], { source: 'ad', name: 'Budi' }, 'seed + partial answers reported');

	await flows.start(sock, 'dm@s.whatsapp.net', 'dm@s.whatsapp.net', 'reg');
	assert.equal(flows.cancel('dm@s.whatsapp.net', 'dm@s.whatsapp.net', 'admin-stop'), true);
	assert.equal(cancelled[1][0], 'admin-stop');
	assert.equal(flows.size, 0);
});

// ------------------------------------------------------------ webhook bridge

test('webhook bridge: delivers signed events to a real HTTP server', async () => {
	const received = [];
	const server = createServer((req, res) => {
		let body = '';
		req.on('data', c => (body += c));
		req.on('end', () => {
			received.push({ sig: req.headers['x-jap-signature'], body });
			res.writeHead(200);
			res.end('ok');
		});
	});
	await new Promise(r => server.listen(0, '127.0.0.1', r));
	const port = server.address().port;

	const bridge = createWebhookBridge(`http://127.0.0.1:${port}/hook`, {
		secret: 'rahasia',
		events: ['messages.upsert']
	});
	const sock = { ev: makeEv() };
	bridge.bind(sock);
	const delivered = [];
	bridge.onDelivered(d => delivered.push(d.status));

	await sock.ev.emit('messages.upsert', { messages: [{ key: { id: '1' } }], type: 'notify' });
	await new Promise(r => setTimeout(r, 200));

	assert.equal(received.length, 1);
	const parsed = JSON.parse(received[0].body);
	assert.equal(parsed.event, 'messages.upsert');
	assert.equal(parsed.payload.type, 'notify');
	assert.ok(parsed.sentAt > 0);
	assert.equal(verifyWebhookSignature(received[0].body, received[0].sig, 'rahasia'), true);
	assert.equal(verifyWebhookSignature(received[0].body, received[0].sig, 'salah'), false);
	assert.equal(verifyWebhookSignature(received[0].body, undefined, 'rahasia'), false);
	assert.deepEqual(delivered, [200]);
	assert.deepEqual(bridge.stats, { delivered: 1, failed: 0 });

	bridge.unbind();
	await sock.ev.emit('messages.upsert', { messages: [] });
	await new Promise(r => setTimeout(r, 100));
	assert.equal(received.length, 1, 'unbind stops forwarding');
	server.close();
});

test('webhook bridge: retries 5xx then succeeds; transform can skip events', async () => {
	let failFirst = true;
	let hits = 0;
	const server = createServer((req, res) => {
		req.resume();
		req.on('end', () => {
			hits++;
			if (failFirst) {
				failFirst = false;
				res.writeHead(500);
				res.end();
				return;
			}
			res.writeHead(200);
			res.end();
		});
	});
	await new Promise(r => server.listen(0, '127.0.0.1', r));
	const port = server.address().port;

	const bridge = createWebhookBridge(`http://127.0.0.1:${port}/x`, { retries: 2, retryDelayMs: 10 });
	const result = await bridge.send('test', { a: 1 });
	assert.equal(result.ok, true);
	assert.equal(result.attempt, 1, 'succeeded on the retry');
	assert.equal(hits, 2);

	const filtering = createWebhookBridge(`http://127.0.0.1:${port}/x`, {
		transform: (event) => (event === 'skip-me' ? null : { kept: true })
	});
	assert.deepEqual(await filtering.send('skip-me', {}), { skipped: true });
	const kept = await filtering.send('keep', {});
	assert.equal(kept.ok, true);
	server.close();
	assert.throws(() => createWebhookBridge(''), /requires a webhook URL/);
});

// ------------------------------------------------------------------ wa-links

test('wa-links: build and parse every WhatsApp link flavor', () => {
	assert.equal(buildWaMeLink('+62 812-3456-7890', 'Halo bro!'), 'https://wa.me/6281234567890?text=Halo%20bro!');
	assert.equal(buildWaMeLink('628123@s.whatsapp.net'), 'https://wa.me/628123');
	assert.equal(buildWaMeLink('00628123'), 'https://wa.me/628123', '00 prefix stripped');
	assert.throws(() => buildWaMeLink('08123456'), /leading 0/);
	assert.throws(() => buildWaMeLink(''), /international/);

	assert.deepEqual(parseWaLink('https://wa.me/628123?text=Hi'), { type: 'chat', phone: '628123', text: 'Hi' });
	assert.deepEqual(parseWaLink('https://wa.me/628123'), { type: 'chat', phone: '628123' });
	assert.equal(parseWaLink('https://api.whatsapp.com/send?phone=%2B628123&text=Yo').phone, '628123');
	const invite = parseWaLink('https://chat.whatsapp.com/AbCdEfGh1234567890');
	assert.equal(invite.type, 'group-invite');
	assert.equal(invite.code, 'AbCdEfGh1234567890');
	assert.equal(parseWaLink('https://www.whatsapp.com/channel/0029VaXYZ').type, 'channel');
	assert.equal(parseWaLink('https://chat.whatsapp.com/short'), null, 'short codes rejected');
	assert.equal(parseWaLink('https://google.com'), null);
	assert.equal(parseWaLink('bukan url'), null);

	assert.equal(buildGroupInviteUrl('AbCdEfGh1234567890'), 'https://chat.whatsapp.com/AbCdEfGh1234567890');
	assert.equal(buildGroupInviteUrl('https://chat.whatsapp.com/AbCdEfGh1234567890'), 'https://chat.whatsapp.com/AbCdEfGh1234567890');
	assert.throws(() => buildGroupInviteUrl('nope'), /invalid/);
	assert.equal(buildChannelUrl('0029Va'), 'https://whatsapp.com/channel/0029Va');

	assert.deepEqual(extractUrls('cek https://a.id/x, dan http://b.com! ya'), ['https://a.id/x', 'http://b.com']);
	assert.deepEqual(extractUrls('tanpa link'), []);
	assert.equal(containsWaLink('join https://chat.whatsapp.com/AbCdEfGh1234567890 skuy'), true);
	assert.equal(containsWaLink('cuma https://google.com'), false);
});

// --------------------------------------------------------------- media probe

test('media probe: detects png/jpeg/gif/webp/bmp formats and dimensions', () => {
	const png = Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		Buffer.from('0000000d49484452', 'hex'),
		Buffer.from([0, 0, 2, 0, 0, 0, 1, 0, 8, 6, 0, 0, 0]) // 512x256
	]);
	const gif = Buffer.concat([Buffer.from('GIF89a'), Buffer.from([0x40, 0x01, 0xc8, 0x00]), Buffer.alloc(4)]); // 320x200
	const jpeg = Buffer.concat([
		Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
		Buffer.alloc(14),
		Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x00, 0x02, 0x00]), // SOF0: h=256 w=512
		Buffer.alloc(10)
	]);
	const bmp = Buffer.concat([Buffer.from('BM'), Buffer.alloc(16), Buffer.from([0x80, 0, 0, 0]), Buffer.from([0x40, 0, 0, 0]), Buffer.alloc(4)]); // 128x64
	const webp = Buffer.concat([
		Buffer.from('RIFF'), Buffer.from([17, 0, 0, 0]), Buffer.from('WEBPVP8L'),
		Buffer.from([5, 0, 0, 0]), Buffer.from([0x2f, 0, 0, 0, 0]), Buffer.from([0])
	]);

	assert.deepEqual(getImageDimensions(png), { format: 'png', width: 512, height: 256 });
	assert.deepEqual(getImageDimensions(gif), { format: 'gif', width: 320, height: 200 });
	assert.deepEqual(getImageDimensions(jpeg), { format: 'jpeg', width: 512, height: 256 });
	assert.deepEqual(getImageDimensions(bmp), { format: 'bmp', width: 128, height: 64 });
	assert.deepEqual(getImageDimensions(webp), { format: 'webp', width: 1, height: 1 });
	assert.equal(getImageFormat(png), 'png');
	assert.equal(getImageFormat(Buffer.from('junkjunkjunkjunk')), null);
	assert.equal(getImageDimensions(Buffer.from('x')), null, 'tiny buffers never throw');
	assert.equal(getImageDimensions(Buffer.concat([png.subarray(0, 12)])), null, 'truncated png handled');
});

// --------------------------------------------------------------- media guard

test('media guard: global blocks, per-chat rules, wrappers, exemptions', async () => {
	const deleted = [];
	const sock = { ev: makeEv(), sendMessage: async (_j, content) => deleted.push(content) };
	const guard = createMediaGuard({
		blocked: ['sticker'],
		rules: { 'strict@g.us': ['image', 'sticker'] },
		autoDelete: true,
		exemptUsers: ['adm@s.whatsapp.net']
	});
	guard.bind(sock);
	const hits = [];
	guard.onDetected(d => hits.push([d.key.id, d.mediaType, d.deleted]));

	const mk = (chat, participant, message, id) => ({ key: { remoteJid: chat, participant, id }, message });
	await sock.ev.emit('messages.upsert', {
		messages: [
			mk('g@g.us', 'u@s.whatsapp.net', { stickerMessage: {} }, '1'), // global block
			mk('g@g.us', 'u@s.whatsapp.net', { imageMessage: {} }, '2'), // image fine globally
			mk('strict@g.us', 'u@s.whatsapp.net', { imageMessage: {} }, '3'), // chat rule
			mk('strict@g.us', 'adm@s.whatsapp.net', { stickerMessage: {} }, '4'), // exempt
			mk('g@g.us', 'u@s.whatsapp.net', { viewOnceMessageV2: { message: { stickerMessage: {} } } }, '5'), // wrapped
			mk('dm@s.whatsapp.net', undefined, { stickerMessage: {} }, '6') // dm ignored
		]
	});
	assert.deepEqual(hits.map(h => h[0]), ['1', '3', '5']);
	assert.equal(hits[1][1], 'image');
	assert.ok(hits.every(h => h[2] === true));
	assert.equal(deleted.length, 3);

	guard.setRule('g@g.us', ['video']);
	await guard.handler({ messages: [mk('g@g.us', 'u@s.whatsapp.net', { stickerMessage: {} }, '7')] }, sock);
	assert.equal(hits.length, 3, 'per-chat rule replaces the global list');
	assert.deepEqual(guard.getRule('g@g.us'), ['video']);
	assert.equal(guard.setRule('g@g.us', null), true);

	assert.equal(detectMediaType({ documentWithCaptionMessage: { message: { documentMessage: {} } } }), 'document');
	assert.equal(detectMediaType({ pollCreationMessageV3: {} }), 'poll');
	assert.equal(detectMediaType({ ephemeralMessage: { message: { videoMessage: {} } } }), 'video');
	assert.equal(detectMediaType({ conversation: 'hi' }), null);
});

// ------------------------------------------------------------ health monitor

test('health monitor: snapshots, probes, threshold alerts fire once per crossing', async () => {
	const monitor = createHealthMonitor({ thresholds: { heapUsedMb: 0.001, pendingJobs: 5 } });
	monitor.addProbe('pendingJobs', () => 7);
	monitor.addProbe('broken', () => {
		throw new Error('probe boom');
	});
	const alerts = [];
	monitor.onAlert(a => alerts.push(a.metric));
	const snapshots = [];
	monitor.onSnapshot(s => snapshots.push(s));

	const snap = await monitor.snapshot();
	assert.ok(snap.heapUsedMb > 0);
	assert.ok(snap.rssMb > 0);
	assert.equal(typeof snap.eventLoopLagMs, 'number');
	assert.equal(snap.probes.pendingJobs, 7);
	assert.equal(snap.probes.broken.error, 'probe boom', 'probe failures captured, not thrown');

	await monitor.snapshot(); // still over → no duplicate alert
	assert.deepEqual(alerts.sort(), ['heapUsedMb', 'pendingJobs'], 'one alert per crossing');
	assert.equal(monitor.isAlerting('heapUsedMb'), true);
	assert.equal(monitor.getHistory().length, 2);
	assert.equal(snapshots.length, 2);

	assert.throws(() => monitor.addProbe('x', 'not a function'), TypeError);
	assert.equal(monitor.isRunning, false);
	const stop = monitor.start();
	assert.equal(monitor.isRunning, true);
	stop();
	assert.equal(monitor.isRunning, false);
});

// ------------------------------------------------------------------ exports

test('barrel and type definitions export the new modules', () => {
	const utilsIndex = readFileSync(new URL('../lib/Utils/index.js', import.meta.url), 'utf8');
	const utilsDts = readFileSync(new URL('../lib/Utils/index.d.ts', import.meta.url), 'utf8');
	for (const mod of ['conversation-flow', 'webhook-bridge', 'wa-links', 'media-probe', 'media-guard', 'health-monitor']) {
		assert.ok(utilsIndex.includes(`./${mod}.js`), `index.js exports ${mod}`);
		assert.ok(utilsDts.includes(`./${mod}`), `index.d.ts exports ${mod}`);
		const src = readFileSync(new URL(`../lib/Utils/${mod}.d.ts`, import.meta.url), 'utf8');
		assert.match(src, /export declare const/, `${mod}.d.ts declares its API`);
	}
});
