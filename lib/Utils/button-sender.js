/**
 * lib/Utils/button-sender.js
 * Author: J.AP (@japofc/baileys)
 *
 * Runtime helpers for sending WhatsApp interactive / native-flow button
 * messages. These relay the payload through `relayMessage` directly (with the
 * `biz`/`native_flow` binary nodes WhatsApp needs), because the normal
 * `sendMessage` path does not understand `interactiveMessage` content.
 *
 * All rendered button kinds (quick_reply, cta_url, cta_copy, cta_call, list,
 * template, carousel/cards, single_select, combined) work on WhatsApp
 * Messenger + Business, Android + iOS.
 *
 * Public surface:
 *   InteractiveValidationError            structured authoring error
 *   buildInteractiveButtons(buttons)      legacy → native_flow normaliser
 *   validateAuthoringButtons(buttons)     permissive pre-convert check
 *   validateSendButtonsPayload(data)      strict sendButtons() check
 *   validateSendInteractiveMessagePayload(data)  strict interactive check
 *   validateInteractiveMessageContent(content)   post-convert check
 *   convertToInteractiveMessage(content)  authoring → proto shape
 *   sendInteractiveMessage(sock, jid, content, opts)   low-level sender
 *   sendInteractiveMessageV2(sock, jid, content, opts) + thumbnail/adReply
 *   sendButtons(sock, jid, data, opts)    quick-reply convenience wrapper
 */

import { generateMessageIDV2 } from './generics.js';
import { generateWAMessageFromContent, normalizeMessageContent } from './messages.js';
import { isJidGroup } from '../WABinary/index.js';
import { getButtonArgs, getButtonType } from './button-helper-utils.js';

// ── structured error ─────────────────────────────────────────────────────────

/**
 * Raised when an authoring payload fails validation. Bundles the failing
 * context, the list of errors/warnings, and a canonical example payload so a
 * caller can surface something actionable.
 */
export class InteractiveValidationError extends Error {
	constructor(message, { context, errors = [], warnings = [], example } = {}) {
		super(message);
		this.name = 'InteractiveValidationError';
		this.context = context;
		this.errors = errors;
		this.warnings = warnings;
		this.example = example;
	}

	toJSON() {
		return {
			name: this.name,
			message: this.message,
			context: this.context,
			errors: this.errors,
			warnings: this.warnings,
			example: this.example
		};
	}

	formatDetailed() {
		const out = [`[${this.name}] ${this.message}${this.context ? ` (${this.context})` : ''}`];
		if (this.errors.length) out.push('Errors:', ...this.errors.map((e) => `  - ${e}`));
		if (this.warnings.length) out.push('Warnings:', ...this.warnings.map((w) => `  - ${w}`));
		if (this.example) out.push('Example payload:', JSON.stringify(this.example, null, 2));
		return out.join('\n');
	}
}

/** Throw an InteractiveValidationError from a validation result if it's invalid. */
function assertValid(result, { message, context, example }) {
	if (!result.valid) {
		throw new InteractiveValidationError(message, {
			context,
			errors: result.errors,
			warnings: result.warnings,
			example
		});
	}
}

// ── protocol tables (WhatsApp native-flow facts) ─────────────────────────────

const COMPLEX_BUTTONS_FOR_SEND_BUTTONS = new Set(['cta_url', 'cta_copy', 'cta_call']);

const INTERACTIVE_BUTTON_NAMES = new Set([
	'quick_reply',
	'cta_url',
	'cta_copy',
	'cta_call',
	'cta_catalog',
	'cta_reminder',
	'cta_cancel_reminder',
	'address_message',
	'send_location',
	'open_webview',
	'mpm',
	'wa_payment_transaction_details',
	'automated_greeting_message_view_catalog',
	'galaxy_message',
	'single_select'
]);

