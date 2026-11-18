/**
 * Group backup — snapshot a group's settings + member list to JSON, diff it
 * against the live group later, and restore the settings.
 *
 * ```js
 * import { backupGroup, diffGroupBackup, restoreGroupSettings } from '@japofc/baileys'
 *
 * const backup = await backupGroup(sock, '123@g.us')
 * fs.writeFileSync('group-backup.json', JSON.stringify(backup, null, 2))
 *
 * const diff = await diffGroupBackup(sock, backup)
 * diff.joined; diff.left; diff.changed // ['subject', 'announce', …]
 *
 * await restoreGroupSettings(sock, backup) // subject, description, locks
 * ```
 *
 * The backup contains no auth material — it is safe to store or share.
 */

/** Snapshot a group. Returns a plain-JSON object. */
export const backupGroup = async (sock, groupJid) => {
	const meta = await sock.groupMetadata(groupJid);
	return {
		type: 'jap-group-backup',
		version: 1,
		takenAt: Date.now(),
		id: meta.id || groupJid,
		subject: meta.subject || '',
		description: meta.desc || meta.description || '',
		owner: meta.owner || undefined,
		announce: !!meta.announce,
		restrict: !!meta.restrict,
		joinApprovalMode: !!meta.joinApprovalMode,
		memberAddMode: meta.memberAddMode ?? undefined,
		ephemeralDuration: meta.ephemeralDuration || 0,
		size: meta.participants?.length || 0,
		participants: (meta.participants || []).map(p => ({
			id: p.id,
			admin: p.admin || null
		}))
	};
};

/** Compare a backup against the live group: joined/left/promoted/demoted/changed. */
export const diffGroupBackup = async (sock, backup, groupJid = backup?.id) => {
	if (backup?.type !== 'jap-group-backup') {
		throw new Error('not a group backup (missing type marker)');
	}
	const current = await backupGroup(sock, groupJid);
	const before = new Map(backup.participants.map(p => [p.id, p.admin]));
	const after = new Map(current.participants.map(p => [p.id, p.admin]));

	const joined = [...after.keys()].filter(id => !before.has(id));
	const left = [...before.keys()].filter(id => !after.has(id));
	const promoted = [...after].filter(([id, admin]) => before.has(id) && !before.get(id) && admin).map(([id]) => id);
	const demoted = [...after].filter(([id, admin]) => before.has(id) && before.get(id) && !admin).map(([id]) => id);

	const changed = [];
	for (const field of ['subject', 'description', 'announce', 'restrict', 'joinApprovalMode', 'ephemeralDuration']) {
		if (backup[field] !== current[field]) {
			changed.push(field);
		}
	}
	return { joined, left, promoted, demoted, changed, before: backup, after: current };
};

/**
 * Re-apply a backup's settings to the group: subject, description and the
 * announce/restrict locks. Membership is NOT touched. Returns what was
 * applied and any per-step errors (it never throws mid-restore).
 */
export const restoreGroupSettings = async (sock, backup, groupJid = backup?.id) => {
	if (backup?.type !== 'jap-group-backup') {
		throw new Error('not a group backup (missing type marker)');
	}
	const applied = [];
	const errors = [];
	const step = async (name, fn) => {
		try {
			await fn();
			applied.push(name);
		} catch (error) {
			errors.push({ step: name, error });
		}
	};
	await step('subject', () => sock.groupUpdateSubject(groupJid, backup.subject));
	if (backup.description) {
		await step('description', () => sock.groupUpdateDescription(groupJid, backup.description));
	}
	await step('announce', () => sock.groupSettingUpdate(groupJid, backup.announce ? 'announcement' : 'not_announcement'));
	await step('restrict', () => sock.groupSettingUpdate(groupJid, backup.restrict ? 'locked' : 'unlocked'));
	if (backup.ephemeralDuration) {
		await step('ephemeral', () => sock.groupToggleEphemeral(groupJid, backup.ephemeralDuration));
	}
	return { applied, errors };
};
