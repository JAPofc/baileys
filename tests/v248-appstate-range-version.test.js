// §2.78 — app-state: message-range ordering, consecutive patch versions, sync status helper.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chatModificationToAppPatch, extractSyncdPatches, proto, ALL_WA_PATCH_NAMES } from '../lib/index.js'

const jid = '628111@s.whatsapp.net'
const T = 1_700_000_000
const mk = (id, ts) => ({ key: { id, remoteJid: jid, fromMe: true }, messageTimestamp: ts })
const msgs = [mk('A', T), mk('B', T + 60), mk('C', T + 120)]

const rangeOf = (mod, list) => {
	const patch = chatModificationToAppPatch({ ...mod, lastMessages: list }, jid)
	const action = Object.values(patch.syncAction)[0]
	return action.messageRange
}

test('§2.78 lastMessageTimestamp is the newest message whatever order it arrives in', () => {
	for (const list of [msgs, [...msgs].reverse(), [msgs[1], msgs[2], msgs[0]]]) {
		assert.equal(rangeOf({ clear: true }, list).lastMessageTimestamp, T + 120)
		assert.equal(rangeOf({ delete: true }, list).lastMessageTimestamp, T + 120)
		assert.equal(rangeOf({ archive: true }, list).lastMessageTimestamp, T + 120)
	}
})

test('§2.78 the emitted message list is sorted oldest-first', () => {
	const range = rangeOf({ clear: true }, [...msgs].reverse())
	assert.deepEqual(range.messages.map(m => m.key.id), ['A', 'B', 'C'])
	assert.equal(range.messages.length, 3)
})

test('§2.78 range validation still rejects malformed last-message lists', () => {
	assert.throws(() => rangeOf({ clear: true }, [{ key: { remoteJid: jid } }]), /Incomplete key/)
	assert.throws(() => rangeOf({ clear: true }, [{ key: { id: 'x', remoteJid: jid }, messageTimestamp: 0 }]), /Missing timestamp/)
	assert.throws(() => rangeOf({ clear: true }, [{ key: { id: 'x', remoteJid: '12@g.us', fromMe: false }, messageTimestamp: T }]), /participant/)
})

test('§2.78 a non-array lastMessages is passed through untouched', () => {
	const custom = { lastMessageTimestamp: 5, messages: [] }
	assert.deepEqual(rangeOf({ clear: true }, custom), custom)
})

const encodePatch = (version) => proto.SyncdPatch.encode(proto.SyncdPatch.fromObject({
	snapshotMac: Buffer.alloc(32),
	patchMac: Buffer.alloc(32),
	mutations: [],
	...(version === undefined ? {} : { version: { version } })
})).finish()

const syncNode = (attrs, patchVersions) => ({
	tag: 'iq',
	attrs: {},
	content: [{
		tag: 'sync',
		attrs: {},
		content: [{
			tag: 'collection',
			attrs: { name: 'regular_high', has_more_patches: 'false', ...attrs },
			content: [{
				tag: 'patches',
				attrs: {},
				content: patchVersions.map(v => ({ tag: 'patch', attrs: {}, content: encodePatch(v) }))
			}]
		}]
	}]
})

const versionsOf = async (node, options = {}) => {
	const out = await extractSyncdPatches(node, options)
	return out.regular_high.patches.map(p => (p.version == null ? null : Number(p.version.version)))
}

test('§2.78 version-less patches get consecutive versions, not all the same one', async () => {
	assert.deepEqual(await versionsOf(syncNode({ version: '41' }, [undefined, undefined, undefined])), [42, 43, 44])
	assert.deepEqual(await versionsOf(syncNode({ version: '0' }, [undefined, undefined])), [1, 2])
})

test('§2.78 a patch that carries its own version wins and re-bases the ones after it', async () => {
	assert.deepEqual(await versionsOf(syncNode({ version: '41' }, [undefined, 90, undefined])), [42, 90, 91])
	assert.deepEqual(await versionsOf(syncNode({ version: '41' }, [7, 8])), [7, 8])
})

test('§2.78 a collection with no usable version never writes NaN into a patch', async () => {
	const warned = []
	const logger = { warn: (obj, msg) => warned.push(msg), debug: () => {}, info: () => {}, error: () => {} }
	for (const attrs of [{}, { version: 'abc' }]) {
		const versions = await versionsOf(syncNode(attrs, [undefined, undefined]), { logger })
		assert.deepEqual(versions, [null, null], JSON.stringify(attrs))
		assert.ok(!versions.some(Number.isNaN))
	}
	assert.equal(warned.length, 4)
	assert.match(warned[0], /no version/i)
})

test('§2.78 appStateSyncStatus reports version/synced/mutations per collection', async () => {
	const { makeChatsSocketStatus } = await import('./helpers/appstate-status.mjs')
	const status = await makeChatsSocketStatus()
	assert.deepEqual(status.map(s => s.name), [...ALL_WA_PATCH_NAMES])
	const high = status.find(s => s.name === 'regular_high')
	assert.deepEqual(high, { name: 'regular_high', version: 41, synced: true, mutations: 2 })
	const never = status.find(s => s.name === 'critical_block')
	assert.deepEqual(never, { name: 'critical_block', version: 0, synced: false, mutations: 0 })
})

test('§2.78 appStateSyncStatus is wired into the socket and declared for TypeScript', () => {
	const src = readFileSync(new URL('../lib/Socket/chats.js', import.meta.url), 'utf8')
	assert.match(src, /const appStateSyncStatus = async \(collections = ALL_WA_PATCH_NAMES\) =>/)
	assert.match(src, /\n\s+appStateSyncStatus,\n/)
	for (const file of ['../lib/Socket/chats.d.ts', '../lib/Socket/index.d.ts']) {
		assert.match(readFileSync(new URL(file, import.meta.url), 'utf8'), /appStateSyncStatus:/, file)
	}
})