/** Minimum params each button name needs inside its buttonParamsJson. */
const REQUIRED_PARAMS = {
	quick_reply: ['display_text', 'id'],
	cta_url: ['display_text', 'url'],
	cta_copy: ['display_text', 'copy_code'],
	cta_call: ['display_text', 'phone_number'],
	cta_catalog: ['business_phone_number'],
	cta_reminder: ['display_text'],
	cta_cancel_reminder: ['display_text'],
	address_message: ['display_text'],
	send_location: ['display_text'],
	open_webview: ['title', 'link'],
	mpm: ['product_id'],
	wa_payment_transaction_details: ['transaction_id'],
	automated_greeting_message_view_catalog: ['business_phone_number', 'catalog_product_id'],
	galaxy_message: ['flow_token', 'flow_id'],
	single_select: ['title', 'sections']
};

const EXAMPLES = {
	sendButtons: {
		text: 'Choose an option',
		buttons: [
			{ id: 'opt1', text: 'Option 1' },
			{ id: 'opt2', text: 'Option 2' },
			{ name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: 'Visit Site', url: 'https://example.com' }) }
		],
		footer: 'Footer text'
	},
	sendInteractiveMessage: {
		text: 'Pick an action',
		interactiveButtons: [
			{ name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'Hello', id: 'hello' }) },
			{ name: 'cta_copy', buttonParamsJson: JSON.stringify({ display_text: 'Copy Code', copy_code: 'ABC123' }) }
		],
		footer: 'Footer'
	}
};

// ── internal param parsing ───────────────────────────────────────────────────

/** Parse a buttonParamsJson string and check required + shape-specific fields. */
function parseParams(name, json, errors, index) {
	let parsed;
	try {
		parsed = JSON.parse(json);
	} catch (e) {
		errors.push(`button[${index}] (${name}) invalid JSON: ${e.message}`);
		return null;
	}

	for (const field of REQUIRED_PARAMS[name] ?? []) {
		if (!(field in parsed)) errors.push(`button[${index}] (${name}) missing required field '${field}'`);
	}

	if (name === 'open_webview' && parsed.link && (typeof parsed.link !== 'object' || !parsed.link.url)) {
		errors.push(`button[${index}] (open_webview) link.url required`);
	}
	if (name === 'single_select' && (!Array.isArray(parsed.sections) || parsed.sections.length === 0)) {
		errors.push(`button[${index}] (single_select) sections must be a non-empty array`);
	}
	return parsed;
}

/** Which of the three accepted authoring shapes does this button object use? */
function classifyButton(btn) {
	if (!btn || typeof btn !== 'object') return 'invalid';
	if (btn.name && btn.buttonParamsJson) return 'native';
	if (btn.id || btn.text || btn.displayText) return 'legacy';
	if (btn.buttonId && btn.buttonText?.displayText) return 'oldBaileys';
	return 'unknown';
}

// ── normalise + validate ─────────────────────────────────────────────────────

/**
 * Normalise the accepted authoring shapes into `{ name, buttonParamsJson }`:
 *   - native      `{ name, buttonParamsJson }`               → kept as-is
 *   - legacy      `{ id?, text?/displayText? }`               → quick_reply
 *   - old Baileys `{ buttonId, buttonText: { displayText } }` → quick_reply
 *   - unknown                                                 → passthrough
 */
export function buildInteractiveButtons(buttons = []) {
	return buttons.map((btn, i) => {
		switch (classifyButton(btn)) {
			case 'native':
				return btn;
			case 'legacy':
				return {
					name: 'quick_reply',
					buttonParamsJson: JSON.stringify({
						display_text: btn.text ?? btn.displayText ?? `Button ${i + 1}`,
						id: btn.id ?? `quick_${i + 1}`
					})
				};
			case 'oldBaileys':
				return {
					name: 'quick_reply',
					buttonParamsJson: JSON.stringify({ display_text: btn.buttonText.displayText, id: btn.buttonId })
				};
			default:
				return btn;
		}
	});
}

