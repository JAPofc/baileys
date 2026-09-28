import type { BaseBuilder } from './shared.js';

/**
 * Legacy `templateMessage` / `hydratedFourRowTemplate` builder — WA's Generation-1
 * button protocol (predates the nativeFlow format Button/ButtonV2 use). Capped at
 * 3 buttons (quickReply/url/call only), no interactive list/flow support.
 */
export class ButtonV3 extends BaseBuilder {
    constructor(client: any);
    /** Load an existing templateMessage (e.g. from a fetched/quoted message) for editing. */
    loadFrom(msg: Record<string, any>): this;
    setImage(path: string | Buffer, options?: Record<string, any>): this;
    setVideo(path: string | Buffer, options?: Record<string, any>): this;
    setDocument(path: string | Buffer, options?: Record<string, any>): this;
    setMedia(obj: Record<string, any>): this;
    clearButtons(): this;
    /** Max 3 buttons — throws past the limit. */
    addButton(hydratedButton: Record<string, any>): this;
    addReply(display_text?: string, id?: string): this;
    addUrl(display_text?: string, url?: string, options?: Record<string, any>): this;
    addCall(display_text?: string, phone_number?: string): this;
    toTemplate(): Promise<Record<string, any>>;
    build(jid: string, options?: Record<string, any>): Promise<Record<string, any>>;
    send(jid: string, options?: Record<string, any>): Promise<any>;
}
