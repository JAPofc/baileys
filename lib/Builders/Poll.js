import { BaseBuilder, generateWAMessageFromContent, prepareWAMessageMedia, generateMessageIDV2, crypto } from './shared.js';
class Poll extends BaseBuilder {
	#client;

	/** @param {import('../../WAProto/index.js').WASocket} client Active Baileys socket (must expose `sendMessage`). */
	constructor(client) {
		super();
		if (!client) throw new Error('Socket is required');
		this.#client = client;

		this._name = '';
		this._values = [];
		this._selectableCount = 1;
		this._hideVoter = false;
		this._canAddOption = false;
		this._toAnnouncementGroup = false;
		this._correctAnswer = undefined;
		this._endDate = undefined;
		this._messageSecret = undefined;
	}

	/** WhatsApp caps a poll at 12 options. */
	static get MAX_OPTIONS() {
		return 12;
	}

	/** WhatsApp caps the poll question at 255 characters. */
	static get MAX_NAME_LENGTH() {
		return 255;
	}

	/** WhatsApp caps each option at 100 characters. */
	static get MAX_OPTION_LENGTH() {
		return 100;
	}

	/** Set the poll question/title. */
	setName(name) {
		if (typeof name !== 'string' || !name) throw new TypeError('setName(name) requires a non-empty string');
		if (name.length > Poll.MAX_NAME_LENGTH) {
			throw new RangeError(`setName(name) is limited to ${Poll.MAX_NAME_LENGTH} characters (got ${name.length})`);
		}
		this._name = name;
		return this;
	}

	/** Append one option. Chainable — call repeatedly, or use `addOptions()` for an array. */
	// JAP@Fix (§2.34 / v2.4.7): duplicate option names were accepted and shipped, but
	// getAggregateVotesInPollMessage() buckets votes by sha256(optionName) -- two options
	// with the same text collapse into ONE bucket, so a 3-option poll came back with 2
	// results and votes were attributed to the wrong option with no error anywhere.
	// Reject the duplicate at the point it's added instead.
	addOption(name) {
		if (typeof name !== 'string' || !name) throw new TypeError('addOption(name) requires a non-empty string');
		if (name.length > Poll.MAX_OPTION_LENGTH) {
			throw new RangeError(`addOption(name) is limited to ${Poll.MAX_OPTION_LENGTH} characters (got ${name.length})`);
		}
		if (this._values.includes(name)) {
			throw new Error(`addOption(name) duplicate option "${name}" -- poll votes are keyed by option text, so duplicates would merge into one result`);
		}
		if (this._values.length >= Poll.MAX_OPTIONS) {
			throw new RangeError(`addOption(name) exceeds the ${Poll.MAX_OPTIONS}-option limit WhatsApp enforces on polls`);
		}
		this._values.push(name);
		return this;
	}

	/** Replace every option at once (clears existing ones first). @param {string[]} names */
	setOptions(names) {
		if (!Array.isArray(names)) throw new TypeError('setOptions(names) requires an array of strings');
		const previous = this._values;
		this._values = [];
		try {
			names.forEach((name) => this.addOption(name));
		} catch (error) {
			this._values = previous;
			throw error;
		}
		return this;
	}

	/** Remove one option by exact text. @returns {this} */
	removeOption(name) {
		const index = this._values.indexOf(name);
		if (index !== -1) {
			this._values.splice(index, 1);
			if (this._correctAnswer === name) this._correctAnswer = undefined;
		}
		return this;
	}

	/** Drop every option (keeps name/flags). */
	clearOptions() {
		this._values = [];
		this._correctAnswer = undefined;
		return this;
	}

	/** @returns {string[]} A copy of the options added so far. */
	getOptions() {
		return [...this._values];
	}

	/** @returns {number} How many options have been added. */
	countOptions() {
		return this._values.length;
	}

	/** Append several options at once. @param {string[]} names */
	addOptions(names) {
		if (!Array.isArray(names) || !names.length) throw new TypeError('addOptions(names) requires a non-empty array of strings');
		names.forEach((name) => this.addOption(name));
		return this;
	}