/** Permissive pre-conversion check: only flags clearly malformed buttons. */
export function validateAuthoringButtons(buttons) {
	const errors = [];
	const warnings = [];

	if (buttons === null) return { errors, warnings, valid: true, cleaned: [] };
	if (!Array.isArray(buttons)) {
		return { errors: ['buttons must be an array'], warnings, valid: false, cleaned: [] };
	}

	const SOFT_CAP = 25;
	if (buttons.length === 0) warnings.push('buttons array is empty');
	else if (buttons.length > SOFT_CAP) warnings.push(`buttons count (${buttons.length}) exceeds soft cap of ${SOFT_CAP}; may be rejected by client`);

	const cleaned = buttons.map((btn, idx) => {
		const kind = classifyButton(btn);
		if (kind === 'invalid') {
			errors.push(`button[${idx}] is not an object`);
		} else if (kind === 'native') {
			if (typeof btn.buttonParamsJson !== 'string') {
				errors.push(`button[${idx}] buttonParamsJson must be string`);
			} else {
				try { JSON.parse(btn.buttonParamsJson); }
				catch (e) { errors.push(`button[${idx}] buttonParamsJson is not valid JSON: ${e.message}`); }
			}
		} else if (kind === 'unknown') {
			warnings.push(`button[${idx}] unrecognized shape; passing through unchanged`);
		}
		return btn;
	});

	return { errors, warnings, valid: errors.length === 0, cleaned };
}

/** Strict validation for the sendButtons() payload. */
export function validateSendButtonsPayload(data) {
	const errors = [];
	const warnings = [];

	if (!data || typeof data !== 'object') return { valid: false, errors: ['payload must be an object'], warnings };

	if (!data.text || typeof data.text !== 'string') errors.push('text is mandatory and must be a string');

	if (!Array.isArray(data.buttons) || data.buttons.length === 0) {
		errors.push('buttons is mandatory and must be a non-empty array');
	} else {
		const allowed = [...COMPLEX_BUTTONS_FOR_SEND_BUTTONS].join(', ');
		data.buttons.forEach((btn, i) => {
			const kind = classifyButton(btn);
			if (kind === 'invalid') {
				errors.push(`button[${i}] must be an object`);
			} else if (btn.id && btn.text) {
				if (typeof btn.id !== 'string' || typeof btn.text !== 'string') {
					errors.push(`button[${i}] legacy quick reply id/text must be strings`);
				}
			} else if (btn.name && btn.buttonParamsJson) {
				if (!COMPLEX_BUTTONS_FOR_SEND_BUTTONS.has(btn.name)) {
					errors.push(`button[${i}] name '${btn.name}' not allowed in sendButtons (allowed: ${allowed})`);
				} else if (typeof btn.buttonParamsJson !== 'string') {
					errors.push(`button[${i}] buttonParamsJson must be string`);
				} else {
					parseParams(btn.name, btn.buttonParamsJson, errors, i);
				}
			} else {
				errors.push(`button[${i}] invalid shape — expected {id, text} or {name, buttonParamsJson} with name in [${allowed}]`);
			}
		});
	}

	return { valid: errors.length === 0, errors, warnings };
}

/** Strict validation for the sendInteractiveMessage() authoring payload. */
export function validateSendInteractiveMessagePayload(data) {
	const errors = [];
	const warnings = [];

	if (!data || typeof data !== 'object') return { valid: false, errors: ['payload must be an object'], warnings };

	if (!data.text || typeof data.text !== 'string') errors.push('text is mandatory and must be a string');

	if (!Array.isArray(data.interactiveButtons) || data.interactiveButtons.length === 0) {
		errors.push('interactiveButtons is mandatory and must be a non-empty array');
	} else {
		data.interactiveButtons.forEach((btn, i) => {
			if (!btn || typeof btn !== 'object') return errors.push(`interactiveButtons[${i}] must be an object`);
			if (!btn.name || typeof btn.name !== 'string') return errors.push(`interactiveButtons[${i}] missing name`);
			if (!INTERACTIVE_BUTTON_NAMES.has(btn.name)) return errors.push(`interactiveButtons[${i}] name '${btn.name}' not allowed`);
			if (!btn.buttonParamsJson || typeof btn.buttonParamsJson !== 'string') {
				return errors.push(`interactiveButtons[${i}] buttonParamsJson must be a non-empty string`);
			}
			parseParams(btn.name, btn.buttonParamsJson, errors, i);
		});
	}

	return { valid: errors.length === 0, errors, warnings };
}

