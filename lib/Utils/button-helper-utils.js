/**
 * lib/Utils/button-helper-utils.js
 * Author: J.AP (@japofc/baileys)
 *
 * Detection + node-shaping helpers for WhatsApp interactive / button / list
 * messages. Everything here is authored for this project: message-kind
 * detection, the `biz` binary node builder that WhatsApp requires alongside
 * native-flow payloads, and a few socket-level convenience addons.
 */

import { randomBytes } from 'crypto';
import { generateWAMessage, generateWAMessageFromContent, normalizeMessageContent } from './messages.js';
import { getUrlFromDirectPath } from './messages-media.js';
import { unixTimestampSeconds } from './generics.js';
import { getBinaryNodeChild, isJidGroup, isJidNewsletter, jidNormalizedUser, S_WHATSAPP_NET } from '../WABinary/index.js';
import { QueryIds, XWAPaths } from '../Types/Mex.js';

// ── message-kind detection ───────────────────────────────────────────────────

/**
 * Map a proto message to a coarse media label (or '' when it carries no media).
 * @param {import('../../WAProto/index.js').proto.IMessage} message
 */
export function getMediaType(message) {
	const table = [
		['imageMessage', () => 'image'],
		['videoMessage', () => (message.videoMessage?.gifPlayback ? 'gif' : 'video')],
		['audioMessage', () => (message.audioMessage?.ptt ? 'ptt' : 'audio')],
		['contactMessage', () => 'vcard'],
		['documentMessage', () => 'document'],
		['contactsArrayMessage', () => 'contact_array'],
		['liveLocationMessage', () => 'livelocation'],
		['stickerMessage', () => 'sticker'],
		['listMessage', () => 'list'],
		['listResponseMessage', () => 'list_response'],
		['buttonsResponseMessage', () => 'buttons_response'],
		['orderMessage', () => 'order'],
		['productMessage', () => 'product'],
		['interactiveResponseMessage', () => 'native_flow_response'],
		['groupInviteMessage', () => 'url']
	];
	for (const [field, label] of table) {
		if (message?.[field]) return label();
	}
	return '';
}

/**
 * Classify a message into one of the high-level buckets a bot cares about.
 * @param {import('../../WAProto/index.js').proto.IMessage} message
 */
export function getMessageType(message) {
	const inner = normalizeMessageContent(message);
	if (!inner) return 'text';
	if (inner.reactionMessage || inner.encReactionMessage) return 'reaction';
	if (
		inner.pollCreationMessage ||
		inner.pollCreationMessageV2 ||
		inner.pollCreationMessageV3 ||
		inner.pollUpdateMessage
	) {
		return 'poll';
	}
	if (inner.eventMessage) return 'event';
	if (getMediaType(inner) !== '') return 'media';
	return 'text';
}

// ── button / interactive shaping ─────────────────────────────────────────────

/** Peel any view-once wrapper to reach the payload that actually holds buttons. */
function peelInteractive(message) {
	const wrappers = [
		message?.viewOnceMessageV2Extension?.message,
		message?.viewOnceMessageV2?.message,
		message?.viewOnceMessage?.message
	];
	return {
		base: message?.viewOnceMessageV2Extension?.message || message,
		candidates: [message, ...wrappers].filter(Boolean)
	};
}

/**
 * Report which kind of button surface a message uses, if any.
 * @param {import('../../WAProto/index.js').proto.IMessage} message
 */
export function getButtonType(message) {
	const { base, candidates } = peelInteractive(message);
	if (base?.listMessage) return 'list';
	if (base?.buttonsMessage) return 'buttons';
	for (const c of candidates) {
		const im = c?.interactiveMessage;
		if (im?.nativeFlowMessage || im?.carouselMessage) return 'native_flow';
	}
	return undefined;
}

