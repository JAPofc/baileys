import type { BaseBuilder } from './shared.js';

/** One carousel card — typically built via `new Button(client).setImage(…).addUrl(…).toCard()`, but text/button-only cards are valid too. */
export interface CarouselCard {
    header?: {
        hasMediaAttachment?: boolean;
        title?: string;
        subtitle?: string;
        [key: string]: any;
    };
    body?: { text?: string; [key: string]: any };
    footer?: { text?: string; [key: string]: any };
    nativeFlowMessage?: { buttons?: any[]; messageParamsJson?: string; [key: string]: any };
    contextInfo?: any;
    text?: string;
    caption?: string;
    [key: string]: any;
}

export interface CarouselValidationResult {
    ok: boolean;
    errors: string[];
    warnings: string[];
}

export interface CarouselAssessResult {
    ok: boolean;
    reason: 'empty-card' | null;
}

export interface CarouselTextCardButton {
    name?: string;
    buttonParamsJson?: string;
    id?: string;
    reply?: string;
    text?: string;
    displayText?: string;
    display_text?: string;
    buttonText?: string;
    url?: string;
    merchant_url?: string;
    useWebview?: boolean;
    webview?: string | { url: string; inAppWebview?: boolean; in_app_webview?: boolean };
    openWebview?: string | { url: string; inAppWebview?: boolean; in_app_webview?: boolean };
    [key: string]: any;
}

export interface CarouselTextCardOptions {
    title?: string;
    subtitle?: string;
    body?: string;
    text?: string;
    footer?: string;
    buttons?: CarouselTextCardButton | CarouselTextCardButton[];
    params?: Record<string, any>;
    contextInfo?: any;
}

export interface CarouselOptions {
    carouselCardType?: any;
    messageVersion?: number;
}

/** Chainable carousel builder (max 10 cards — enforced, WA truncates beyond that). */
export class Carousel extends BaseBuilder {
    static MAX_CARDS: number;
    static assessCard(card: CarouselCard): CarouselAssessResult;
    static isValidCard(card: CarouselCard): boolean;
    constructor(client: any);
    /** Configure carousel-level proto metadata. Defaults: `{ carouselCardType: UNKNOWN, messageVersion: 1 }`. */
    setCarouselOptions(options?: CarouselOptions): this;
    /** Add one card, or an array of cards. Media, text-only, and button-only cards are accepted. */
    addCard(card: CarouselCard | CarouselCard[]): this;
    /** Add several prebuilt cards in one fluent call. */
    addCards(...cards: CarouselCard[]): this;
    /** Add a text/button-only card without manually constructing the proto-shaped card. */
    addTextCard(card?: CarouselTextCardOptions): this;
    clearCards(): this;
    countCards(): number;
    getCards(): CarouselCard[];
    validate(): CarouselValidationResult;
    assertValid(): this;
    /** Build the WAMessage without sending. Pass `{ validate: true }` to run assertValid() first. */
    build(jid: string, options?: Record<string, any> & { validate?: boolean }): any;
    /** Build and send. Validates by default; pass `{ validate:false }` only for low-level experiments. */
    send(jid: string, options?: Record<string, any> & { validate?: boolean }): Promise<any>;
}
