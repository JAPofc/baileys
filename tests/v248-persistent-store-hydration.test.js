import test from 'node:test'
import assert from 'node:assert/strict'
import EventEmitter from 'events'
import { makePersistentStore } from '../lib/Utils/PersistentStore.js'

const JID = '628111@s.whatsapp.net'
const key = id => ({ remoteJid: JID, id, fromMe: false })
const msg = (id, ts = 1700000000) => ({ key: key(id), messageTimestamp: ts, message: { conversation: id } })

const makeAdapter = (seed = []) => {
	const db = new Map(seed.map(m => [`messages:${JID}\u0000${m.key.id}`, m]))
	return {
		init: async () => {},
		set: async (d, id, v) => db.set(`${d}\u0000${id}`, v),
		get: async (d, id) => db.get(`${d}\u0000${id}`),
		delete: async (d, id) => db.delete(`${d}\u0000${id}`),
		clear: async d => { for (const k of [...db.keys()]) if (k.startsWith(`${d}\u0000`)) db.delete(k) },
		list: async d => [...db.entries()].filter(([k]) => k.startsWith(`${d}\u0000`)).map(([k, v]) => [k.split('\u0000')[1], v]),
		listDomains: async p => [...new Set([...db.keys()].map(k => k.split('\u0000')[0]).filter(d => d.startsWith(p)))],
		close: async () => {},
		_db: db
	}
}

const bound = async seed => {
	const adapter = makeAdapter(seed)
	const store = await makePersistentStore({ adapter })
	const ev = new EventEmitter()
	store.bind(ev)
	return { adapter, store, ev }
}

test('§2.68 a hydrated bucket is a real ordered dictionary', async () => {
	const { store } = await bound([msg('A')])
	const bucket = store.messages[JID]
	for (const method of ['get', 'upsert', 'update', 'remove', 'updateAssign', 'clear', 'filter', 'toJSON', 'fromJSON']) {
		assert.equal(typeof bucket[method], 'function', `missing ${method}()`)
	}

	assert.ok(Array.isArray(bucket.array))
	assert.equal(bucket.array.length, 1)
	assert.equal(bucket.get('A')?.key.id, 'A', 'the id index is populated, not just the array')
})

test('§2.68 a receipt against a hydrated chat no longer throws', async () => {
	const { store, ev } = await bound([msg('A')])
	assert.doesNotThrow(() => ev.emit('messages.update', [{ key: key('A'), update: { status: 3 } }]))
	assert.equal(store.messages[JID].get('A').status, 3)
})

test('§2.68 deleting one message of a hydrated chat no longer throws', async () => {
	const { store, ev } = await bound([msg('A'), msg('B', 1700000001)])
	assert.doesNotThrow(() => ev.emit('messages.delete', { keys: [key('A')] }))
	assert.equal(store.messages[JID].array.length, 1)
	assert.equal(store.messages[JID].get('A'), undefined)
})

test('§2.68 clearing a hydrated chat no longer throws', async () => {
	const { store, ev } = await bound([msg('A')])
	assert.doesNotThrow(() => ev.emit('messages.delete', { jid: JID, all: true }))
	assert.equal(store.messages[JID].array.length, 0)
})

test('§2.68 the snapshot of a hydrated chat is an array readFromFile can iterate', async () => {
	const { store } = await bound([msg('A')])
	const dumped = JSON.parse(JSON.stringify(store.toJSON()))
	assert.ok(Array.isArray(dumped.messages[JID]), `got ${JSON.stringify(dumped.messages[JID]).slice(0, 40)}`)
	assert.equal(dumped.messages[JID][0].key.id, 'A')
})

test('§2.68 hydration keeps chronological order and respects maxMessagesPerChat', async () => {
	const seed = [msg('C', 300), msg('A', 100), msg('B', 200)]
	const store = await makePersistentStore({ adapter: makeAdapter(seed), maxMessagesPerChat: 2 })
	assert.deepEqual(store.messages[JID].array.map(m => m.key.id), ['B', 'C'], 'newest two, oldest first')
})

test('§2.68 live upsert after hydration still persists write-through', async () => {
	const { adapter, store, ev } = await bound([msg('A')])
	ev.emit('messages.upsert', { messages: [msg('B', 1700000005)], type: 'notify' })
	await store.flush()
	assert.ok(await adapter.get(`messages:${JID}`, 'B'))
})

test('countStoredMessages reports what the backend holds, not memory', async () => {
	const seed = [msg('A', 100), msg('B', 200), msg('C', 300)]
	const store = await makePersistentStore({ adapter: makeAdapter(seed), maxMessagesPerChat: 1 })
	assert.equal(store.messages[JID].array.length, 1, 'memory is capped')
	assert.equal(await store.countStoredMessages(JID), 3, 'the backend still has everything')
	assert.equal(await store.countStoredMessages('nobody@s.whatsapp.net'), 0)
})

test('pruneStoredMessages trims the oldest and reports the count', async () => {
	const seed = [msg('A', 100), msg('B', 200), msg('C', 300)]
	const { adapter, store } = await bound(seed)
	assert.equal(await store.pruneStoredMessages(JID, 5), 0, 'nothing to do when keep >= stored')
	assert.equal(await store.pruneStoredMessages(JID, 2), 1)
	assert.equal(await store.countStoredMessages(JID), 2)
	assert.equal(await adapter.get(`messages:${JID}`, 'A'), undefined, 'the oldest went first')
	assert.ok(await adapter.get(`messages:${JID}`, 'C'))
})

test('pruneStoredMessages(jid, 0) clears the chat and rejects bad input', async () => {
	const { store } = await bound([msg('A'), msg('B', 2)])
	assert.equal(await store.pruneStoredMessages(JID, 0), 2)
	assert.equal(await store.countStoredMessages(JID), 0)
	await assert.rejects(store.pruneStoredMessages(JID, -1), /non-negative/)
	await assert.rejects(store.pruneStoredMessages(JID, Number.NaN), /non-negative/)
})
