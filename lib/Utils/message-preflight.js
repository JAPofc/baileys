import { isJidGroup, isJidNewsletter, isJidStatusBroadcast } from '../WABinary/jid-utils.js'

/**
 * JAP@Add (§2.220): preflight — check a message BEFORE sending it.
 *
 * Every limit WhatsApp enforces is already encoded somewhere in this library, but only as
 * a throw at the moment of sending: poll option counts live in `sendPoll`, the 60-sticker
 * cap lives in the sticker-pack builder, the ten-button cap lives in the button builder.
 * That is fine for a script and bad for a bot, because the first time you learn a payload
 * is invalid is when a user is already waiting for it, and the failure arrives as an
 * exception in the middle of a send loop.
 *
 * `preflightMessage()` answers the same questions without touching the network. It is
 * deliberately NOT a sender, NOT a mutation and NOT a schema validator: it is a lint pass
 * that returns findings, so a caller can decide to fix, downgrade, or send anyway.
 *
 * Honest scope, because this is easy to oversell:
 *   - These are client-side limits this library already knows about, plus the
 *     recipient-type rules (quiz polls only in channels, and so on). WhatsApp can and does
 *     reject messages for reasons no local check can predict -- spam heuristics, account
 *     state, server-side feature flags.
 *   - A clean preflight therefore means "nothing locally detectable is wrong", never
 *     "this will be delivered". The result says so in `checked`.
 *   - It never throws on bad input. A preflight that crashes is worse than useless, since
 *     it would turn a validation step into the very failure it was meant to prevent.
 */

/** Limits this library already enforces elsewhere, gathered in one place. */
export const PREFLIGHT_LIMITS = {
	pollOptionsMin: 2,
	pollOptionsMax: 12,
	pollNameMax: 255,
	pollOptionMax: 100,
	buttonsMax: 10,
	listSectionsMax: 10,
	listRowsPerSectionMax: 10,
	stickerPackMax: 60,
	stickerBytesMax: 1024 * 1024,
	captionMax: 1024,
	textMax: 65536,
	albumMin: 2,
	albumMax: 30,
	mentionsMax: 1024
}

const ERROR = 'error'
const WARNING = 'warning'

const finding = (severity, code, message, hint) => ({ severity, code, message, ...(hint ? { hint } : {}) })

/** `null`/`undefined`/non-object content is a caller bug, not a crash. */
const isPlainObject = value => typeof value === 'object' && value !== null && !Array.isArray(value)

const textLength = value => (typeof value === 'string' ? [...value].length : 0)

const describeRecipient = jid => {
	if (typeof jid !== 'string' || !jid) return 'unknown'
	if (isJidNewsletter(jid)) return 'newsletter'
	if (isJidStatusBroadcast(jid)) return 'status'
	if (isJidGroup(jid)) return 'group'
	return 'dm'
}

const checkText = (content, out) => {
	const body = typeof content.text === 'string' ? content.text : typeof content.caption === 'string' ? content.caption : null
	if (body === null) return
	const isCaption = typeof content.text !== 'string'
	const len = textLength(body)
	const max = isCaption ? PREFLIGHT_LIMITS.captionMax : PREFLIGHT_LIMITS.textMax
	if (len > max) {
		out.push(
			finding(
				ERROR,
				isCaption ? 'caption-too-long' : 'text-too-long',
				`${isCaption ? 'caption' : 'text'} is ${len} characters, the limit is ${max}`,
				isCaption ? 'send the long part as a follow-up text message' : 'split the message'
			)
		)
	}
	if (len === 0 && typeof content.text === 'string') {
		out.push(finding(ERROR, 'text-empty', 'text is an empty string', 'WhatsApp drops empty bodies; omit the field instead'))
	}
}

