/**
 * Repro for BUGREPORT 2.68 -- makePersistentStore()'s hydration replaced the store's
 * ordered-dictionary message bucket with a 3-method literal, so after a restart the
 * first receipt/delete for any chat with persisted history threw a TypeError.
 *
 * BEFORE is the real module with the hand-rolled bucket put back.
 *
 * Run: node scripts/ae-repro.mjs
 */
import EventEmitter from 'events'
import { readFile, writeFile, unlink } from 'fs/promises'

const SRC = new URL('../lib/Utils/PersistentStore.js', import.meta.url)
const TMP = new URL('../lib/Utils/PersistentStore.__before__.mjs', import.meta.url)

const FIXED = `		if (Object.keys(hydratedMessages).length) {
			store.fromJSON({ chats: [], contacts: {}, labels: {}, labelAssociations: [], messages: hydratedMessages });
		}`
const BUGGY = `		for (const jid of Object.keys(hydratedMessages)) {
			const array = [];
			const dict = {};
			const list = (store.messages[jid] = {
				array,
				get: (id) => dict[id],
				upsert: (item, mode) => {
					const id = item.key.id || '';
					if (dict[id]) {
						const idx = array.findIndex((i) => (i.key.id || '') === id);
						if (idx >= 0) array[idx] = item;
					} else if (mode === 'append') {
						array.push(item);
					} else {
						array.unshift(item);
					}
					dict[id] = item;
				}
			});
			for (const value of hydratedMessages[jid]) {
				list.upsert(value, 'append');
			}
		}`

const JID = '628111@s.whatsapp.net'
const KEY = { remoteJid: JID, id: 'A', fromMe: false }
const STORED = { key: KEY, messageTimestamp: 1700000000, message: { conversation: 'hello' } }

const makeAdapter = () => {
	const db = new Map([[`messages:${JID}\u0000A`, STORED]])
	return {
		init: async () => {},
		set: async (d, id, v) => db.set(`${d}\u0000${id}`, v),
		get: async (d, id) => db.get(`${d}\u0000${id}`),
		delete: async (d, id) => db.delete(`${d}\u0000${id}`),
		clear: async d => { for (const k of [...db.keys()]) if (k.startsWith(`${d}\u0000`)) db.delete(k) },
		list: async d => [...db.entries()].filter(([k]) => k.startsWith(`${d}\u0000`)).map(([k, v]) => [k.split('\u0000')[1], v]),
		listDomains: async p => [...new Set([...db.keys()].map(k => k.split('\u0000')[0]).filter(d => d.startsWith(p)))],
		close: async () => {}
	}
}

const DICTIONARY_API = ['array', 'get', 'upsert', 'update', 'remove', 'updateAssign', 'clear', 'filter', 'toJSON', 'fromJSON']

const run = async makePersistentStore => {
	const store = await makePersistentStore({ adapter: makeAdapter() })
	const bucket = store.messages[JID]
	const missing = DICTIONARY_API.filter(m => bucket[m] === undefined)
	const ev = new EventEmitter()
	store.bind(ev)

	const attempt = fn => {
		try {
			fn()
			return 'ok'
		} catch (err) {
			return `${err.constructor.name}: ${err.message}`
		}
	}

	return {
		missing,
		receipt: attempt(() => ev.emit('messages.update', [{ key: KEY, update: { status: 3 } }])),
		deleteOne: attempt(() => ev.emit('messages.delete', { keys: [KEY] })),
		clearChat: attempt(() => ev.emit('messages.delete', { jid: JID, all: true })),
		snapshot: attempt(() => {
			const dumped = JSON.parse(JSON.stringify(store.toJSON())).messages[JID]
			if (!Array.isArray(dumped)) {
				throw new Error(`snapshot shape is ${JSON.stringify(dumped).slice(0, 40)}… — readFromFile() cannot iterate it`)
			}
		})
	}
}

const show = (label, r) => {
	console.log(`\n${label}`)
	console.log(`  dictionary methods missing : ${r.missing.length ? r.missing.join(', ') : 'none'}`)
	console.log(`  messages.update (receipt)  : ${r.receipt}`)
	console.log(`  messages.delete (one key)  : ${r.deleteOne}`)
	console.log(`  messages.delete (all)      : ${r.clearChat}`)
	console.log(`  writeToFile snapshot shape : ${r.snapshot}`)
}

const original = await readFile(SRC, 'utf8')
if (!original.includes(FIXED)) {
	throw new Error('fixed hydration not found -- repro is out of date')
}

await writeFile(TMP, original.replace(FIXED, BUGGY))
let before
try {
	before = await run((await import(TMP.href)).makePersistentStore)
} finally {
	await unlink(TMP)
}

console.log('restart with one message already in the backend, then live events arrive')
show('BEFORE (hand-rolled bucket)', before)
show('AFTER  (store.fromJSON -> real dictionary)', await run((await import(SRC.href)).makePersistentStore))
