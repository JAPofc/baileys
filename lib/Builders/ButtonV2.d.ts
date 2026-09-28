import type { BaseBuilder, RowBuilder } from './shared.js';

export interface ButtonV2BuildOptions {
    /** Default true — some clients need it to render legacy buttonsMessage. */
    viewOnce?: boolean;
    [key: string]: any;
}

/** Legacy `buttonsMessage` builder (quick-reply buttons + location-fallback header). */
export class ButtonV2 extends BaseBuilder {
    constructor(client: any);
    /** Add a simple quick-reply button. buttonId defaults to a random uuid. */
    addButton(displayText?: string, buttonId?: string): this;
    /** Push a raw pre-built button object. */
    addRawButton(obj: Record<string, any>): this;
    /** Header thumbnail (fallback location-header image). */
    setThumbnail(path: string | Buffer): this;
    /** Raw pre-built header media object. */
    setMedia(obj: Record<string, any>): this;
    /** Alias for addButton(). */
    button(displayText?: string, buttonId?: string): this;
    /** Group buttons via a RowBuilder callback. */
    row(cb: (row: RowBuilder) => void): this;
    /** Build the WAMessage without sending. */
    build(jid: string, options?: ButtonV2BuildOptions): Promise<any>;
    /** Build and send. Requires at least one button. */
    send(jid: string, options?: Record<string, any>): Promise<any>;
}
