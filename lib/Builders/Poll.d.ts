import type { BaseBuilder } from './shared.js';

/**
 * Chainable poll builder wrapping the socket's own `sendMessage({ poll })` path.
 * Per-option images and hand-built quiz hashes are deliberately NOT supported
 * (see the .js docblock) — quiz mode defers to the socket's tested logic.
 */
export class Poll extends BaseBuilder {
    constructor(client: any);
    /** WhatsApp caps a poll at 12 options. */
    static readonly MAX_OPTIONS: number;
    /** WhatsApp caps the poll question at 255 characters. */
    static readonly MAX_NAME_LENGTH: number;
    /** WhatsApp caps each option at 100 characters. */
    static readonly MAX_OPTION_LENGTH: number;
    setName(name: string): this;
    /** Rejects duplicates (votes are keyed by option text) and enforces MAX_OPTIONS. */
    addOption(name: string): this;
    addOptions(names: string[]): this;
    /** Replace every option at once; rolls back on error. */
    setOptions(names: string[]): this;
    /** Remove one option by exact text (clears the quiz answer if it pointed at it). */
    removeOption(name: string): this;
    /** Drop every option and the quiz answer. */
    clearOptions(): this;
    /** A copy of the options added so far. */
    getOptions(): string[];
    /** How many options have been added. */
    countOptions(): number;
    setSelectable(count: number): this;
    setMultiSelect(canSelectMultiple?: boolean): this;
    setHideVoter(hide?: boolean): this;
    setCanAddOption(allow?: boolean): this;
    setAnnouncementGroup(isAnnouncement?: boolean): this;
    /** Throws on an unparseable date instead of shipping `endTime: NaN`. */
    setEndDate(date: Date | string | number): this;
    /** Pin the 32-byte poll messageSecret (otherwise the socket mints a random one). */
    setMessageSecret(secret: Uint8Array): this;
    /** Quiz mode — must match one of the added options exactly. */
    setQuiz(correctOptionName: string): this;
    /** Every problem with the current state; empty when safe to send. */
    validate(): string[];
    /** Throw on the first validation problem. */
    assertValid(): this;
    /** Requires a name + at least 2 unique options; runs assertValid() first. */
    build(): { poll: Record<string, any> };
    /** Alias of `build()`. */
    toJSON(): { poll: Record<string, any> };
    /** Build and send via the socket's `sendMessage()`. */
    send(jid: string, options?: Record<string, any>): Promise<any>;
}
