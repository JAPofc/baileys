/**
 * AI group helpers — put Meta AI in your groups: add/remove the bot
 * participant, or create a group with it in one call.
 *
 * ⚠️ EXPERIMENTAL & SERVER-GATED: these operations use the standard group
 * wire format (`w:g2`) with a `…@bot` participant jid. Whether they WORK
 * depends entirely on a Meta-side rollout flag on YOUR WhatsApp account —
 * if the phone that owns the session doesn't show Meta AI in its app, the
 * server rejects the add (there is no verification you can apply for).
 * The request/response shapes here are structurally verified; end-to-end
 * behavior is up to Meta's gating.
 *
 * ```js
 * import { addAiBotToGroup, createAiGroup, META_AI_BOT_USER } from '@japofc/baileys'
 *
 * const res = await addAiBotToGroup(sock, groupJid)
 * // [{ jid: '867051314767696@bot', status: '200' }] — or an error status
 *
 * const group = await createAiGroup(sock, 'Belajar AI', [memberJid])
 * // group created via the normal path, then the bot is added (best-effort)
 * ```
 */
import { getBinaryNodeChild, getBinaryNodeChildren } from '../WABinary/index.js';

/** Meta AI's bot user id (the `@bot` domain participant). */
export const META_AI_BOT_USER = '867051314767696';

/** Build the `…@bot` participant jid. */
export const aiBotJid = (botUser = META_AI_BOT_USER) => `${botUser}@bot`;

const groupQuery = (sock, jid, type, content) => {
	if (typeof sock?.query !== 'function') {
		throw new Error('addAiBotToGroup needs a live socket (sock.query missing)');
	}
	return sock.query({
		tag: 'iq',
		attrs: { type, xmlns: 'w:g2', to: jid },
		content
	});
};

const parseParticipantResults = (result, action) => {
	const node = getBinaryNodeChild(result, action);
	return getBinaryNodeChildren(node, 'participant').map(p => ({
		jid: p.attrs.jid,
		status: p.attrs.error || '200'
	}));
};

/**
 * Add the Meta AI bot to a group. Returns per-participant statuses
 * (`status: '200'` = accepted; anything else is the server's error code —
 * typically the account lacks the Meta AI rollout).
 */
export const addAiBotToGroup = async (sock, groupJid, { botUser = META_AI_BOT_USER } = {}) => {
	const result = await groupQuery(sock, groupJid, 'set', [{
		tag: 'add',
		attrs: {},
		content: [{ tag: 'participant', attrs: { jid: aiBotJid(botUser) } }]
	}]);
	return parseParticipantResults(result, 'add');
};

/** Remove the Meta AI bot from a group. Same status semantics as add. */
export const removeAiBotFromGroup = async (sock, groupJid, { botUser = META_AI_BOT_USER } = {}) => {
	const result = await groupQuery(sock, groupJid, 'set', [{
		tag: 'remove',
		attrs: {},
		content: [{ tag: 'participant', attrs: { jid: aiBotJid(botUser) } }]
	}]);
	return parseParticipantResults(result, 'remove');
};

/**
 * Create a group through the NORMAL (battle-tested) groupCreate path, then
 * add the Meta AI bot best-effort. Returns
 * `{ group, bot: { added, statuses?, error? } }` — a rejected bot add
 * never fails the group creation.
 */
export const createAiGroup = async (sock, subject, participants = [], { autoAddBot = true, botUser = META_AI_BOT_USER } = {}) => {
	if (typeof sock?.groupCreate !== 'function') {
		throw new Error('createAiGroup needs a live socket (sock.groupCreate missing)');
	}
	const group = await sock.groupCreate(subject, participants);
	if (!autoAddBot) {
		return { group, bot: { added: false } };
	}
	try {
		const statuses = await addAiBotToGroup(sock, group.id, { botUser });
		const added = statuses.some(s => s.status === '200');
		return { group, bot: { added, statuses } };
	} catch (error) {
		return { group, bot: { added: false, error } };
	}
};
