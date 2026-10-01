import { BaseBuilder, generateWAMessageFromContent, prepareWAMessageMedia, generateMessageIDV2, getBizBinaryNode } from './shared.js';

const hasText = (value) => typeof value === 'string' && value.trim().length > 0;

class ButtonV3 extends BaseBuilder {
	#client;

	static MAX_BUTTONS = 3;

	/** @param {import('../../WAProto/index.js').WASocket} client Active Baileys socket. */
	constructor(client) {
		super();
		if (!client) {
			throw new Error('Socket is required');
		}

		this.#client = client;
		this._data;
		this._mediaHeaderType = null;
		this._buttons = [];
	}

	/** Load an existing templateMessage (e.g. from a fetched/quoted message) for editing. */
	loadFrom(msg) {
		if (!msg) throw new Error('templateMessage needed');
		if (!msg.templateMessage) throw new Error('templateMessage not found');

		const { templateMessage, ...extraPayload } = msg;
		const hft = templateMessage.hydratedFourRowTemplate || {};

		this._title = hft.hydratedTitleText || '';
		this._body = hft.hydratedContentText || '';
		this._footer = hft.hydratedFooterText || '';
		this._contextInfo = templateMessage.contextInfo || {};
		this._extraPayload = extraPayload;

		this._buttons = Array.isArray(hft.hydratedButtons)
			? hft.hydratedButtons.map((button) => ({ ...button }))
			: [];

		if (hft.imageMessage) {
			this._data = { imageMessage: hft.imageMessage };
			this._mediaHeaderType = 'imageMessage';
		} else if (hft.videoMessage) {
			this._data = { videoMessage: hft.videoMessage };
			this._mediaHeaderType = 'videoMessage';
		} else if (hft.documentMessage) {
			this._data = { documentMessage: hft.documentMessage };
			this._mediaHeaderType = 'documentMessage';
		} else if (hft.locationMessage) {
			this._data = { locationMessage: hft.locationMessage };
			this._mediaHeaderType = 'locationMessage';
		} else {
			this._data = undefined;
			this._mediaHeaderType = null;
		}

		return this;
	}

	setImage(path, options = {}) {
		if (!path) throw new Error('Url or buffer needed');
		this._data = Buffer.isBuffer(path)
			? { image: path, ...options }
			: { image: { url: path }, ...options };
		this._mediaHeaderType = 'imageMessage';
		return this;
	}

	setVideo(path, options = {}) {
		if (!path) throw new Error('Url or buffer needed');
		this._data = Buffer.isBuffer(path)
			? { video: path, ...options }
			: { video: { url: path }, ...options };
		this._mediaHeaderType = 'videoMessage';
		return this;
	}

	setDocument(path, options = {}) {
		if (!path) throw new Error('Url or buffer needed');
		this._data = Buffer.isBuffer(path)
			? { document: path, ...options }
			: { document: { url: path }, ...options };
		this._mediaHeaderType = 'documentMessage';
		return this;
	}