/**
 * Build the `biz` binary node WhatsApp expects to accompany a button /
 * interactive / list message so it renders on Messenger + Business, Android +
 * iOS. Certain native-flow buttons need bespoke sub-nodes.
 * @param {import('../../WAProto/index.js').proto.IMessage} message
 * @returns {import('../WABinary/index.js').BinaryNode}
 */
export function getButtonArgs(message) {
	const { base, candidates } = peelInteractive(message);
	const pick = (get) => candidates.map((c) => get(c?.interactiveMessage)).find(Boolean);

	const nativeFlow = base?.interactiveMessage?.nativeFlowMessage || pick((im) => im?.nativeFlowMessage);
	const carousel = base?.interactiveMessage?.carouselMessage || pick((im) => im?.carouselMessage);

	const firstButtonName =
		nativeFlow?.buttons?.[0]?.name ||
		carousel?.cards?.[0]?.nativeFlowMessage?.buttons?.[0]?.name;

	const bespokeNames = new Set([
		'mpm',
		'cta_catalog',
		'send_location',
		'call_permission_request',
		'wa_payment_transaction_details',
		'automated_greeting_message_view_catalog'
	]);

	// payment flows report themselves through a native_flow_name attr on biz
	if (nativeFlow && (firstButtonName === 'review_and_pay' || firstButtonName === 'payment_info')) {
		return {
			tag: 'biz',
			attrs: { native_flow_name: firstButtonName === 'review_and_pay' ? 'order_details' : firstButtonName }
		};
	}

	// bespoke flows carry an explicit interactive/native_flow sub-tree
	if (nativeFlow && bespokeNames.has(firstButtonName ?? '')) {
		return {
			tag: 'biz',
			attrs: { actual_actors: '2', host_storage: '2', privacy_mode_ts: unixTimestampSeconds().toString() },
			content: [
				{
					tag: 'interactive',
					attrs: { type: 'native_flow', v: '1' },
					content: [{ tag: 'native_flow', attrs: { v: '2', name: firstButtonName } }]
				},
				{ tag: 'quality_control', attrs: { source_type: 'third_party' } }
			]
		};
	}

	// generic interactive / carousel / classic-buttons → the "mixed" native flow
	if (nativeFlow || carousel || message?.buttonsMessage) {
		return {
			tag: 'biz',
			attrs: {},
			content: [
				{
					tag: 'interactive',
					attrs: { type: 'native_flow', v: '1' },
					content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }]
				}
			]
		};
	}

	if (base?.listMessage) {
		return { tag: 'biz', attrs: {}, content: [{ tag: 'list', attrs: { v: '2', type: 'product_list' } }] };
	}

	return { tag: 'biz', attrs: {} };
}

// ── contextInfo / media helpers ──────────────────────────────────────────────

/** Produce a contextInfo carrying @mentions (or the "@all" sentinel). */
export const buildMentionContextInfo = (message) => {
	if (message?.mentionAll) return { contextInfo: { nonJidMentions: 1 } };
	if (message?.mentions?.length) return { contextInfo: { mentionedJid: message.mentions } };
	return { contextInfo: {} };
};

/** Pull any embedded media out of a buttons/interactive payload (top-level or under `header`). */
export const extractFromButtonsMessage = (msg) => {
	const scope = msg?.header && typeof msg.header === 'object' ? msg.header : msg;
	for (const field of ['imageMessage', 'videoMessage', 'documentMessage']) {
		if (scope?.[field]) return { [field]: scope[field] };
	}
	return null;
};

/** Coerce a media argument: strings become `{ url }`, Buffers/objects pass through. */
export const normalizeMediaInput = (media) => {
	if (!media || Buffer.isBuffer(media)) return media;
	if (typeof media === 'string') return { url: media };
	return media;
};

/** Wrap button/template/list/native-flow payloads so MD clients render them. */
export const patchMessageForMdIfRequired = (message) => {
	const needsPatch =
		message?.buttonsMessage ||
		message?.templateMessage ||
		message?.listMessage ||
		message?.interactiveMessage?.nativeFlowMessage;
	if (!needsPatch) return message;
	return {
		viewOnceMessageV2Extension: {
			message: {
				messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {} },
				...message
			}
		}
	};
};