const checkPoll = (content, recipient, out) => {
	const poll = content.poll
	if (!isPlainObject(poll)) return
	const values = Array.isArray(poll.values) ? poll.values : []
	if (values.length < PREFLIGHT_LIMITS.pollOptionsMin || values.length > PREFLIGHT_LIMITS.pollOptionsMax) {
		out.push(
			finding(
				ERROR,
				'poll-option-count',
				`a poll needs ${PREFLIGHT_LIMITS.pollOptionsMin}-${PREFLIGHT_LIMITS.pollOptionsMax} options, got ${values.length}`
			)
		)
	}
	if (new Set(values.map(v => (typeof v === 'string' ? v : JSON.stringify(v)))).size !== values.length) {
		out.push(finding(WARNING, 'poll-duplicate-options', 'two poll options are identical', 'voters cannot tell them apart'))
	}
	for (const [i, value] of values.entries()) {
		if (typeof value !== 'string') {
			out.push(finding(ERROR, 'poll-option-type', `option ${i} is ${typeof value}, expected a string`))
		} else if (textLength(value) > PREFLIGHT_LIMITS.pollOptionMax) {
			out.push(finding(ERROR, 'poll-option-too-long', `option ${i} is ${textLength(value)} characters, the limit is ${PREFLIGHT_LIMITS.pollOptionMax}`))
		} else if (value.trim() === '') {
			out.push(finding(ERROR, 'poll-option-empty', `option ${i} is blank`))
		}
	}
	if (textLength(poll.name) > PREFLIGHT_LIMITS.pollNameMax) {
		out.push(finding(ERROR, 'poll-name-too-long', `the poll question is ${textLength(poll.name)} characters, the limit is ${PREFLIGHT_LIMITS.pollNameMax}`))
	}
	const selectable = poll.selectableCount
	if (selectable !== undefined && (!Number.isInteger(selectable) || selectable < 0 || selectable > values.length)) {
		out.push(finding(ERROR, 'poll-selectable-count', `selectableCount ${selectable} is outside 0..${values.length}`))
	}
	// quiz polls are a newsletter-only content type
	if ((poll.pollType === 1 || poll.toAnnouncementGroup === false) && poll.pollType === 1 && recipient !== 'newsletter') {
		out.push(
			finding(
				ERROR,
				'quiz-outside-newsletter',
				`a quiz poll (pollType 1) is only accepted in a newsletter, this is a ${recipient}`,
				'send a normal poll, or target a @newsletter jid'
			)
		)
	}
}

const checkButtons = (content, out) => {
	const buttons = Array.isArray(content.buttons) ? content.buttons : null
	if (!buttons) return
	if (buttons.length === 0) {
		out.push(finding(ERROR, 'buttons-empty', 'buttons is an empty array', 'omit the field to send a plain message'))
	}
	if (buttons.length > PREFLIGHT_LIMITS.buttonsMax) {
		out.push(finding(ERROR, 'buttons-too-many', `${buttons.length} buttons, the limit is ${PREFLIGHT_LIMITS.buttonsMax}`))
	}
	const ids = buttons.map(b => b?.buttonId ?? b?.id).filter(Boolean)
	if (new Set(ids).size !== ids.length) {
		out.push(finding(WARNING, 'buttons-duplicate-id', 'two buttons share an id', 'replies cannot be told apart'))
	}
}

const checkList = (content, out) => {
	const sections = Array.isArray(content.sections) ? content.sections : null
	if (!sections) return
	if (sections.length > PREFLIGHT_LIMITS.listSectionsMax) {
		out.push(finding(ERROR, 'list-sections-too-many', `${sections.length} sections, the limit is ${PREFLIGHT_LIMITS.listSectionsMax}`))
	}
	for (const [i, section] of sections.entries()) {
		const rows = Array.isArray(section?.rows) ? section.rows : []
		if (rows.length === 0) {
			out.push(finding(WARNING, 'list-section-empty', `section ${i} has no rows`))
		}
		if (rows.length > PREFLIGHT_LIMITS.listRowsPerSectionMax) {
			out.push(finding(ERROR, 'list-rows-too-many', `section ${i} has ${rows.length} rows, the limit is ${PREFLIGHT_LIMITS.listRowsPerSectionMax}`))
		}
	}
}

const checkAlbum = (content, out) => {
	const album = Array.isArray(content.album) ? content.album : null
	if (!album) return
	if (album.length < PREFLIGHT_LIMITS.albumMin) {
		out.push(finding(ERROR, 'album-too-small', `an album needs at least ${PREFLIGHT_LIMITS.albumMin} items, got ${album.length}`, 'send it as a single image or video'))
	}
	if (album.length > PREFLIGHT_LIMITS.albumMax) {
		out.push(finding(ERROR, 'album-too-large', `${album.length} items, the limit is ${PREFLIGHT_LIMITS.albumMax}`))
	}
	if (album.some(item => isPlainObject(item) && !item.image && !item.video)) {
		out.push(finding(ERROR, 'album-bad-item', 'an album item is neither an image nor a video'))
	}
}

const checkStickerPack = (content, out) => {
	const pack = content.stickerPack
	if (!isPlainObject(pack)) return
	const stickers = Array.isArray(pack.stickers) ? pack.stickers : []
	if (stickers.length > PREFLIGHT_LIMITS.stickerPackMax) {
		out.push(finding(ERROR, 'sticker-pack-too-large', `${stickers.length} stickers, the limit is ${PREFLIGHT_LIMITS.stickerPackMax}`))
	}
	if (stickers.length === 0) {
		out.push(finding(ERROR, 'sticker-pack-empty', 'the sticker pack has no stickers'))
	}
	for (const [i, sticker] of stickers.entries()) {
		const buffer = Buffer.isBuffer(sticker) ? sticker : Buffer.isBuffer(sticker?.data) ? sticker.data : null
		if (buffer && buffer.length > PREFLIGHT_LIMITS.stickerBytesMax) {
			out.push(finding(ERROR, 'sticker-too-large', `sticker ${i} is ${(buffer.length / 1024).toFixed(0)} KB, the limit is 1024 KB`))
		}
	}
}