	/** How many options a voter can pick (default 1). Use `setMultiSelect()` for unlimited. */
	setSelectable(count) {
		if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
			throw new TypeError('setSelectable(count) requires a non-negative integer');
		}
		this._selectableCount = count;
		return this;
	}

	/** Shortcut for unlimited-choice polls (`selectableCount: 0`). Pass `false` to revert to single-select. */
	setMultiSelect(canSelectMultiple = true) {
		this._selectableCount = canSelectMultiple ? 0 : 1;
		return this;
	}

	/** Hide voter names from other participants (where the client supports it). */
	setHideVoter(hide = true) {
		this._hideVoter = hide;
		return this;
	}

	/** Allow voters to add their own options. */
	setCanAddOption(allow = true) {
		this._canAddOption = allow;
		return this;
	}

	/** Mark this a community-announcement-group poll (pollCreationMessageV2 path). */
	setAnnouncementGroup(isAnnouncement = true) {
		this._toAnnouncementGroup = isAnnouncement;
		return this;
	}

	/** Auto-close the poll at this date/time. */
	// JAP@Fix (§2.33 / v2.4.7): any unparseable input (`setEndDate('tomorrow')`) became an
	// Invalid Date, whose getTime() is NaN -- messages.js then put `endTime: NaN` straight
	// on the wire, which encodes as garbage and gave no error on this end. Validate here.
	setEndDate(date) {
		const parsed = date instanceof Date ? date : new Date(date);
		if (Number.isNaN(parsed.getTime())) {
			throw new TypeError(`setEndDate(date) could not parse ${JSON.stringify(date)} into a valid Date`);
		}
		this._endDate = parsed;
		return this;
	}

	/** Pin the 32-byte poll messageSecret (otherwise the socket mints a random one). */
	setMessageSecret(secret) {
		if (!(secret instanceof Uint8Array) || secret.length !== 32) {
			throw new TypeError('setMessageSecret(secret) requires a 32-byte Uint8Array/Buffer');
		}
		this._messageSecret = secret;
		return this;
	}

	/**
	 * Turn this into a quiz: one option is marked correct. Delegates the actual hash/version
	 * wiring to the socket's own `sendMessage({poll:{...correctAnswer}})` handling — see class
	 * docblock for why this builder doesn't compute the hash itself.
	 * @param {string} correctOptionName Must exactly match one of the strings passed to `addOption()`/`addOptions()`.
	 */
	setQuiz(correctOptionName) {
		if (typeof correctOptionName !== 'string' || !correctOptionName) {
			throw new TypeError('setQuiz(correctOptionName) requires a non-empty string');
		}
		this._correctAnswer = correctOptionName;
		return this;
	}

	/**
	 * Collect every problem with the current state instead of throwing on the first one.
	 * @returns {string[]} Empty when the poll is safe to send.
	 */
	validate() {
		const problems = [];
		if (!this._name) problems.push('Poll requires a name (use setName())');
		if (this._values.length < 2) problems.push('Poll requires at least 2 options (use addOption()/addOptions())');
		if (this._values.length > Poll.MAX_OPTIONS) {
			problems.push(`Poll allows at most ${Poll.MAX_OPTIONS} options (got ${this._values.length})`);
		}
		if (new Set(this._values).size !== this._values.length) {
			problems.push('Poll options must be unique -- votes are keyed by option text');
		}
		if (this._selectableCount > this._values.length) {
			problems.push(`selectableCount must be <= the number of options (${this._selectableCount} > ${this._values.length})`);
		}
		if (this._correctAnswer && !this._values.includes(this._correctAnswer)) {
			problems.push('setQuiz(correctOptionName) must match one of the added options exactly');
		}
		// JAP@Fix (§2.32 / v2.4.7): quiz + announcement group was accepted silently. The
		// socket routes toAnnouncementGroup to pollCreationMessageV2, which carries NO
		// correctAnswer/pollType field -- the quiz was dropped on the floor and the poll went
		// out as an ordinary one, with no warning. Surface the incompatibility instead.
		if (this._correctAnswer && this._toAnnouncementGroup) {
			problems.push('setQuiz() cannot be combined with setAnnouncementGroup(): announcement-group polls use pollCreationMessageV2, which has no correctAnswer field, so quiz mode would be silently dropped');
		}
		if (this._endDate && Number.isNaN(this._endDate.getTime())) {
			problems.push('endDate is an Invalid Date');
		}
		return problems;
	}

	/** Throw on the first validation problem. @returns {this} */
	assertValid() {
		const [problem] = this.validate();
		if (problem) throw new Error(problem);
		return this;
	}

	/** @returns {{poll: Record<string, any>}} The `sendMessage()`-shaped poll payload, without sending it. */
	build() {
		this.assertValid();

		return {
			poll: {
				name: this._name,
				values: [...this._values],
				selectableCount: this._selectableCount,
				toAnnouncementGroup: this._toAnnouncementGroup,
				hideVoter: this._hideVoter,
				canAddOption: this._canAddOption,
				...(this._endDate && { endDate: this._endDate }),
				...(this._messageSecret && { messageSecret: this._messageSecret }),
				...(this._correctAnswer && { pollType: 1, correctAnswer: this._correctAnswer }),
			},
		};
	}

	/** Alias of `build()`, for symmetry with the other builders' debug helpers. */
	toJSON() {
		return this.build();
	}

	/** Build and send via the socket's `sendMessage()`. */
	async send(jid, options = {}) {
		return this.#client.sendMessage(jid, this.build(), options);
	}
}

/**
 * JAP@Add (v4.8) --- Chainable poll builder, wrapping the socket's own well-tested
 * `sendMessage({ poll })` path (see messages.js) instead of hand-building
 * pollCreationMessageV3/V5 over relayMessage. Two things seen in captured traffic were
 * deliberately NOT implemented here because they can't be built with confidence:
 *   1. Per-option poll images (`values: [{ name, image }]`) — the proto this fork ships
 *      only has a plain `optionName` string per option; an image-poll option isn't a named
 *      field anywhere in it. The one place an image-poll concept even appears
 *      (`pollCreationOptionImageMessage`) is typed as an opaque `FutureProofMessage` (a
 *      forward-compat envelope with no documented inner layout) — there's no field list to
 *      target, so adding "support" for it would just be silently dropping the image and
 *      guessing at a shape. Flagging instead of faking it.
 *   2. Quiz-mode `correctAnswer.optionHash` built by hand — the one working example captured had a 65-character hex string where a sha256 digest should be 64, and this
 *      builder's target `sendMessage({poll})` path (pollCreationMessageV5) already computes
 *      quiz mode correctly from a plain `correctAnswer` string, so `setQuiz()` below defers to
 *      that existing, already-tested logic rather than reimplementing the hash.
 */
export { Poll };