	setMedia(obj) {
		if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
			throw new TypeError('Media must be a plain object');
		}
		this._data = obj;
		this._mediaHeaderType = null; // caller is expected to pass an already-resolved shape
		return this;
	}

	clearButtons() {
		this._buttons = [];
		return this;
	}

	/** The accumulated hydrated buttons, shallow-copied for inspection. */
	getButtons() {
		return this._buttons.map((button) => ({ ...button }));
	}

	/** How many hydrated buttons have been added. */
	countButtons() {
		return this._buttons.length;
	}

	addButton(hydratedButton) {
		if (typeof hydratedButton !== 'object' || hydratedButton === null || Array.isArray(hydratedButton)) {
			throw new TypeError('addButton(hydratedButton) requires a plain object');
		}
		if (this._buttons.length >= ButtonV3.MAX_BUTTONS) {
			throw new Error(`ButtonV3 (TemplateMessage) supports a maximum of ${ButtonV3.MAX_BUTTONS} buttons`);
		}
		this._buttons.push({ index: this._buttons.length + 1, ...hydratedButton });
		return this;
	}

	addReply(display_text = '', id = '') {
		if (!display_text || !id) {
			throw new TypeError('addReply(display_text, id) requires both a label and an id');
		}
		return this.addButton({
			quickReplyButton: { displayText: display_text, id },
		});
	}

	addUrl(display_text = '', url = '', options = {}) {
		if (!display_text || !url) {
			throw new TypeError('addUrl(display_text, url) requires both a label and a url');
		}
		return this.addButton({
			urlButton: { displayText: display_text, url, ...options },
		});
	}

	addCall(display_text = '', phone_number = '') {
		if (!display_text || !phone_number) {
			throw new TypeError('addCall(display_text, phone_number) requires both a label and a phone number');
		}
		return this.addButton({
			callButton: { displayText: display_text, phoneNumber: phone_number },
		});
	}

	/** Pre-flight validation for hydrated template buttons without touching the socket. */
	validate() {
		const errors = [];
		const warnings = [];
		if (!this._buttons.length) {
			errors.push('empty: add at least one button');
		}
		if (this._buttons.length > ButtonV3.MAX_BUTTONS) {
			errors.push(`too many buttons: max ${ButtonV3.MAX_BUTTONS}, got ${this._buttons.length}`);
		}
		this._buttons.forEach((button, index) => {
			const at = `button[${index}]`;
			if (!button || typeof button !== 'object' || Array.isArray(button)) {
				errors.push(`${at}: must be an object`);
				return;
			}
			const kinds = ['quickReplyButton', 'urlButton', 'callButton'].filter((key) => button[key]);
			if (kinds.length === 0) {
				errors.push(`${at}: needs quickReplyButton, urlButton, or callButton`);
				return;
			}
			if (kinds.length > 1) {
				warnings.push(`${at}: has multiple button actions (${kinds.join(', ')}); clients may use only one`);
			}
			if (button.quickReplyButton) {
				if (!hasText(button.quickReplyButton.displayText)) errors.push(`${at}: quickReplyButton.displayText required`);
				if (!hasText(button.quickReplyButton.id)) errors.push(`${at}: quickReplyButton.id required`);
			}
			if (button.urlButton) {
				if (!hasText(button.urlButton.displayText)) errors.push(`${at}: urlButton.displayText required`);
				if (!hasText(button.urlButton.url)) errors.push(`${at}: urlButton.url required`);
				else {
					try { new URL(button.urlButton.url); }
					catch { errors.push(`${at}: invalid url "${button.urlButton.url}"`); }
				}
			}
			if (button.callButton) {
				if (!hasText(button.callButton.displayText)) errors.push(`${at}: callButton.displayText required`);
				if (!hasText(button.callButton.phoneNumber)) errors.push(`${at}: callButton.phoneNumber required`);
			}
		});
		return { ok: errors.length === 0, errors, warnings };
	}

	/** Throw when validate() reports errors; returns `this` when valid. */
	assertValid() {
		const { ok, errors } = this.validate();
		if (!ok) {
			throw new Error(`ButtonV3.validate failed:\n- ${errors.join('\n- ')}`);
		}
		return this;
	}

	async toTemplate() {
		let mediaFields = {};

		if (this._data) {
			const alreadyResolved =
				this._data.imageMessage || this._data.videoMessage ||
				this._data.documentMessage || this._data.locationMessage;

			mediaFields = alreadyResolved
				? this._data
				: await prepareWAMessageMedia(this._data, {
						upload: this.#client.waUploadToServer,
					}).catch((e) => {
						if (String(e).includes('Invalid media type')) return this._data;
						throw e;
					});
		} else if (this._title) {
			mediaFields = { hydratedTitleText: this._title };
		}

		return {
			hydratedContentText: this._body,
			hydratedFooterText: this._footer,
			hydratedButtons: this._buttons,
			...mediaFields,
		};
	}

	async build(jid, { messageId, validate: shouldValidate = false, ...options } = {}) {
		if (shouldValidate) {
			this.assertValid();
		}
		const hydratedFourRowTemplate = await this.toTemplate();

		return generateWAMessageFromContent(
			jid,
			{
				...this._extraPayload,
				templateMessage: {
					hydratedFourRowTemplate,
					contextInfo: this._contextInfo,
				},
			},
			{ messageId: messageId || generateMessageIDV2(), ...options },
		);
	}

	async send(jid, { messageId, additionalNodes = [], validate: shouldValidate = true, ...options } = {}) {
		if (shouldValidate) {
			this.assertValid();
		} else if (this._buttons.length < 1) {
			throw new Error('ButtonV3 requires at least one button');
		}
		const msg = await this.build(jid, { messageId, ...options });

		// JAP@Fix (§2.30 / v2.4.7): templateMessage also goes through the shared
		// canonical <biz> node when relayed directly, matching getBizBinaryNode().
		await this.#client.relayMessage(msg.key.remoteJid, msg.message, {
			messageId: msg.key.id,
			additionalNodes: [getBizBinaryNode(msg.message), ...additionalNodes],
			...options,
		});
		return msg;
	}
}

/**
 * Legacy `templateMessage` / `hydratedFourRowTemplate` builder — WA's Generation-1
 * button protocol (predates the nativeFlow format that Button/ButtonV2 use).
 * Capped at 3 buttons (quickReply/url/call only), no interactive list/flow support.
 * Ported from MessageBuilderV4.7.
 */
export { ButtonV3 };
