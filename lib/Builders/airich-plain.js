// JAP@Add (§2.99) --- render an AIRich card for plain WhatsApp / WhatsApp Business.
//
// AIRich builds a `botForwardedMessage.richResponseMessage`, which only the Meta-AI
// surface knows how to draw. Personal and Business accounts receive the message but
// show an empty bubble ("waiting for this message"), because they have no renderer
// for GenAI layout view models.
//
// This module walks the very same `_sections` array AIRich already produced and flattens
// it into WhatsApp's own formatting (*bold*, ```code```, links), so the exact same card
// can be delivered as an ordinary extendedTextMessage — or, when the chat supports it,
// as an interactiveMessage whose body is that text and whose buttons are the card's
// suggestions.
//
// Nothing here changes AIRich's default behaviour: it is reached only through
// `send(jid, { compat: ... })` / `buildPlain()`, opt-in per call.

/** The three delivery shapes a card can take. */
export const AIRICH_COMPAT_MODES = ['rich', 'plain', 'interactive', 'auto'];

const typenameOf = primitive => primitive?.__typename || '';

/** Resolve `{{SS_n}}label{{/SS_n}}` citation spans into plain `label (url)` text. */
const expandInlineEntities = (text, entities) => {
	let out = String(text ?? '');
	for (const entity of entities || []) {
		const key = entity?.key;
		if (!key) {
			continue;
		}
		const meta = entity.metadata || {};
		const url = meta.reference_url || '';
		const open = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
		const close = new RegExp(`\\{\\{/${key}\\}\\}`, 'g');
		// `{{SS_0}}https://x{{/SS_0}}` -> the url is already the label, don't print it twice.
		out = out.replace(new RegExp(`\\{\\{${key}\\}\\}\\s*${escapeRegExp(url)}\\s*\\{\\{/${key}\\}\\}`, 'g'), url);
		out = out.replace(open, '').replace(close, url ? ` (${url})` : '');
	}
	return out.replace(/\{\{\/?[A-Za-z0-9_]+\}\}/g, '').trim();
};

const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Markdown `**bold**` / `__italic__` -> WhatsApp `*bold*` / `_italic_`. */
const toWhatsAppFormatting = text =>
	String(text ?? '')
		.replace(/\*\*(.+?)\*\*/gs, '*$1*')
		.replace(/__(.+?)__/gs, '_$1_');

const renderPrimitive = primitive => {
	const type = typenameOf(primitive);

	if (type === 'FOATextPrimitive') {
		// Headings: WhatsApp has no heading syntax, bold is the closest thing.
		const text = toWhatsAppFormatting(expandInlineEntities(primitive.text, primitive.inline_entities));
		return text ? `*${text}*` : '';
	}

	if (type === 'GenAIMarkdownTextUXPrimitive') {
		return toWhatsAppFormatting(expandInlineEntities(primitive.text, primitive.inline_entities));
	}

	if (type === 'GenAICodeUXPrimitive') {
		const code = (primitive.code_blocks || []).map(block => block?.content ?? '').join('');
		return code ? '```' + code + '```' : '';
	}

	if (type === 'GenAIImageUXPrimitive' || type === 'GenAIInlineImageUXPrimitive') {
		const caption = expandInlineEntities(primitive.text ?? primitive.caption, primitive.inline_entities);
		const url = primitive.image_url || primitive.url || primitive.tap_link_url || '';
		return [caption, url].filter(Boolean).join('\n');
	}

	// Products / cards / anything with a title+subtitle pair.
	const title = primitive?.title?.text ?? primitive?.title;
	const subtitle = primitive?.subtitle?.text ?? primitive?.subtitle ?? primitive?.body?.text;
	if (typeof title === 'string' || typeof subtitle === 'string') {
		return [typeof title === 'string' ? `*${title}*` : '', typeof subtitle === 'string' ? subtitle : ''].filter(Boolean).join('\n');
	}

	if (typeof primitive?.text === 'string') {
		return toWhatsAppFormatting(expandInlineEntities(primitive.text, primitive.inline_entities));
	}

	return '';
};