const checkMentions = (content, recipient, out) => {
	const mentions = content.mentions ?? content.contextInfo?.mentionedJid
	if (!Array.isArray(mentions)) return
	if (mentions.length > PREFLIGHT_LIMITS.mentionsMax) {
		out.push(finding(ERROR, 'mentions-too-many', `${mentions.length} mentions, the limit is ${PREFLIGHT_LIMITS.mentionsMax}`))
	}
	const malformed = mentions.filter(jid => typeof jid !== 'string' || !jid.includes('@'))
	if (malformed.length) {
		out.push(finding(ERROR, 'mention-malformed', `${malformed.length} mention(s) are not jids`, 'use jidEncode() or a full "user@server" string'))
	}
	if (mentions.length && recipient === 'dm') {
		out.push(finding(WARNING, 'mentions-in-dm', 'mentions have no effect in a one-to-one chat'))
	}
}

const checkRecipientRules = (content, recipient, jid, out) => {
	if (recipient === 'unknown') {
		out.push(finding(ERROR, 'recipient-missing', 'no recipient jid was given', 'pass the jid you intend to send to'))
		return
	}
	if (recipient === 'newsletter') {
		if (Array.isArray(content.buttons) || Array.isArray(content.sections)) {
			out.push(finding(WARNING, 'interactive-in-newsletter', 'channels do not render buttons or list menus for subscribers'))
		}
		if (content.mentions?.length || content.contextInfo?.mentionedJid?.length) {
			out.push(finding(WARNING, 'mentions-in-newsletter', 'channel posts cannot mention subscribers'))
		}
	}
	if (recipient === 'status' && Array.isArray(content.buttons)) {
		out.push(finding(ERROR, 'buttons-in-status', 'status updates cannot carry buttons'))
	}
	if (typeof jid === 'string' && jid.includes('@') === false) {
		out.push(finding(ERROR, 'recipient-malformed', `"${jid}" is not a jid`))
	}
}

const checkMedia = (content, out) => {
	for (const kind of ['image', 'video', 'audio', 'document', 'sticker']) {
		const media = content[kind]
		if (media === undefined) continue
		const ok = Buffer.isBuffer(media) || (isPlainObject(media) && (typeof media.url === 'string' || Buffer.isBuffer(media.stream) || media.stream))
		if (!ok) {
			out.push(finding(ERROR, 'media-unresolvable', `${kind} is neither a Buffer nor { url } nor { stream }`))
		}
		if (isPlainObject(media) && typeof media.url === 'string' && media.url.trim() === '') {
			out.push(finding(ERROR, 'media-empty-url', `${kind}.url is empty`))
		}
	}
	if (content.audio && content.ptt === undefined && content.mimetype === undefined) {
		out.push(finding(WARNING, 'audio-no-mimetype', 'audio without a mimetype may be shown as a file', 'set mimetype, or ptt: true for a voice note'))
	}
}

/**
 * Inspect a message payload the way `sendMessage` would, without sending it.
 *
 * @param {object} content the same object you would hand to `sendMessage`
 * @param {object} [options]
 * @param {string} [options.jid] the intended recipient; enables the recipient-type rules
 * @returns {{ ok: boolean, recipient: string, findings: Array, errors: Array, warnings: Array, checked: string[] }}
 */
export const preflightMessage = (content, options = {}) => {
	const jid = typeof options.jid === 'string' ? options.jid : undefined
	const recipient = describeRecipient(jid)
	const findings = []

	if (!isPlainObject(content)) {
		findings.push(finding(ERROR, 'content-not-an-object', `message content must be an object, got ${content === null ? 'null' : typeof content}`))
		return {
			ok: false,
			recipient,
			findings,
			errors: findings,
			warnings: [],
			checked: []
		}
	}

	checkRecipientRules(content, recipient, jid, findings)
	checkText(content, findings)
	checkPoll(content, recipient, findings)
	checkButtons(content, findings)
	checkList(content, findings)
	checkAlbum(content, findings)
	checkStickerPack(content, findings)
	checkMentions(content, recipient, findings)
	checkMedia(content, findings)

	const errors = findings.filter(f => f.severity === ERROR)
	const warnings = findings.filter(f => f.severity === WARNING)
	return {
		ok: errors.length === 0,
		recipient,
		findings,
		errors,
		warnings,
		// Named so nobody reads a clean result as a delivery guarantee.
		checked: ['local-limits', 'recipient-rules', 'payload-shape']
	}
}

/**
 * One-line summary for logs. Returns an empty string when there is nothing to report, so
 * it can be dropped straight into a template without an if.
 */
export const formatPreflight = result => {
	if (!result || !result.findings?.length) return ''
	return result.findings.map(f => `[${f.severity}] ${f.code}: ${f.message}${f.hint ? ` (${f.hint})` : ''}`).join('\n')
}
