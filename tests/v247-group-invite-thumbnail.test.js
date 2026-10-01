/**
 * tests/v247-group-invite-thumbnail.test.js — batch Y (v2.4.7)
 *
 * Covers BUGREPORT §2.62: a group invite for a group with no icon rejected the whole
 * `sendMessage()`, and a stalled CDN hung it forever. Also covers the new TTL cache that
 * answers the upstream `//TODO: cache / use store!?`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Boom } from '@hapi/boom';

import {
	createGroupInviteThumbnailCache,
	fetchGroupInviteThumbnail,
	DEFAULT_GROUP_INVITE_THUMBNAIL_MAX,
	DEFAULT_GROUP_INVITE_THUMBNAIL_TTL_MS
} from '../lib/Utils/group-invite-thumbnail.js';
import { generateWAMessageContent } from '../lib/Utils/messages.js';

const GROUP = '120363000000000000@g.us';
const invite = { groupInvite: { jid: GROUP, inviteCode: 'ABC123', subject: 'Group', text: 'join' } };
const itemNotFound = async () => {
	throw new Boom('Item not found', { statusCode: 404, data: { reason: 'item-not-found' } });
};
const okResponse = (bytes) => ({ ok: true, status: 200, arrayBuffer: async () => Uint8Array.from(bytes).buffer });

describe('§2.62 group invites survive a missing group icon', () => {
	it('an iconless group no longer rejects the invite', async () => {
		const content = await generateWAMessageContent(invite, { getProfilePicUrl: itemNotFound });
		assert.equal(content.groupInviteMessage.inviteCode, 'ABC123');
		assert.equal(content.groupInviteMessage.jpegThumbnail, undefined);
	});

	it('a synchronously throwing getProfilePicUrl is tolerated too', async () => {
		const content = await generateWAMessageContent(invite, {
			getProfilePicUrl: () => {
				throw new Error('socket closed');
			}
		});
		assert.equal(content.groupInviteMessage.groupJid, GROUP);
	});

	it('still attaches the thumbnail on the happy path', async () => {
		const realFetch = globalThis.fetch;
		globalThis.fetch = async () => okResponse([7, 7, 7]);
		try {
			const content = await generateWAMessageContent(invite, {
				getProfilePicUrl: async () => 'https://cdn.example/pfp.jpg'
			});
			assert.deepEqual([...content.groupInviteMessage.jpegThumbnail], [7, 7, 7]);
		} finally {
			globalThis.fetch = realFetch;
		}
	});

	it('keeps every other invite field intact without an icon', async () => {
		const content = await generateWAMessageContent(invite, { getProfilePicUrl: itemNotFound });
		const m = content.groupInviteMessage;
		assert.equal(m.groupName, 'Group');
		assert.equal(m.caption, 'join');
		assert.equal(m.inviteExpiration, 0);
	});
});

describe('fetchGroupInviteThumbnail() (v2.4.7 upgrade)', () => {
	it('returns the downloaded bytes', async () => {
		const buf = await fetchGroupInviteThumbnail({
			jid: GROUP,
			getProfilePicUrl: async () => 'https://cdn.example/pfp.jpg',
			fetchImpl: async () => okResponse([1, 2, 3])
		});
		assert.ok(Buffer.isBuffer(buf));
		assert.deepEqual([...buf], [1, 2, 3]);
	});

	it('never throws, whatever fails', async () => {
		const cases = [
			{ getProfilePicUrl: itemNotFound },
			{ getProfilePicUrl: async () => 'u', fetchImpl: async () => { throw new Error('ECONNRESET'); } },
			{ getProfilePicUrl: async () => 'u', fetchImpl: async () => ({ ok: false, status: 403 }) },
			{ getProfilePicUrl: async () => undefined }
		];
		for (const c of cases) {
			assert.equal(await fetchGroupInviteThumbnail({ jid: GROUP, ...c }), undefined);
		}
	});

	it('is a no-op without a jid or a resolver', async () => {
		assert.equal(await fetchGroupInviteThumbnail(), undefined);
		assert.equal(await fetchGroupInviteThumbnail({ jid: GROUP }), undefined);
		assert.equal(await fetchGroupInviteThumbnail({ getProfilePicUrl: async () => 'u' }), undefined);
	});

	it('bounds a hanging query instead of waiting forever', async () => {
		const started = Date.now();
		const buf = await fetchGroupInviteThumbnail({
			jid: GROUP,
			getProfilePicUrl: () => new Promise(() => {}),
			timeoutMs: 40
		});
		assert.equal(buf, undefined);
		assert.ok(Date.now() - started < 2000);
	});

	it('bounds a hanging download too', async () => {
		const buf = await fetchGroupInviteThumbnail({
			jid: GROUP,
			getProfilePicUrl: async () => 'https://cdn.example/pfp.jpg',
			fetchImpl: () => new Promise(() => {}),
			timeoutMs: 40
		});
		assert.equal(buf, undefined);
	});

	it('logs at debug rather than surfacing the failure', async () => {
		const seen = [];
		await fetchGroupInviteThumbnail({ jid: GROUP, getProfilePicUrl: itemNotFound, logger: { debug: (o, m) => seen.push(m) } });
		assert.equal(seen.length, 1);
		assert.match(seen[0], /thumbnail/);
	});
});

describe('createGroupInviteThumbnailCache() (upstream "TODO: cache / use store!?")', () => {
	it('serves a hit without touching the server', async () => {
		let calls = 0;
		const cache = createGroupInviteThumbnailCache();
		const getProfilePicUrl = async () => {
			calls++;
			return 'https://cdn.example/pfp.jpg';
		};
		const fetchImpl = async () => okResponse([9]);
		for (let i = 0; i < 3; i++) {
			const buf = await fetchGroupInviteThumbnail({ jid: GROUP, getProfilePicUrl, fetchImpl, cache });
			assert.deepEqual([...buf], [9]);
		}
		assert.equal(calls, 1);
	});

	it('caches the negative answer as well', async () => {
		let calls = 0;
		const cache = createGroupInviteThumbnailCache();
		const getProfilePicUrl = async () => {
			calls++;
			return itemNotFound();
		};
		for (let i = 0; i < 3; i++) {
			assert.equal(await fetchGroupInviteThumbnail({ jid: GROUP, getProfilePicUrl, cache }), undefined);
		}
		assert.equal(calls, 1);
		assert.deepEqual(cache.get(GROUP), { hit: true, value: undefined });
	});

	it('expires entries after the ttl', () => {
		let now = 0;
		const cache = createGroupInviteThumbnailCache({ ttlMs: 100, now: () => now });
		cache.set(GROUP, Buffer.from([1]));
		assert.equal(cache.get(GROUP).hit, true);
		now = 99;
		assert.equal(cache.get(GROUP).hit, true);
		now = 101;
		assert.equal(cache.get(GROUP).hit, false);
		assert.equal(cache.size, 0);
	});

	it('evicts the oldest entry past the cap', () => {
		const cache = createGroupInviteThumbnailCache({ max: 2 });
		cache.set('a@g.us', Buffer.from([1]));
		cache.set('b@g.us', Buffer.from([2]));
		cache.set('c@g.us', Buffer.from([3]));
		assert.equal(cache.size, 2);
		assert.equal(cache.get('a@g.us').hit, false);
		assert.equal(cache.get('c@g.us').hit, true);
	});

	it('refreshes insertion order on re-set, and supports delete/clear', () => {
		const cache = createGroupInviteThumbnailCache({ max: 2 });
		cache.set('a@g.us', Buffer.from([1]));
		cache.set('b@g.us', Buffer.from([2]));
		cache.set('a@g.us', Buffer.from([3]));
		cache.set('c@g.us', Buffer.from([4]));
		assert.equal(cache.get('a@g.us').hit, true, 'a was refreshed, b is the oldest');
		assert.equal(cache.get('b@g.us').hit, false);
		assert.equal(cache.delete('a@g.us'), true);
		cache.clear();
		assert.equal(cache.size, 0);
	});

	it('falls back to the defaults for nonsense options', () => {
		const cache = createGroupInviteThumbnailCache({ ttlMs: -1, max: 0 });
		assert.equal(cache.ttlMs, DEFAULT_GROUP_INVITE_THUMBNAIL_TTL_MS);
		assert.equal(cache.max, DEFAULT_GROUP_INVITE_THUMBNAIL_MAX);
	});

	it('the groupInvite branch has no unguarded profile-picture await left', async () => {
		const fs = await import('node:fs/promises');
		const source = await fs.readFile(new URL('../lib/Utils/messages.js', import.meta.url), 'utf8');
		assert.match(source, /fetchGroupInviteThumbnail\(\{/);
		assert.doesNotMatch(source, /^\s*const pfpUrl = await options\.getProfilePicUrl/m);
		assert.doesNotMatch(source, /^\s*\/\/TODO: cache \/ use store!\?/m);
	});
});