const primitivesOf = section => {
	const vm = section?.view_model ?? section;
	if (!vm) {
		return [];
	}
	if (vm.primitive) {
		return [vm.primitive];
	}
	if (Array.isArray(vm.primitives)) {
		return vm.primitives;
	}
	if (Array.isArray(vm.items)) {
		return vm.items.map(item => item?.primitive ?? item).filter(Boolean);
	}
	return [];
};

/**
 * Flatten resolved AIRich sections into a WhatsApp-formatted string.
 * @param {object[]} sections Already-awaited `AIRich#_sections` entries.
 * @param {{ title?: string, footer?: string }} [opts]
 * @returns {string}
 */
export const renderAIRichSectionsAsText = (sections = [], { title, footer } = {}) => {
	const blocks = [];
	if (title) {
		blocks.push(`*${title}*`);
	}
	for (const section of sections) {
		for (const primitive of primitivesOf(section)) {
			const rendered = renderPrimitive(primitive);
			if (rendered) {
				blocks.push(rendered);
			}
		}
	}
	if (footer) {
		blocks.push(footer);
	}
	return blocks.join('\n\n').trim();
};

/**
 * Turn a flattened card into a message content object that plain WhatsApp renders.
 * @param {string} text Output of {@link renderAIRichSectionsAsText}.
 * @param {object} [opts]
 * @param {'plain'|'interactive'} [opts.mode] `interactive` adds nativeFlow buttons (Business-friendly).
 * @param {{ name?: string, display_text?: string, id?: string, url?: string }[]} [opts.buttons]
 * @param {string} [opts.footer]
 * @param {object} [opts.contextInfo]
 */
export const buildPlainAIRichContent = (text, { mode = 'plain', buttons = [], footer, contextInfo } = {}) => {
	if (!text && !buttons.length) {
		throw new Error('buildPlainAIRichContent: nothing to send — the card rendered to an empty string');
	}

	if (mode !== 'interactive' || !buttons.length) {
		return {
			text: footer && !text.endsWith(footer) ? `${text}\n\n${footer}` : text,
			...(contextInfo ? { contextInfo } : {}),
		};
	}

	return {
		interactiveMessage: {
			body: { text },
			...(footer ? { footer: { text: footer } } : {}),
			nativeFlowMessage: {
				buttons: buttons.map(button => {
					if (button.url) {
						return {
							name: 'cta_url',
							buttonParamsJson: JSON.stringify({ display_text: button.display_text || button.name || 'Open', url: button.url, merchant_url: button.url }),
						};
					}
					return {
						name: 'quick_reply',
						buttonParamsJson: JSON.stringify({ display_text: button.display_text || button.name || 'OK', id: button.id || button.name || 'reply' }),
					};
				}),
				messageParamsJson: '',
			},
			...(contextInfo ? { contextInfo } : {}),
		},
	};
};

/**
 * Decide how a card should be delivered.
 *
 * `auto` keeps the rich path for Meta-AI-capable sockets and falls back to the
 * interactive/plain path everywhere else — the default stays `rich`, so nothing
 * changes unless the caller asks for it.
 * @param {'rich'|'plain'|'interactive'|'auto'} mode
 * @param {{ hasButtons?: boolean, supportsInteractive?: boolean }} [hints]
 * @returns {{ mode: 'rich'|'plain'|'interactive', reason: string }}
 */
export const resolveAIRichCompatMode = (mode = 'rich', { hasButtons = false, supportsInteractive = true } = {}) => {
	if (!AIRICH_COMPAT_MODES.includes(mode)) {
		throw new TypeError(`resolveAIRichCompatMode: unknown mode ${JSON.stringify(mode)} (expected ${AIRICH_COMPAT_MODES.join(', ')})`);
	}
	if (mode === 'rich') {
		return { mode: 'rich', reason: 'requested' };
	}
	if (mode === 'plain') {
		return { mode: 'plain', reason: 'requested' };
	}
	if (mode === 'interactive') {
		return supportsInteractive
			? { mode: 'interactive', reason: 'requested' }
			: { mode: 'plain', reason: 'interactive buttons unsupported on this platform' };
	}
	// auto
	if (hasButtons && supportsInteractive) {
		return { mode: 'interactive', reason: 'card has suggestions and the platform renders buttons' };
	}
	return { mode: 'plain', reason: hasButtons ? 'platform does not render buttons' : 'card has no suggestions' };
};
