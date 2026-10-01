import { BaseBuilder, Toolkit, RowBuilder, generateWAMessageFromContent, crypto, getBizBinaryNode } from './shared.js';

class ButtonV2 extends BaseBuilder {
	#client;

	// Legacy buttonsMessage only renders up to three quick-reply buttons.
	static MAX_BUTTONS = 3;

	/** @param {import('../../WAProto/index.js').WASocket} client Active Baileys socket. */
	constructor(client) {
		super();
		if (!client) {
			throw new Error('Socket is required');
		}

		this.#client = client;
		this._image;
		this._data;
		this._buttons = [];
	}

	#assertCanAdd(count = 1) {
		if (this._buttons.length + count > ButtonV2.MAX_BUTTONS) {
			throw new Error(`ButtonV2 supports a maximum of ${ButtonV2.MAX_BUTTONS} buttons`);
		}
	}

	/** Add a simple quick-reply button. @param {string} displayText Label. @param {string} [buttonId] Defaults to a random uuid. */
	addButton(displayText = '', buttonId = crypto.randomUUID()) {
		if (!displayText) throw new TypeError('addButton(displayText) requires a non-empty label');
		if (!buttonId) throw new TypeError('addButton(displayText, buttonId) requires a non-empty buttonId');
		this.#assertCanAdd();
		this._buttons.push({
			buttonId,
			buttonText: { displayText },
			type: 1,
		});
		return this;
	}

	/** Push a raw pre-built button object, bypassing the `addButton()` shorthand. */
	addRawButton(obj) {
		if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
			throw new TypeError('Buttons must be a plain object');
		}
		this.#assertCanAdd();
		this._buttons.push(obj);
		return this;
	}

	/** Set the header thumbnail (used as a fallback location-header image when no `setMedia()` header is given). */
	setThumbnail(path) {
		if (!path) throw new Error('Url or buffer needed');
		this._image = path;
		return this;
	}

	/** Set a raw pre-built header media object for the buttons message. */
	setMedia(obj) {
		if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
			throw new TypeError('Media must be a plain object');
		}

		this._data = obj;
		return this;
	}

	/** Remove every button added so far. */
	clearButtons() {
		this._buttons = [];
		return this;
	}

	/** The accumulated legacy button objects, shallow-copied for inspection. */
	getButtons() {
		return this._buttons.map((button) => ({ ...button }));
	}

	/** How many buttons have been added. */
	countButtons() {
		return this._buttons.length;
	}

	/** Alias for addButton() — shorthand parity with RowBuilder#button(). */
	button(displayText, buttonId) {
		return this.addButton(displayText, buttonId);
	}

	/**
	 * JAP@Add 29-08-26 --- Fluent row helper ported from the RowBuilder class (already
	 * present but previously unwired into ButtonV2). Lets callers group buttons via a
	 * callback instead of chaining addButton() calls one at a time.
	 * @param {(row: RowBuilder) => void} cb
	 */
	row(cb) {
		if (typeof cb !== 'function') throw new TypeError('row(cb) requires a callback');
		const r = new RowBuilder();
		cb(r);
		this.#assertCanAdd(r.buttons.length);
		r.buttons.forEach((b) => this._buttons.push(b));
		return this;
	}

	/**
	 * Pre-flight validation for legacy buttonsMessage without touching the socket.
	 * Catches the empty/malformed buttons WhatsApp otherwise drops silently.
	 * @returns {{ ok: boolean, errors: string[], warnings: string[] }}
	 */
	validate() {
		const errors = [];
		const warnings = [];
		if (!this._buttons.length) {
			errors.push('empty: add at least one button');
		}
		if (this._buttons.length > ButtonV2.MAX_BUTTONS) {
			errors.push(`too many buttons: max ${ButtonV2.MAX_BUTTONS}, got ${this._buttons.length}`);
		}
		this._buttons.forEach((button, index) => {
			const at = `button[${index}]`;
			if (!button || typeof button !== 'object' || Array.isArray(button)) {
				errors.push(`${at}: must be an object`);
				return;
			}
			if (!button.buttonId) {
				errors.push(`${at}: missing buttonId`);
			}
			const label = button.buttonText?.displayText;
			if (!label) {
				errors.push(`${at}: missing buttonText.displayText`);
			}
			if (button.type != null && button.type !== 1) {
				warnings.push(`${at}: legacy buttonsMessage usually expects type:1 quick replies`);
			}
		});
		return { ok: errors.length === 0, errors, warnings };
	}

	/** Throw when validate() reports errors; returns `this` when valid. */
	assertValid() {
		const { ok, errors } = this.validate();
		if (!ok) {
			throw new Error(`ButtonV2.validate failed:\n- ${errors.join('\n- ')}`);
		}
		return this;
	}

	// JAP@Fix 22-08-26 (v4.7) --- _thumbnail was computed unconditionally (fetch + resize) even
	// when setMedia() is used, in which case the location-fallback header (the only place
	// _thumbnail is used) never runs at all — wasted network/CPU work on every build() call.
	// Now only computed when it'll actually be used. Also: `viewOnce` was hardcoded true with no
	// way to opt out (kept as the default — some clients need it to render legacy buttonsMessage
	// at all — but it's now a `{ viewOnce = true }` option instead of a hardcoded literal).
	/** @returns {Promise<Record<string, any>>} The generated WAMessage (without sending). @param {boolean} [viewOnce] Default true — some clients require this for legacy buttonsMessage to render; pass false to send it as a normal (non-disappearing) message. */
	async build(jid, { viewOnce = true, validate: shouldValidate = false, ...options } = {}) {
		if (shouldValidate) {
			this.assertValid();
		}
		const _thumbnail = !this._data && this._image ? await Toolkit.resize(Buffer.isBuffer(this._image) ? this._image : await Toolkit.fetchBuffer(this._image, {}, { silent: true }), 300, 300) : null;
		const msg = generateWAMessageFromContent(
			jid,
			{
				...this._extraPayload,
				buttonsMessage: {
					contentText: this._body,
					footerText: this._footer,
					...(this._data
						? this._data
						: {
								headerType: 6,
								locationMessage: {
									degreesLatitude: 0,
									degreesLongitude: 0,
									name: this._title,
									address: this._subtitle,
									jpegThumbnail: _thumbnail,
								},
							}),
					viewOnce,
					contextInfo: this._contextInfo,
					buttons: [...this._buttons],
				},
			},
			{ ...options }
		);
		return msg;
	}

	/** Build and send this buttons message. @param {string} jid Destination chat/group jid. */
	async send(jid, { validate: shouldValidate = true, ...options } = {}) {
		if (shouldValidate) {
			this.assertValid();
		} else if (this._buttons.length < 1) {
			throw new Error('ButtonV2 requires at least one button');
		}
		const msg = await this.build(jid, options);

		// JAP@Fix (§2.30 / v2.4.7): use the same canonical <biz> node as the
		// socket send path (actual_actors/host_storage/privacy_mode_ts + quality
		// control) instead of the old hand-rolled attrs:{} mixed-flow node.
		await this.#client.relayMessage(msg.key.remoteJid, msg.message, {
			messageId: msg.key.id,
			additionalNodes: [getBizBinaryNode(msg.message)],
			...options,
		});
		return msg;
	}
}

/**
 * Legacy `buttonsMessage` builder — quick-reply buttons with an optional media
 * header (or a location-header fallback built from `setThumbnail()`). Sent with
 * the canonical `biz`/`native_flow` additional node some clients require to
 * render it. Prefer `Button` (interactiveMessage/nativeFlow) for new bots.
 */
export { ButtonV2 };