// ── album relay ──────────────────────────────────────────────────────────────

/**
 * Relay a multi-item album (images/videos). Sends the album header, then each
 * media item linked back to it, and returns the per-item WAMessages.
 * @param {string} jid
 * @param {Array<object>} albums
 * @param {{ userJid: string, suki: { relayMessage: Function, waUploadToServer: Function } }} options
 */
export const prepareAlbumMessageContent = async (jid, albums, options) => {
	const count = (kind) => albums.filter((item) => kind in item).length;

	const header = generateWAMessageFromContent(
		jid,
		{ albumMessage: { expectedImageCount: count('image'), expectedVideoCount: count('video') } },
		{ userJid: options.userJid }
	);
	await options.suki.relayMessage(jid, header.message, { messageId: header.key.id });

	const upload = async (encFilePath, opts) => {
		const res = await options.suki.waUploadToServer(encFilePath, { ...opts, newsletter: isJidNewsletter(jid) });
		return {
			mediaUrl: res.url ?? '',
			directPath: res.directPath ?? '',
			handle: res.handle,
			mediaKey: res.mediaKey,
			fileEncSha256: res.fileEncSha256,
			fileSha256: res.fileSha256,
			fileLength: res.fileLength
		};
	};

	const out = [];
	for (const media of albums) {
		const isMedia = ('image' in media && media.image) || ('video' in media && media.video);
		if (!isMedia) continue;
		const item = await generateWAMessage(jid, media, { userJid: options.userJid, upload });
		item.message.messageContextInfo = {
			messageSecret: randomBytes(32),
			messageAssociation: { associationType: 1, parentMessageKey: header.key }
		};
		out.push(item);
	}
	return out;
};

// ── socket-level extras ──────────────────────────────────────────────────────

/**
 * Build a small addon exposing profile-picture and group-ephemeral lookups over
 * an existing socket's query surface.
 * @param {{ query: Function, newsletterWMexQuery?: Function }} ctx
 */
export const makeMessageExtrasAddon = (ctx) => {
	const { query, newsletterWMexQuery } = ctx;

	const profilePictureUrl = async (jid) => {
		if (isJidNewsletter(jid) && newsletterWMexQuery) {
			const node = await newsletterWMexQuery(undefined, QueryIds.METADATA, {
				input: { key: jid, type: 'JID', view_role: 'GUEST' },
				fetch_viewer_metadata: true,
				fetch_full_image: true,
				fetch_creation_time: true
			});
			const resultStr = getBinaryNodeChild(node, 'result')?.content?.toString();
			if (!resultStr) return null;
			const metadata = JSON.parse(resultStr).data[XWAPaths.xwa2_newsletter_metadata];
			return getUrlFromDirectPath(metadata?.thread_metadata?.picture?.direct_path || '');
		}

		const result = await query({
			tag: 'iq',
			attrs: { target: jidNormalizedUser(jid), to: S_WHATSAPP_NET, type: 'get', xmlns: 'w:profile:picture' },
			content: [{ tag: 'picture', attrs: { type: 'image', query: 'url' }, content: undefined }]
		});
		return getBinaryNodeChild(result, 'picture')?.attrs?.url || null;
	};

	const getEphemeralGroup = async (jid) => {
		if (!isJidGroup(jid)) throw new TypeError('Jid should originate from a group!');
		const result = await query({
			tag: 'iq',
			attrs: { id: `ephemeral-${Date.now()}`, to: jid, type: 'get', xmlns: 'w:g2' },
			content: [{ tag: 'query', attrs: { request: 'interactive' }, content: undefined }]
		});
		return getBinaryNodeChild(getBinaryNodeChild(result, 'group'), 'ephemeral')?.attrs?.expiration || 0;
	};

	return { profilePictureUrl, getEphemeralGroup };
};