/** Validate a converted interactiveMessage, right before WAMessage creation. */
export function validateInteractiveMessageContent(content) {
	const errors = [];
	const warnings = [];

	if (!content || typeof content !== 'object') return { errors: ['content must be an object'], warnings, valid: false };

	const interactive = content.interactiveMessage;
	if (!interactive) return { errors, warnings, valid: true }; // nothing to validate

	const nativeFlow = interactive.nativeFlowMessage;
	if (!nativeFlow) {
		errors.push('interactiveMessage.nativeFlowMessage missing');
		return { errors, warnings, valid: false };
	}
	if (!Array.isArray(nativeFlow.buttons)) {
		errors.push('nativeFlowMessage.buttons must be an array');
		return { errors, warnings, valid: false };
	}
	if (nativeFlow.buttons.length === 0) warnings.push('nativeFlowMessage.buttons is empty');

	nativeFlow.buttons.forEach((btn, i) => {
		if (!btn || typeof btn !== 'object') return errors.push(`buttons[${i}] is not an object`);

		if (!btn.buttonParamsJson) {
			warnings.push(`buttons[${i}] missing buttonParamsJson (may fail to render)`);
		} else if (typeof btn.buttonParamsJson !== 'string') {
			errors.push(`buttons[${i}] buttonParamsJson must be string`);
		} else {
			try { JSON.parse(btn.buttonParamsJson); }
			catch (e) { warnings.push(`buttons[${i}] buttonParamsJson invalid JSON (${e.message})`); }
		}

		if (!btn.name) {
			warnings.push(`buttons[${i}] missing name; defaulting to quick_reply`);
			btn.name = 'quick_reply';
		}
	});

	return { errors, warnings, valid: errors.length === 0 };
}

// ── authoring → proto conversion ─────────────────────────────────────────────

/**
 * Turn the authoring shape `{ text, footer?, title?, subtitle?, interactiveButtons }`
 * into `{ interactiveMessage: { nativeFlowMessage, body?, header?, footer? } }`.
 * Authoring-only keys are stripped so they never reach the proto serialiser.
 */
export function convertToInteractiveMessage(content) {
	const btns = content.interactiveButtons;
	if (!btns || btns.length === 0) return content;

	const interactiveMessage = {
		nativeFlowMessage: {
			buttons: btns.map((btn) => ({ name: btn.name ?? 'quick_reply', buttonParamsJson: btn.buttonParamsJson })),
			messageParamsJson: ''
		}
	};

	// header carries title and (independently) subtitle when both are present
	if (content.title || content.subtitle) {
		interactiveMessage.header = {
			title: content.title ?? content.subtitle ?? '',
			...(content.title && content.subtitle ? { subtitle: content.subtitle } : {})
		};
	}
	if (content.text) interactiveMessage.body = { text: content.text };
	if (content.footer) interactiveMessage.footer = { text: content.footer };

	const rest = { ...content };
	for (const key of ['interactiveButtons', 'title', 'subtitle', 'text', 'footer']) delete rest[key];
	return { ...rest, interactiveMessage };
}

// ── senders ──────────────────────────────────────────────────────────────────

/**
 * Low-level sender: validate → convert → build WAMessage → inject the required
 * binary nodes → relay.
 * @param {import('../Types/Socket.js').WASocket} sock Active socket (needs relayMessage).
 * @param {string} jid Destination JID.
 * @param {Record<string, unknown>} content Authoring payload.
 * @param {object} [options] Relay pass-through options.
 */
