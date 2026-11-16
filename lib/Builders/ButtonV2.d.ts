import type { BaseBuilder, RowBuilder } from './shared.js';

export interface ButtonV2BuildOptions {
    /** Default true — some clients need it to render legacy buttonsMessage. */
    viewOnce?: boolean;
    /** Run assertValid() before building. send() validates by default. */
    validate?: boolean;
    [key: string]: any;
}

export interface ButtonV2ValidationResult {
    ok: boolean;
    errors: string[];
    warnings: string[];
}

/** Legacy `buttonsMessage` builder (quick-reply buttons + location-fallback header). */
export class ButtonV2 extends BaseBuilder {
    static MAX_BUTTONS: number;
    constructor(client: any);
    /** Add a simple quick-reply button. buttonId defaults to a random uuid. */
    addButton(displayText?: string, buttonId?: string): this;
    /** Push a raw pre-built button object. */
    addRawButton(obj: Record<string, any>): this;
    /** Header thumbnail (fallback location-header image). */
    setThumbnail(path: string | Buffer): this;
    /** Raw pre-built header media object. */
    setMedia(obj: Record<string, any>): this;
    clearButtons(): this;
    getButtons(): Record<string, any>[];
    countButtons(): number;
    /** Alias for addButton(). */
    button(displayText?: string, buttonId?: string): this;
    /** Group buttons via a RowBuilder callback. */
    row(cb: (row: RowBuilder) => void): this;
    /** Pre-flight validation for legacy buttonsMessage. */
    validate(): ButtonV2ValidationResult;
    assertValid(): this;
    /** Build the WAMessage without sending. */
    build(jid: string, options?: ButtonV2BuildOptions): Promise<any>;
    /** Build and send. Validates by default; pass `{ validate:false }` for low-level experiments. */
    send(jid: string, options?: Record<string, any> & { validate?: boolean }): Promise<any>;
}
