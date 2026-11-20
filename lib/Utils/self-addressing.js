/**
 * self-addressing.js --- JAP@Fix (§2.64 / v2.4.7)
 *
 * A chat is addressed either by phone number (`@s.whatsapp.net`) or by LID (`@lid`), and
 * **we** have one identity in each. `generateWAMessageFromContent()` hard-coded the phone
 * number for both places where it has to name itself:
 *
 * ```js
 * const participant = quoted.key.fromMe ? userJid : ...   // TODO: Add support for LIDs
 * participant: isJidGroup(jid) || isJidStatusBroadcast(jid) ? userJid : undefined  // TODO: Add support for LIDs
 * ```
 *
 * In a LID-addressed group the message itself goes out under our **LID**
 * (`messages-send.js` picks `meLid` as the sender identity), so quoting one of our own
 * messages produced a `contextInfo.participant` naming an identity the group does not use.
 *
 * These helpers pick the identity that matches the addressing of whatever we are answering.
 */
import { isLidUser, isPnUser, jidNormalizedUser } from '../WABinary/index.js';

/** @returns {'lid'|'pn'|undefined} */
const normaliseMode = (mode) => (mode === 'lid' || mode === 'pn' ? mode : undefined);

/**
 * The addressing mode a message key was delivered under: the explicit `addressingMode`
 * the decoder puts on incoming keys, else inferred from the jids it carries.
 * @returns {'lid'|'pn'|undefined}
 */
export const keyAddressingMode = (key) => {
	if (!key || typeof key !== 'object') {
		return undefined;
	}

	const explicit = normaliseMode(key.addressingMode);
	if (explicit) {
		return explicit;
	}

	for (const jid of [key.participant, key.remoteJid]) {
		if (isLidUser(jid)) {
			return 'lid';
		}

		if (isPnUser(jid)) {
			return 'pn';
		}
	}

	return undefined;
};

/** Our own jid for a given addressing mode; falls back to the phone number. */
export const selfJidForAddressingMode = (mode, { userJid, userLid } = {}) => {
	if (normaliseMode(mode) === 'lid' && userLid) {
		return jidNormalizedUser(userLid);
	}

	return userJid ? jidNormalizedUser(userJid) : userJid;
};

/**
 * Which addressing mode to use when naming ourselves in a chat: an explicit hint (e.g. a
 * group's `addressingMode` from its metadata) wins, then the message being quoted, then the
 * chat jid itself.
 * @returns {'lid'|'pn'|undefined}
 */
export const resolveSelfAddressingMode = ({ addressingMode, quoted, jid } = {}) => {
	const explicit = normaliseMode(addressingMode);
	if (explicit) {
		return explicit;
	}

	const fromQuoted = keyAddressingMode(quoted?.key);
	if (fromQuoted) {
		return fromQuoted;
	}

	if (isLidUser(jid)) {
		return 'lid';
	}

	if (isPnUser(jid)) {
		return 'pn';
	}

	return undefined;
};

/**
 * The jid to put in `contextInfo.participant` for a quoted message — the author, as the
 * conversation addresses them. For our own messages that is our LID in a LID-addressed
 * chat and our phone number otherwise; for everyone else it is whatever the key already
 * carries.
 */
export const quotedParticipantJid = (quoted, { userJid, userLid, addressingMode } = {}) => {
	if (!quoted?.key) {
		return undefined;
	}

	if (!quoted.key.fromMe) {
		return quoted.participant || quoted.key.participant || quoted.key.remoteJid;
	}

	return selfJidForAddressingMode(resolveSelfAddressingMode({ addressingMode, quoted }), { userJid, userLid });
};
