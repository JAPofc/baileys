/**
 * scripts/y-repro.mjs --- batch Y repro for BUGREPORT 2.62
 *
 * A: a group invite for a group with **no icon**. `profilePictureUrl()` runs through
 *    `query()` -> `assertNodeErrorFree()`, which throws Boom 404 `item-not-found`. The old
 *    code awaited it unguarded, so the whole message generation rejected.
 * B: a CDN that never answers. The old `fetch()` had no timeout -> the send hangs forever.
 * C: the new TTL cache -- repeat invites to the same group stop re-querying, including
 *    the "this group has no icon" answer.
 *
 * Run: node scripts/y-repro.mjs
 */
import { Boom } from '@hapi/boom';
import { generateWAMessageContent } from '../lib/Utils/messages.js';
import { createGroupInviteThumbnailCache, fetchGroupInviteThumbnail } from '../lib/Utils/group-invite-thumbnail.js';

const GROUP = '120363000000000000@g.us';
const invite = { groupInvite: { jid: GROUP, inviteCode: 'ABC123', subject: 'Iconless Group', text: 'join us' } };

/** The pre-fix body of the groupInvite branch, inlined verbatim. */
const beforeFix = async (options) => {
	const m = { groupInviteMessage: { inviteCode: 'ABC123', groupJid: GROUP } };
	if (options.getProfilePicUrl) {
		const pfpUrl = await options.getProfilePicUrl(GROUP, 'preview');
		if (pfpUrl) {
			const resp = await options.fetchImpl(pfpUrl, { method: 'GET' });
			if (resp.ok) {
				m.groupInviteMessage.jpegThumbnail = Buffer.from(await resp.arrayBuffer());
			}
		}
	}

	return m;
};

const iconless = async () => {
	throw new Boom('Item not found', { statusCode: 404, data: { reason: 'item-not-found' } });
};

console.log('=== A. group with no profile picture ===');
try {
	await beforeFix({ getProfilePicUrl: iconless });
	console.log('BEFORE: no throw (unexpected)');
} catch (err) {
	console.log('BEFORE: generation REJECTED ->', err.message, '-- the invite never goes out');
}

const after = await generateWAMessageContent(invite, { getProfilePicUrl: iconless, logger: undefined });
console.log('AFTER : sent ok, inviteCode =', after.groupInviteMessage.inviteCode,
	'| jpegThumbnail =', after.groupInviteMessage.jpegThumbnail);

console.log('\n=== B. profile-picture query that never answers ===');
const hang = () => new Promise(() => {});
const t0 = Date.now();
const hung = await generateWAMessageContent(invite, { getProfilePicUrl: hang });
console.log(`AFTER : resolved in ~${Math.round((Date.now() - t0) / 100) / 10}s with no thumbnail ->`,
	hung.groupInviteMessage.jpegThumbnail);
console.log('BEFORE: awaited forever -- sendMessage() never settles');

console.log('\n=== C. cache (upstream "TODO: cache / use store!?") ===');
let calls = 0;
const counting = async () => {
	calls++;
	throw new Boom('Item not found', { statusCode: 404 });
};

const cache = createGroupInviteThumbnailCache({ ttlMs: 60_000 });
for (let i = 0; i < 3; i++) {
	await fetchGroupInviteThumbnail({ jid: GROUP, getProfilePicUrl: counting, cache });
}

console.log('3 invites to the same iconless group ->', calls, 'server round-trip(s); cache size', cache.size);
