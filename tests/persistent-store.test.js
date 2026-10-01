import { test } from 'node:test';
import assert from 'node:assert/strict';
import pino from 'pino';
import { makePersistentStore } from '../lib/Utils/PersistentStore.js';

class MemoryAdapter {
	constructor() { this.domains = new Map(); }
	async init() {}
	_bucket(domain) {
		let bucket = this.domains.get(domain);
		if (!bucket) {
			bucket = new Map();
			this.domains.set(domain, bucket);
		}
		return bucket;
	}
	async get(domain, id) { return this.domains.get(domain)?.get(id); }
	async set(domain, id, value) { this._bucket(domain).set(id, value); }
	async delete(domain, id) { this.domains.get(domain)?.delete(id); }
	async list(domain) { return [...(this.domains.get(domain) || new Map()).entries()]; }
	async listDomains(prefix) {
		const all = [...this.domains.keys()];
		return prefix ? all.filter((d) => d.startsWith(prefix)) : all;
	}
	async clear(domain) { this.domains.delete(domain); }
	async close() {}
}

const jid = '628111@s.whatsapp.net';
const msg = (id, ts) => ({ key: { remoteJid: jid, id, fromMe: false }, messageTimestamp: ts, message: { conversation: id } });

test('persistent store hydrates newest by timestamp and can load non-hydrated history', async () => {
	const adapter = new MemoryAdapter();
	// Deliberately insert out of order; adapter.list() order must not decide recency.
	await adapter.set(`messages:${jid}`, 'm3', msg('m3', 3));
	await adapter.set(`messages:${jid}`, 'm1', msg('m1', 1));
	await adapter.set(`messages:${jid}`, 'm2', msg('m2', 2));

	const store = await makePersistentStore({ adapter, maxMessagesPerChat: 1, logger: pino({ level: 'silent' }) });
	assert.deepEqual(store.messages[jid].array.map((m) => m.key.id), ['m3'], 'only newest message is hydrated');

	assert.equal((await store.loadMessage(jid, 'm1')).message.conversation, 'm1', 'non-hydrated message loads from backend');
	assert.deepEqual((await store.loadMessages(jid, 2)).map((m) => m.key.id), ['m2', 'm3'], 'loadMessages returns newest N in timestamp order');
	assert.deepEqual((await store.loadOlderMessages(jid, 5, { id: 'm3' })).map((m) => m.key.id), ['m1', 'm2'], 'older messages remain reachable');
});
