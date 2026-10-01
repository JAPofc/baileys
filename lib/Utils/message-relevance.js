/**
 * lib/Utils/message-relevance.js — "does this message belong in the chat list?"
 *
 * Part of @japofc/baileys. `isRealMessage()` answers that question with a single boolean
 * and keeps its stub-type tables private, so an application that wants to make the same
 * decision (custom chat list, notification filter, unread badge) has to re-derive them.
 * These helpers expose the classification itself, and are pure.
 */
import { WAMessageStubType } from '../Types/index.js';
import { areJidsSameUser } from '../WABinary/index.js';
import { getContentType, normalizeMessageContent } from './messages.js';
import { isRealMessage, shouldIncrementChatUnread } from './process-message.js';

/** Stub types that represent a missed call — real chat-list entries despite having no content. */
export const MISSED_CALL_STUB_TYPES = Object.freeze([
	WAMessageStubType.CALL_MISSED_VOICE,
	WAMessageStubType.CALL_MISSED_VIDEO,
	WAMessageStubType.CALL_MISSED_GROUP_VOICE,
	WAMessageStubType.CALL_MISSED_GROUP_VIDEO
]);

const MISSED_CALL_SET = new Set(MISSED_CALL_STUB_TYPES);

/**
 * Whether the message is a missed-call notification.
 *
 * @param {object} message
 * @returns {boolean}
 */
export const isMissedCallMessage = (message) => MISSED_CALL_SET.has(message?.messageStubType);

/**
 * Whether the message is a group event naming us (the "… added you to the group" case).
 *
 * @param {object} message
 * @param {string} [meId] Our own jid; without it the answer is `false`.
 * @returns {boolean}
 */
export const isStubAboutMe = (message, meId) => {
	if (!meId || !message?.messageStubParameters?.length) {
		return false;
	}
	return message.messageStubParameters.some((participant) => participant && areJidsSameUser(meId, participant));
};

/**
 * Classify a message the way the chat-list logic does, in one call.
 *
 * @param {object} message
 * @param {string} [meId] Our own jid, used for the "is this stub about me?" tests.
 * @returns {{
 *   isReal: boolean,
 *   isStub: boolean,
 *   isMissedCall: boolean,
 *   isAboutMe: boolean,
 *   incrementsUnread: boolean,
 *   contentType: string | undefined
 * }}
 */
export const classifyMessage = (message, meId) => {
	if (!message) {
		return {
			isReal: false,
			isStub: false,
			isMissedCall: false,
			isAboutMe: false,
			incrementsUnread: false,
			contentType: undefined
		};
	}
	const content = normalizeMessageContent(message.message);
	return {
		isReal: isRealMessage(message, meId),
		isStub: !!message.messageStubType,
		isMissedCall: isMissedCallMessage(message),
		isAboutMe: isStubAboutMe(message, meId),
		incrementsUnread: shouldIncrementChatUnread(message),
		contentType: getContentType(content)
	};
};
