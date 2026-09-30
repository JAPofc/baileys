import type { BaseBuilder } from './shared.js';

/**
 * Chainable poll builder wrapping the socket's own `sendMessage({ poll })` path.
 * Per-option images and hand-built quiz hashes are deliberately NOT supported
 * (see the .js docblock) — quiz mode defers to the socket's tested logic.
 */
export class Poll extends BaseBuilder {
    constructor(client: any);
    setName(name: string): this;
    addOption(name: string): this;
    addOptions(names: string[]): this;
    setSelectable(count: number): this;
    setMultiSelect(canSelectMultiple?: boolean): this;
    setHideVoter(hide?: boolean): this;
    setCanAddOption(allow?: boolean): this;
    setAnnouncementGroup(isAnnouncement?: boolean): this;
    setEndDate(date: Date | string | number): this;
    /** Quiz mode — must match one of the added options exactly. */
    setQuiz(correctOptionName: string): this;
    /** Requires a name + at least 2 options. */
    build(): { poll: Record<string, any> };
    /** Build and send via the socket's `sendMessage()`. */
    send(jid: string, options?: Record<string, any>): Promise<any>;
}
