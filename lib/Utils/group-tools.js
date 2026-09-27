/**
 * Group tools — pure helpers over `groupMetadata` results.
 *
 * ```js
 * import { getGroupAdmins, isGroupAdmin, getGroupOwner, getGroupStats,
 *          diffParticipants, formatGroupInfo } from '@japofc/baileys'
 *
 * const meta = await sock.groupMetadata(jid)
 * getGroupAdmins(meta)            // ['a@s.whatsapp.net', …]
 * isGroupAdmin(meta, sender)      // device-suffix tolerant
 * getGroupStats(meta)             // { total, admins, superadmins, members }
 * diffParticipants(before.participants, after.participants)
 * await sock.sendMessage(jid, { text: formatGroupInfo(meta) })
 * ```
 */

const stripDevice = (jid) => String(jid || '').replace(/:\d+(?=@)/, '');

/** Admin + superadmin jids of a group. */
export const getGroupAdmins = (metadata) =>
	(metadata?.participants || []).filter(p => p.admin).map(p => p.id);

/** Is this jid an admin? Tolerates :device suffixes on either side. */
export const isGroupAdmin = (metadata, jid) => {
	const target = stripDevice(jid);
	return (metadata?.participants || []).some(p => p.admin && stripDevice(p.id) === target);
};

/** The superadmin (creator) jid, falling back to metadata.owner. */
export const getGroupOwner = (metadata) =>
	(metadata?.participants || []).find(p => p.admin === 'superadmin')?.id || metadata?.owner || null;

/** Member breakdown: `{ total, superadmins, admins, members }`. */
export const getGroupStats = (metadata) => {
	const participants = metadata?.participants || [];
	const superadmins = participants.filter(p => p.admin === 'superadmin').length;
	const admins = participants.filter(p => p.admin === 'admin').length;
	return {
		total: participants.length,
		superadmins,
		admins,
		members: participants.length - superadmins - admins
	};
};

/** Compare two participant lists: `{ added, removed, promoted, demoted }`. */
export const diffParticipants = (before = [], after = []) => {
	const mapOf = (list) => new Map(list.map(p => [p.id, p.admin || null]));
	const a = mapOf(before);
	const b = mapOf(after);
	return {
		added: [...b.keys()].filter(id => !a.has(id)),
		removed: [...a.keys()].filter(id => !b.has(id)),
		promoted: [...b].filter(([id, admin]) => a.has(id) && !a.get(id) && admin).map(([id]) => id),
		demoted: [...b].filter(([id, admin]) => a.has(id) && a.get(id) && !admin).map(([id]) => id)
	};
};

/** JAP@Upgrade: pretty one-liner summary of a diffParticipants() result. */
export const formatParticipantChanges = (diff) => {
	const parts = [];
	const name = (jid) => `@${String(jid).split('@')[0]}`;
	if (diff?.added?.length) {
		parts.push(`➕ ${diff.added.map(name).join(', ')}`);
	}
	if (diff?.removed?.length) {
		parts.push(`➖ ${diff.removed.map(name).join(', ')}`);
	}
	if (diff?.promoted?.length) {
		parts.push(`⬆️ ${diff.promoted.map(name).join(', ')}`);
	}
	if (diff?.demoted?.length) {
		parts.push(`⬇️ ${diff.demoted.map(name).join(', ')}`);
	}
	return parts.length ? parts.join('\n') : '(no changes)';
};

/** Ready-to-send group info card. */
export const formatGroupInfo = (metadata) => {
	const stats = getGroupStats(metadata);
	const lines = [
		`👥 *${metadata?.subject || '(no subject)'}*`,
		`Members: ${stats.total} (${stats.admins + stats.superadmins} admin)`,
		`Locked: ${metadata?.restrict ? 'yes' : 'no'} · Announce: ${metadata?.announce ? 'yes' : 'no'}`
	];
	if (metadata?.desc) {
		lines.push('', String(metadata.desc).slice(0, 300));
	}
	return lines.join('\n');
};
