/**
 * tests/v2410-batch-bz.test.js — batch BZ (v2.4.10)
 *
 * §2.147 sticker-pack media cache served the wrong pack
 * §2.148 isAnimatedWebP() matched "ANIM" anywhere in the file
 * §2.149 the signal key cache was filled before the store accepted the write
 * §2.150 the in-memory store mutated the shared messages.update payload
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import { isAnimatedWebP, isWebPBuffer } from '../lib/Utils/stickerpack.js';
import { makeCacheableSignalKeyStore } from '../lib/Utils/auth-utils.js';
import { makeInMemoryStore } from '../lib/Store/make-in-memory-store.js';

const quiet = {
	level: 'silent',
	child() { return quiet; },
	trace() {}, debug() {}, info() {}, warn() {}, error() {}
};

// --- helpers for building real RIFF/WEBP containers -------------------------
const riffChunk = (fourCC, payload) => {
	const head = Buffer.alloc(8);
	head.write(fourCC, 0, 'ascii');
	head.writeUInt32LE(payload.length, 4);
	return Buffer.concat([head, payload, payload.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
};
const webp = (...chunks) => {
	const body = Buffer.concat([Buffer.from('WEBP'), ...chunks]);
	const head = Buffer.alloc(8);
	head.write('RIFF', 0, 'ascii');
	head.writeUInt32LE(body.length, 4);
	return Buffer.concat([head, body]);
};

test('§2.148 a real animated WebP is still detected', () => {
	const buf = webp(riffChunk('VP8X', Buffer.alloc(10)), riffChunk('ANIM', Buffer.alloc(6)));
	assert.ok(isWebPBuffer(buf));
	assert.equal(isAnimatedWebP(buf), true);
});

test('§2.148 "ANIM" inside pixel data is no longer a false positive', () => {
	// a still image whose compressed payload happens to contain those four bytes
	const payload = Buffer.concat([Buffer.alloc(8), Buffer.from('ANIM', 'ascii'), Buffer.alloc(8)]);
	const buf = webp(riffChunk('VP8 ', payload));
	assert.equal(isAnimatedWebP(buf), false, 'the chunk walker must not see into chunk payloads');
});

test('§2.148 a truncated / garbage container terminates instead of looping', () => {
	const garbage = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4, 0xff), Buffer.from('WEBP'), Buffer.alloc(30, 0xff)]);
	assert.equal(isAnimatedWebP(garbage), false);
	assert.equal(isAnimatedWebP(Buffer.alloc(4)), false, 'too short to be a WebP at all');
});

test('§2.149 the key cache is not populated when the store rejects the write', async () => {
	const persisted = {};
	let failNext = true;
	const backing = {
		async get(type, ids) {
			const out = {};
			for (const id of ids) if (persisted[`${type}.${id}`]) out[id] = persisted[`${type}.${id}`];
			return out;
		},
		async set(data) {
			if (failNext) throw new Error('disk full');
			for (const t in data) for (const i in data[t]) persisted[`${t}.${i}`] = data[t][i];
		}
	};
	const store = makeCacheableSignalKeyStore(backing, quiet);

	await assert.rejects(() => store.set({ 'pre-key': { 42: { private: 'secret' } } }), /disk full/);
	assert.deepEqual(await store.get('pre-key', ['42']), {}, 'nothing was persisted, so nothing may be served');

	// and the happy path still caches
	failNext = false;
	await store.set({ 'pre-key': { 42: { private: 'secret' } } });
	assert.deepEqual(await store.get('pre-key', ['42']), { 42: { private: 'secret' } });
});

test('§2.150 the store does not strip status out of the caller\'s update object', () => {
	const store = makeInMemoryStore({ logger: quiet });
	const ev = new EventEmitter();
	store.bind(ev);
	const jid = '62811@s.whatsapp.net';
	ev.emit('messages.upsert', {
		type: 'notify',
		messages: [{ key: { remoteJid: jid, id: 'M1', fromMe: true }, message: { conversation: 'hi' }, status: 3, messageTimestamp: 1 }]
	});

	let seenByApp;
	ev.on('messages.update', u => { seenByApp = u[0].update.status; });

	// status 2 is older than the stored 3 — the store must ignore it, not delete it
	const payload = [{ key: { remoteJid: jid, id: 'M1' }, update: { status: 2 } }];
	ev.emit('messages.update', payload);

	assert.equal(payload[0].update.status, 2, "the caller's object is untouched");
	assert.equal(seenByApp, 2, 'a listener registered after the store still sees the field');
	assert.equal(store.messages[jid].get('M1').status, 3, 'but the store kept the newer status');
});

test('§2.150 a newer status is still applied to the store', () => {
	const store = makeInMemoryStore({ logger: quiet });
	const ev = new EventEmitter();
	store.bind(ev);
	const jid = '62822@s.whatsapp.net';
	ev.emit('messages.upsert', {
		type: 'notify',
		messages: [{ key: { remoteJid: jid, id: 'M2', fromMe: true }, message: { conversation: 'hi' }, status: 2, messageTimestamp: 1 }]
	});
	ev.emit('messages.update', [{ key: { remoteJid: jid, id: 'M2' }, update: { status: 4 } }]);
	assert.equal(store.messages[jid].get('M2').status, 4);
});

// --- §2.147 sticker-pack cache key ----------------------------------------
const { stickerPackCacheKey } = await import('../lib/Utils/stickerpack.js');

const url = u => ({ data: { url: u } });
const basePack = {
	cover: { url: 'https://cdn/cover.webp' },
	stickers: [url('https://cdn/1.webp'), url('https://cdn/2.webp')],
	name: 'Pack', publisher: 'me', description: 'd', packId: null
};

test('§2.147 a pack mixing URLs and Buffers is not cacheable at all', () => {
	const mixed = { ...basePack, stickers: [url('https://cdn/1.webp'), { data: Buffer.from('AAAA') }] };
	assert.equal(stickerPackCacheKey(mixed), false, 'a Buffer has no stable identity — do not cache');
	// the exact collision that used to happen
	const other = { ...basePack, stickers: [url('https://cdn/1.webp'), { data: Buffer.from('ZZZZ') }] };
	assert.equal(stickerPackCacheKey(other), false);
});

test('§2.147 an all-URL pack is cacheable and stable', () => {
	const k = stickerPackCacheKey(basePack);
	assert.ok(typeof k === 'string' && k.startsWith('sticker:'));
	assert.equal(k, stickerPackCacheKey({ ...basePack }), 'same input => same key');
});

test('§2.147 renaming or re-covering a pack changes the key', () => {
	const base = stickerPackCacheKey(basePack);
	assert.notEqual(stickerPackCacheKey({ ...basePack, name: 'Other' }), base, 'name is part of the identity');
	assert.notEqual(stickerPackCacheKey({ ...basePack, publisher: 'you' }), base);
	assert.notEqual(stickerPackCacheKey({ ...basePack, description: 'x' }), base);
	assert.notEqual(stickerPackCacheKey({ ...basePack, packId: 'fixed-id' }), base);
	assert.notEqual(stickerPackCacheKey({ ...basePack, cover: { url: 'https://cdn/other.webp' } }), base,
		'the cover used to be ignored entirely');
});

test('§2.147 reordering or changing emojis changes the key', () => {
	const base = stickerPackCacheKey(basePack);
	const swapped = { ...basePack, stickers: [...basePack.stickers].reverse() };
	assert.notEqual(stickerPackCacheKey(swapped), base);
	const emoji = { ...basePack, stickers: [{ ...basePack.stickers[0], emojis: ['🔥'] }, basePack.stickers[1]] };
	assert.notEqual(stickerPackCacheKey(emoji), base);
});

test('§2.147 a cover without a URL makes the pack uncacheable', () => {
	assert.equal(stickerPackCacheKey({ ...basePack, cover: Buffer.from('AAAA') }), false);
	assert.equal(stickerPackCacheKey({ ...basePack, stickers: [] }), false);
});
