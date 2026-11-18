/**
 * lib/Utils/stub-participant.js — reading the participants out of a message stub
 *
 * Part of @japofc/baileys. `messageStubParameters` is a ragged field: WhatsApp sends a
 * plain jid for some stub types and a JSON object (`{"lid":"…","pn":"…"}`) for others, and
 * history-synced stubs from older clients mix both. `process-message.js` grew private
 * helpers for this, and its membership test only ever compared the `phoneNumber` field —
 * so a LID-addressed group never recognised us (BUGREPORT §2.60).
 */
import { areJidsSameUser } from '../WABinary/index.js';

/**
 * Normalise one `messageStubParameters` entry into an object.
 *
 * Accepts a JSON string, a plain jid string, a bare number, or an object that is already
 * in the right shape. Never throws: an unparsable string is treated as a plain jid.
 *
 * @param {string | object | null | undefined} value
 * @returns {object | null | undefined} `{ phoneNumber }` for plain jids, the decoded
 *   object otherwise.
 */
export const parseStubParticipant = (value) => {
	if (typeof value !== 'string') {
		return value;
	}
	try {
		const parsed = JSON.parse(value);
		return parsed && typeof parsed === 'object' ? parsed : { phoneNumber: String(parsed) };
	}
	catch {
		return { phoneNumber: value };
	}
};

/**
 * Every jid a parsed stub participant can be addressed by. WhatsApp uses `lid`/`pn` in the
 * JSON form, `phoneNumber` in the plain form, and `id`/`jid` in some history payloads.
 *
 * @param {object | string | null | undefined} participant
 * @returns {string[]}
 */
export const stubParticipantIdentities = (participant) => {
	const parsed = parseStubParticipant(participant);
	if (!parsed) {
		return [];
	}
	return [parsed.lid, parsed.pn, parsed.phoneNumber, parsed.id, parsed.jid].filter(
		(value) => typeof value === 'string' && value.length > 0
	);
};

/**
 * Whether any of the stub participants is one of the given jids — checking **every**
 * identity the participant carries, not just the phone number, so a LID-addressed group
 * recognises us through our LID.
 *
 * @param {Array<object | string>} participants
 * @param {...(string | null | undefined)} jids The identities to look for (e.g. our PN and our LID).
 * @returns {boolean}
 */
export const stubParticipantsInclude = (participants, ...jids) => {
	const wanted = jids.filter((jid) => typeof jid === 'string' && jid.length > 0);
	if (!wanted.length) {
		return false;
	}
	return (participants || []).some((participant) =>
		stubParticipantIdentities(participant).some((identity) =>
			wanted.some((jid) => areJidsSameUser(identity, jid))
		)
	);
};