export async function sendInteractiveMessage(sock, jid, content, options = {}) {
	if (!sock) throw new InteractiveValidationError('Socket is required', { context: 'sendInteractiveMessage' });

	// 1. authoring validation (only when interactiveButtons authored here)
	if (Array.isArray(content.interactiveButtons)) {
		const strict = validateSendInteractiveMessagePayload(content);
		assertValid(strict, {
			message: 'Interactive authoring payload invalid',
			context: 'sendInteractiveMessage.validateSendInteractiveMessagePayload',
			example: EXAMPLES.sendInteractiveMessage
		});
		if (strict.warnings.length) sock.logger?.warn?.(strict.warnings, '[button-sender] sendInteractiveMessage warnings');
	}

	// 2. convert to proto shape + post-convert validation
	const converted = convertToInteractiveMessage(content);
	const post = validateInteractiveMessageContent(converted);
	assertValid(post, {
		message: 'Converted interactive content invalid',
		context: 'sendInteractiveMessage.validateInteractiveMessageContent',
		example: convertToInteractiveMessage(EXAMPLES.sendInteractiveMessage)
	});
	if (post.warnings.length) sock.logger?.warn?.(post.warnings, '[button-sender] Interactive content warnings');

	// 3. build WAMessage (bypasses sendMessage's interactive rejection)
	const userJid = sock.authState?.creds?.me?.id ?? sock.user?.id ?? '';
	const fullMsg = generateWAMessageFromContent(jid, converted, {
		userJid,
		messageId: generateMessageIDV2(userJid),
		timestamp: new Date()
	});

	// 4. derive binary nodes from the real (unwrapped) inner message
	const inner = normalizeMessageContent(fullMsg.message);
	const buttonType = inner ? getButtonType(inner) : undefined;
	const additionalNodes = [...(options.additionalNodes ?? [])];
	if (buttonType && inner) {
		additionalNodes.push(getButtonArgs(inner));
		if (!isJidGroup(jid)) additionalNodes.push({ tag: 'bot', attrs: { biz_bot: '1' } });
	}

	// 5. relay
	await sock.relayMessage(jid, fullMsg.message, {
		messageId: fullMsg.key.id,
		useCachedGroupMetadata: options.useCachedGroupMetadata,
		additionalAttributes: options.additionalAttributes ?? {},
		statusJidList: options.statusJidList,
		additionalNodes
	});

	// 6. optional local event emit (private chats only, avoids group double-processing)
	if (sock.config?.emitOwnEvents && !isJidGroup(jid)) {
		process.nextTick(() => {
			if (sock.processingMutex?.mutex && sock.upsertMessage) {
				void sock.processingMutex.mutex(() => sock.upsertMessage(fullMsg, 'append'));
			}
		});
	}

	return fullMsg;
}

/** Fetch a URL into a Buffer; prefers global fetch, falls back to axios if present. */
async function fetchBuffer(sock, url) {
	try {
		const res = await fetch(url);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		return Buffer.from(await res.arrayBuffer());
	} catch (fetchErr) {
		try {
			const { default: axios } = await import('axios');
			const res = await axios.get(url, { responseType: 'arraybuffer' });
			return Buffer.from(res.data);
		} catch {
			sock.logger?.warn?.({ err: fetchErr }, '[button-sender] Failed to fetch buffer from URL');
			return null;
		}
	}
}

/**
 * Extended sender that also patches a dummy document + externalAdReply so a
 * thumbnail renders above the buttons.
 *
 * Dummy-document source priority: filePath → fileUrl → thumbnailUrl → text.
 * `axios` is a soft dependency; failures here are non-fatal (logged only).
 */
