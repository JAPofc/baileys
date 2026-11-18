import { BaseBuilder, generateWAMessageFromContent, getBizBinaryNode } from './shared.js';
import { CarouselCardType } from '../Types/index.js';

const hasText = (value) => typeof value === 'string' ? value.trim().length > 0 : value != null;
const asArray = (value) => value == null ? [] : (Array.isArray(value) ? value : [value]);

const normalizeCarouselButton = (button, index) => {
	if (!button || typeof button !== 'object' || Array.isArray(button)) {
		throw new TypeError(`addTextCard.buttons[${index}] must be a button object`);
	}
	if (button.name && button.buttonParamsJson) {
		return button;
	}
	const displayText = button.display_text ?? button.displayText ?? button.text ?? button.buttonText ?? `Button ${index + 1}`;
	if (button.id || button.reply) {
		return {
			name: 'quick_reply',
			buttonParamsJson: JSON.stringify({ display_text: displayText, id: button.id ?? button.reply }),
		};
	}
	if (button.url) {
		return {
			name: 'cta_url',
			buttonParamsJson: JSON.stringify({ display_text: displayText, url: button.url, merchant_url: button.merchant_url ?? button.url, webview_interaction: button.useWebview }),
		};
	}
	const rawWebview = button.webview ?? button.openWebview;
	if (rawWebview) {
		const webview = typeof rawWebview === 'string' ? { url: rawWebview } : rawWebview;
		return {
			name: 'open_webview',
			buttonParamsJson: JSON.stringify({
				title: displayText,
				link: {
					url: webview.url,
					in_app_webview: webview.inAppWebview ?? webview.in_app_webview ?? true,
				},
			}),
		};
	}
	throw new TypeError(`addTextCard.buttons[${index}] needs id/reply, url, webview/openWebview, or raw name+buttonParamsJson`);
};

class Carousel extends BaseBuilder {
	#client;

	// JAP@Add 22-08-26 (v4.7) --- WhatsApp caps carousels at 10 cards; anything beyond
	// that is silently truncated client-side, so failing fast here is more useful than
	// shipping a carousel that quietly loses cards.
	static MAX_CARDS = 10;

	/** @param {import('../../WAProto/index.js').WASocket} client Active Baileys socket. */
	constructor(client) {
		super();
		if (!client) {
			throw new Error('Socket is required');
		}

		this.#client = client;
		this._cards = [];
		this._carouselOptions = {
			carouselCardType: CarouselCardType.UNKNOWN,
			messageVersion: 1,
		};
	}

	/**
	 * Decide whether a prebuilt carousel card has something WhatsApp can render.
	 * Accepts media cards AND text/button-only cards (WA supports both).
	 * @param {Record<string, any>} card
	 * @returns {{ ok: boolean, reason: 'empty-card' | null }}
	 */
	static assessCard(card) {
		if (!card || typeof card !== 'object' || Array.isArray(card)) {
			return { ok: false, reason: 'empty-card' };
		}
		const hasMedia = !!card.header?.hasMediaAttachment;
		const hasRenderableText = [
			card.body?.text,
			card.footer?.text,
			card.header?.title,
			card.header?.subtitle,
			card.text,
			card.caption,
		].some(hasText);
		const hasButtons = Array.isArray(card.nativeFlowMessage?.buttons) && card.nativeFlowMessage.buttons.length > 0;
		return hasMedia || hasRenderableText || hasButtons
			? { ok: true, reason: null }
			: { ok: false, reason: 'empty-card' };
	}

	static isValidCard(card) {
		return Carousel.assessCard(card).ok;
	}

	/** Configure carousel-level proto metadata. Defaults match the sendMessage carousel path. */
	setCarouselOptions({ carouselCardType = this._carouselOptions.carouselCardType, messageVersion = this._carouselOptions.messageVersion } = {}) {
		if (!Number.isFinite(Number(messageVersion)) || Number(messageVersion) <= 0) {
			throw new TypeError('setCarouselOptions.messageVersion must be a positive number');
		}
		this._carouselOptions = {
			carouselCardType,
			messageVersion: Number(messageVersion),
		};
		return this;
	}

