/**
 * lib/Utils/participant-list.js — pure mutations of a group participant list
 *
 * Part of @japofc/baileys. The `group-participants.update` handler in the in-memory store
 * mutated `metadata.participants` inline: `add` pushed unconditionally (so a replayed
 * notification, or a member already present from a `groupMetadata()` fetch, appeared
 * twice) and `promote`/`demote` assigned the result of `action === 'promote' && 'admin'`,
 * writing boolean `false` into a field typed `'admin' | 'superadmin' | null`
 * (BUGREPORT §2.52).
 *
 * A participant is identified by its `id` **or** its `phoneNumber`, because the two sides
 * of a LID↔PN pair describe the same person.
 */

/** Both identities a participant can be addressed by, minus the empty ones. */
const identitiesOf = (participant) => {
	const out = [];
	if (participant?.id) {
		out.push(participant.id);
	}
	if (participant?.phoneNumber) {
		out.push(participant.phoneNumber);
	}
	return out;
};

const matches = (participant, candidate) => {
	const keys = identitiesOf(candidate);
	return keys.length > 0 && identitiesOf(participant).some((key) => keys.includes(key));
};

/**
 * Add participants, merging into the existing entry when the person is already listed
 * under either of their identities. Order is preserved and the input list is not mutated.
 *
 * @param {Array<object>} participants Current list (may be null/undefined).
 * @param {Array<object>} incoming Participants to add.
 * @returns {Array<object>} The new list.
 */
export const upsertParticipants = (participants, incoming) => {
	const out = (participants || []).map((participant) => ({ ...participant }));
	for (const candidate of incoming || []) {
		if (!candidate || identitiesOf(candidate).length === 0) {
			continue;
		}
		const existing = out.find((participant) => matches(participant, candidate));
		if (existing) {
			// keep what we already know (e.g. the PN half of the pair) and let the
			// incoming entry fill in or refresh the rest
			for (const [key, value] of Object.entries(candidate)) {
				if (value !== undefined && value !== null) {
					existing[key] = value;
				}
			}
		}
		else {
			out.push({ id: candidate.id, phoneNumber: candidate.phoneNumber, admin: candidate.admin ?? null });
		}
	}
	return out;
};

/**
 * Remove participants matched by either identity.
 *
 * @param {Array<object>} participants Current list (may be null/undefined).
 * @param {Array<object>} outgoing Participants to remove.
 * @returns {Array<object>} The new list.
 */
export const removeParticipants = (participants, outgoing) => {
	const toRemove = (outgoing || []).filter(Boolean);
	if (!toRemove.length) {
		return [...(participants || [])];
	}
	return (participants || []).filter((participant) => !toRemove.some((candidate) => matches(participant, candidate)));
};

/**
 * Set the admin rank of the matched participants.
 *
 * `null` is used for "not an admin" — never boolean `false`, which is not a member of the
 * declared type and makes `admin === null` checks fail. A `superadmin` is left alone on
 * promote: the group owner cannot be promoted to a lesser rank.
 *
 * @param {Array<object>} participants Current list (may be null/undefined).
 * @param {Array<object>} targets Participants to re-rank.
 * @param {'admin' | 'superadmin' | null} admin The new rank.
 * @returns {Array<object>} The new list.
 */
export const setParticipantsAdmin = (participants, targets, admin) => {
	const list = (targets || []).filter(Boolean);
	return (participants || []).map((participant) => {
		if (!list.some((candidate) => matches(participant, candidate))) {
			return participant;
		}
		if (admin === 'admin' && participant.admin === 'superadmin') {
			return participant;
		}
		return { ...participant, admin: admin ?? null };
	});
};
