// §2.92 — the group-invite icon cache is actually wired into sendMessage().
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
	generateWAMessage, createGroupInviteThumbnailCache,
	DEFAULT_GROUP_INVITE_THUMBNAIL_TTL_MS, DEFAULT_GROUP_INVITE_THUMBNAIL_MAX
} from '../lib/index.js'

const JID = '628@s.whatsapp.net'
const GROUP = '120363000@g.us'
const invite = {
	groupInvite: { jid: GROUP, inviteCode: 'abc', inviteExpiration: 1_999_999_999, subject: 'JAP', text: 'join' }
}

const build = async (cache, getProfilePicUrl) => generateWAMessage(JID, invite, {
	upload: async () => ({}),
	getProfilePicUrl,
	...(cache ? { groupInviteThumbnailCache: cache } : {})
})

test('§2.92 an iconless group is queried once, not once per invite', async () => {
	let queries = 0
	const cache = createGroupInviteThumbnailCache()
	const getPic = async () => { queries++; return undefined }
	for (let i = 0; i < 5; i++) {
		await build(cache, getPic)
	}
	assert.equal(queries, 1, 'the "no icon" answer must be remembered too')

	let uncached = 0
	for (let i = 0; i < 5; i++) {
		await build(undefined, async () => { uncached++; return undefined })
	}
	assert.equal(uncached, 5, 'without a cache every invite still queries (the old behaviour)')
})

test('§2.92 sendMessage() hands its own cache to the builder', () => {
	const src = readFileSync(new URL('../lib/Socket/messages-send.js', import.meta.url), 'utf8')
	const code = src.split('\n').filter(line => !/^\s*(\*|\/\/|\/\*)/.test(line)).join('\n')
	assert.doesNotMatch(code, /\/\/TODO: CACHE/)
	assert.match(code, /getProfilePicUrl: sock\.profilePictureUrl,\s*\n\s*groupInviteThumbnailCache,/)
	assert.match(code, /config\.groupInviteThumbnailCache === false/)
	assert.match(code, /\|\| createGroupInviteThumbnailCache\(\);/)
	// exposed on the socket and typed
	assert.match(code, /\n\s+groupInviteThumbnailCache,\n\s+sendReceipt,/)
	for (const file of ['../lib/Socket/messages-send.d.ts', '../lib/Socket/index.d.ts', '../lib/Types/Socket.d.ts']) {
		assert.match(readFileSync(new URL(file, import.meta.url), 'utf8'), /groupInviteThumbnailCache/, file)
	}
})

test('§2.92 the cache honours TTL, capacity and manual eviction', () => {
	let now = 1000
	const cache = createGroupInviteThumbnailCache({ ttlMs: 100, max: 2, now: () => now })
	assert.equal(cache.ttlMs, 100)
	assert.equal(cache.max, 2)

	cache.set(GROUP, Buffer.from([1]))
	assert.deepEqual(cache.get(GROUP), { hit: true, value: Buffer.from([1]) })
	cache.set('b@g.us')
	assert.deepEqual(cache.get('b@g.us'), { hit: true, value: undefined }, 'a known-iconless group is a hit')

	cache.set('c@g.us', Buffer.from([3]))
	assert.equal(cache.size, 2, 'capacity must be enforced')

	now += 101
	assert.deepEqual(cache.get('c@g.us'), { hit: false })
	assert.equal(cache.size, 0)

	cache.set(GROUP, Buffer.from([9]))
	assert.equal(cache.delete(GROUP), true)
	assert.deepEqual(cache.get(GROUP), { hit: false })
	cache.set(GROUP, Buffer.from([9]))
	cache.clear()
	assert.equal(cache.size, 0)

	// nonsense options fall back to the documented defaults
	const fallback = createGroupInviteThumbnailCache({ ttlMs: -1, max: 0 })
	assert.equal(fallback.ttlMs, DEFAULT_GROUP_INVITE_THUMBNAIL_TTL_MS)
	assert.equal(fallback.max, DEFAULT_GROUP_INVITE_THUMBNAIL_MAX)
})

test('§2.92 both spellings of the invite title/caption are accepted', async () => {
	const documented = await build(undefined, async () => undefined)
	assert.equal(documented.message.groupInviteMessage.groupName, 'JAP')
	assert.equal(documented.message.groupInviteMessage.caption, 'join')

	// the spellings that match the proto fields used to be silently dropped
	const protoSpelling = await generateWAMessage(JID, {
		groupInvite: { jid: GROUP, inviteCode: 'abc', inviteExpiration: 1_999_999_999, groupName: 'JAP', caption: 'join' }
	}, { upload: async () => ({}), getProfilePicUrl: async () => undefined })
	assert.equal(protoSpelling.message.groupInviteMessage.groupName, 'JAP')
	assert.equal(protoSpelling.message.groupInviteMessage.caption, 'join')
})

test('§2.92 a failing icon lookup still never breaks the invite', async () => {
	const cache = createGroupInviteThumbnailCache()
	const boom = async () => { throw new Error('404 item-not-found') }
	const msg = await build(cache, boom)
	assert.ok(msg.message.groupInviteMessage, 'the invite must still be built')
	assert.equal(msg.message.groupInviteMessage.groupName, 'JAP')
})
