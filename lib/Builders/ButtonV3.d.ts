import type { BaseBuilder } from './shared.js';

export interface ButtonV3ValidationResult {
    ok: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * Legacy `templateMessage` / `hydratedFourRowTemplate` builder — WA's Generation-1
 * button protocol (predates the nativeFlow format Button/ButtonV2 use). Capped at
 * 3 buttons (quickReply/url/call only), no interactive list/flow support.
 */
export class ButtonV3 extends BaseBuilder {
    static MAX_BUTTONS: number;
    constructor(client: any);
    /** Load an existing templateMessage (e.g. from a fetched/quoted message) for editing. */
    loadFrom(msg: Record<string, any>): this;
    setImage(path: string | Buffer, options?: Record<string, any>): this;
    setVideo(path: string | Buffer, options?: Record<string, any>): this;
    setDocument(path: string | Buffer, options?: Record<string, any>): this;
    setMedia(obj: Record<string, any>): this;
    clearButtons(): this;
    getButtons(): Record<string, any>[];
    countButtons(): number;
    /** Max 3 buttons — throws past the limit. */
    addButton(hydratedButton: Record<string, any>): this;
    addReply(display_text: string, id: string): this;
    addUrl(display_text: string, url: string, options?: Record<string, any>): this;
    addCall(display_text: string, phone_number: string): this;
    validate(): ButtonV3ValidationResult;
    assertValid(): this;
    toTemplate(): Promise<Record<string, any>>;
    build(jid: string, options?: Record<string, any> & { validate?: boolean }): Promise<Record<string, any>>;
    /** Build and send. Validates by default; pass `{ validate:false }` for low-level experiments. */
    send(jid: string, options?: Record<string, any> & { validate?: boolean; additionalNodes?: any[] }): Promise<any>;
}