export async function sendInteractiveMessageV2(sock, jid, content, options = {}) {
	if (!sock) throw new InteractiveValidationError('Socket is required', { context: 'sendInteractiveMessageV2' });

	const wantsAdReply = !!content.thumbnailUrl || !!content.filePath || !!content.fileUrl || options.forceExternalAdReply === true;

	// build a dummy document to anchor the externalAdReply thumbnail (only if no media present)
	if (wantsAdReply && !content.document && !content.image && !content.video) {
		try {
			let fileBuffer;
			let fileName = 'file.pdf';
			let mimeType = 'application/pdf';

			if (content.filePath) {
				const { readFileSync } = await import('fs');
				fileBuffer = readFileSync(content.filePath);
				fileName = content.filePath.split('/').pop() ?? fileName;
				mimeType = content.mimetype ?? 'application/octet-stream';
			} else if (content.fileUrl) {
				fileBuffer = (await fetchBuffer(sock, content.fileUrl)) ?? Buffer.from('dummy', 'utf-8');
				fileName = content.fileUrl.split('/').pop() ?? fileName;
				mimeType = content.mimetype ?? 'application/octet-stream';
			} else {
				fileBuffer = Buffer.from('dummy', 'utf-8');
			}

			content.document = fileBuffer;
			content.fileName = content.fileName ?? fileName;
			content.mimetype = content.mimetype ?? mimeType;
		} catch (e) {
			sock.logger?.warn?.({ err: e }, '[button-sender] Failed to build dummy document');
		}
	}

	// WA trusts a jpegThumbnail buffer more than a bare URL
	const jpegThumb = content.thumbnailUrl ? await fetchBuffer(sock, content.thumbnailUrl) : null;

	if (wantsAdReply) {
		const thumbUrl = content.thumbnailUrl ?? options.thumbnailUrl ?? '';
		const ctx = content.contextInfo ?? {};
		const ear = ctx.externalAdReply ?? {};
		content.contextInfo = {
			...ctx,
			externalAdReply: {
				...ear,
				mediaType: 1,
				containsAutoReply: true,
				title: ear.title ?? `© ${globalThis.ownername ?? 'JAP'}`,
				body: ear.body ?? 'Virtual Assistant',
				sourceUrl: ear.sourceUrl ?? 'https://example.com',
				mediaUrl: thumbUrl,
				thumbnailUrl: thumbUrl,
				renderLargerThumbnail: true,
				...(jpegThumb ? { jpegThumbnail: jpegThumb } : {})
			}
		};
	}

	return sendInteractiveMessage(sock, jid, content, options);
}

/**
 * Convenience wrapper for the common quick-reply / CTA case.
 * @example
 * await sendButtons(sock, jid, {
 *   text: 'Are you sure?', footer: 'Bot v1',
 *   buttons: [{ id: 'yes', text: 'Yes' }, { id: 'no', text: 'No' }]
 * })
 */
export async function sendButtons(sock, jid, data = { text: '', buttons: [] }, options = {}) {
	if (!sock) throw new InteractiveValidationError('Socket is required', { context: 'sendButtons' });

	const { text = '', footer = '', title, subtitle, buttons = [] } = data;

	const strict = validateSendButtonsPayload({ text, buttons, title, subtitle, footer });
	assertValid(strict, {
		message: 'Buttons payload invalid',
		context: 'sendButtons.validateSendButtonsPayload',
		example: EXAMPLES.sendButtons
	});
	if (strict.warnings.length) sock.logger?.warn?.(strict.warnings, '[button-sender] sendButtons warnings');

	const authoring = validateAuthoringButtons(buttons);
	if (authoring.errors.length) {
		throw new InteractiveValidationError('Authoring button objects invalid', {
			context: 'sendButtons.validateAuthoringButtons',
			errors: authoring.errors,
			warnings: authoring.warnings,
			example: EXAMPLES.sendButtons.buttons
		});
	}
	if (authoring.warnings.length) sock.logger?.warn?.(authoring.warnings, '[button-sender] Button validation warnings');

	const payload = { text, footer, interactiveButtons: buildInteractiveButtons(authoring.cleaned) };
	if (title) payload.title = title;
	if (subtitle) payload.subtitle = subtitle;

	return sendInteractiveMessage(sock, jid, payload, options);
}