	/**
	 * Add one card, or an array of cards, to the carousel.
	 * @param {Record<string, any>|Record<string, any>[]} card A prebuilt carousel card — typically
	 *   from `new Button(client).setImage(...).addUrl(...).toCard()`, but text/button-only cards are valid too.
	 */
	addCard(card) {
		const cards = Array.isArray(card) ? card : [card];
		const baseIndex = this._cards.length;

		for (const [index, c] of cards.entries()) {
			const check = Carousel.assessCard(c);
			if (!check.ok) {
				throw new Error(`Carousel card [${baseIndex + index}] requires media, text, or buttons`);
			}
		}

		if (this._cards.length + cards.length > Carousel.MAX_CARDS) {
			throw new Error(`Carousel supports at most ${Carousel.MAX_CARDS} cards (got ${this._cards.length + cards.length})`);
		}

		this._cards.push(...cards);
		return this;
	}

	/** Add several prebuilt cards in one fluent call. */
	addCards(...cards) {
		return this.addCard(cards.flat());
	}

	/**
	 * Add a text/button-only card without manually constructing the proto-shaped card.
	 * Buttons may be raw native-flow buttons or simple `{ id, text }`, `{ url, text }`, `{ webview, text }` objects.
	 */
	addTextCard({ title = '', subtitle = '', body, text, footer = '', buttons = [], params = {}, contextInfo } = {}) {
		const normalizedButtons = asArray(buttons).map(normalizeCarouselButton);
		const card = {
			header: { title, subtitle, hasMediaAttachment: false },
			body: { text: String(body ?? text ?? '') },
			...(footer ? { footer: { text: String(footer) } } : {}),
			...(normalizedButtons.length ? { nativeFlowMessage: { messageParamsJson: JSON.stringify(params), buttons: normalizedButtons } } : {}),
			...(contextInfo ? { contextInfo } : {}),
		};
		return this.addCard(card);
	}

	/** Remove every card added so far. */
	clearCards() {
		this._cards = [];
		return this;
	}

	/** How many cards have been added. */
	countCards() {
		return this._cards.length;
	}

	/** Return a shallow copy of the accumulated cards for inspection/tests. */
	getCards() {
		return [...this._cards];
	}

	/** Pre-flight validation without touching the socket. */
	validate() {
		const errors = [];
		const warnings = [];
		if (!this._cards.length) {
			errors.push('empty: add at least one card (addCard/addTextCard)');
		}
		if (this._cards.length > Carousel.MAX_CARDS) {
			errors.push(`too many cards: max ${Carousel.MAX_CARDS}, got ${this._cards.length}`);
		}
		this._cards.forEach((card, index) => {
			const check = Carousel.assessCard(card);
			if (!check.ok) {
				errors.push(`card[${index}] requires media, text, or buttons`);
			}
			const count = card?.nativeFlowMessage?.buttons?.length ?? 0;
			if (count > 10) {
				warnings.push(`card[${index}] has ${count} buttons; WhatsApp typically renders at most ~10`);
			}
		});
		return { ok: errors.length === 0, errors, warnings };
	}

	/** Throw when validate() reports errors; returns `this` when valid. */
	assertValid() {
		const { ok, errors } = this.validate();
		if (!ok) {
			throw new Error(`Carousel.validate failed:\n- ${errors.join('\n- ')}`);
		}
		return this;
	}

	/** @returns {Record<string, any>} The generated WAMessage (without sending). */
	build(jid, { validate: shouldValidate, ...options } = {}) {
		if (shouldValidate) {
			this.assertValid();
		}
		return generateWAMessageFromContent(
			jid,
			{
				...this._extraPayload,
				interactiveMessage: {
					header: {
						hasMediaAttachment: false,
					},
					body: { text: this._body },
					footer: { text: this._footer },
					contextInfo: this._contextInfo,
					carouselMessage: {
						cards: this._cards,
						...this._carouselOptions,
					},
				},
			},
			{ ...options }
		);
	}

	/** Build and send this carousel. @param {string} jid Destination chat/group jid. */
	async send(jid, { validate: shouldValidate = true, ...options } = {}) {
		if (shouldValidate) {
			this.assertValid();
		} else if (this._cards.length === 0) {
			throw new Error('Carousel requires at least one card (use addCard())');
		}

		const msg = this.build(jid, options);

		await this.#client.relayMessage(msg.key.remoteJid, msg.message, {
			messageId: msg.key.id,
			additionalNodes: [getBizBinaryNode(msg.message)],
			...options,
		});
		return msg;
	}
}

/** Carousel of interactive cards (each with media, text, buttons, or a combination), scrollable horizontally in-chat. */
export { Carousel };
