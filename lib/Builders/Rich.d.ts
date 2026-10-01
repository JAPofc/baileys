import type { AIRich, AIRichBuildOptions, AIRichSendOptions } from './AIRich.js';

export interface RichOneLinerCode {
    language?: string;
    lang?: string;
    code?: string;
    text?: string;
}

export interface RichOneLinerProgress {
    label?: string;
    title?: string;
    value?: number;
    max?: number;
    total?: number;
    options?: Record<string, any>;
    [key: string]: any;
}

export interface RichOneLinerMedia {
    url?: string;
    src?: string;
    imageUrl?: string;
    videoUrl?: string;
    options?: Record<string, any>;
    [key: string]: any;
}

export interface RichOneLinerInput {
    title?: string;
    subtitle?: string;
    footer?: string;
    contextInfo?: Record<string, any>;
    payload?: Record<string, any>;
    markdown?: string;
    md?: string;
    heading?: string;
    text?: string;
    body?: string;
    code?: string | RichOneLinerCode | Array<string | RichOneLinerCode>;
    table?: string[][];
    links?: Record<string, any> | Record<string, any>[];
    sources?: Record<string, any> | Record<string, any>[];
    image?: string | RichOneLinerMedia | Array<string | RichOneLinerMedia>;
    inlineImage?: string | RichOneLinerMedia | Array<string | RichOneLinerMedia>;
    video?: string | RichOneLinerMedia | Array<string | RichOneLinerMedia>;
    compact?: Record<string, any> | Record<string, any>[];
    profile?: Record<string, any> | Record<string, any>[];
    checklist?: string | Array<string | { text: string; done?: boolean }>;
    keyValue?: Record<string, unknown> | Array<[string, unknown]>;
    keyValues?: Record<string, unknown> | Array<[string, unknown]>;
    progress?: RichOneLinerProgress | RichOneLinerProgress[];
    tip?: string | string[];
    metadata?: string | string[];
    divider?: boolean;
    spacer?: boolean | number;
    actions?: { text: string; url: string; type?: string } | Array<{ text: string; url: string; type?: string }>;
    footerActions?: { text: string; url: string; type?: string } | Array<{ text: string; url: string; type?: string }>;
    suggestions?: string | Array<string | { text?: string; prompt?: string; prompt_text?: string }>;
    suggested?: string | Array<string | { text?: string; prompt?: string; prompt_text?: string }>;
    primitives?: string | Record<string, any> | Array<string | Record<string, any>>;
    viewModels?: Record<string, any> | Record<string, any>[];
    [key: string]: any;
}

export type RichOneLiner = string | RichOneLinerInput;

/** Build an AIRich instance in one call; keep chaining or call .send(jid). */
export declare function createRich(client: any, input?: RichOneLiner): AIRich;
/** JAP-branded preferred alias for createRich(). */
export declare const createJapRich: typeof createRich;
/** JAP-branded preferred alias for createRich(). */
export declare const japRich: typeof createRich;
/** Short JAP-branded alias: `jap(sock, '# Hello').send(jid)`. */
export declare const jap: typeof createRich;
/** Alias for createRich(): `Rich(sock, '# Hello').send(jid)`. */
export declare const Rich: typeof createRich;
/** Build rich-message content from a one-liner input without sending. */
export declare function buildRich(client: any, input?: RichOneLiner, options?: AIRichBuildOptions): Promise<Record<string, any>>;
/** JAP-branded alias for buildRich(). */
export declare function buildJapRich(client: any, input?: RichOneLiner, options?: AIRichBuildOptions): Promise<Record<string, any>>;
/** Send a rich-message one-liner. */
export declare function sendRich(client: any, jid: string, input?: RichOneLiner, options?: AIRichSendOptions): Promise<any>;
/** JAP-branded alias for sendRich(). */
export declare function sendJapRich(client: any, jid: string, input?: RichOneLiner, options?: AIRichSendOptions): Promise<any>;
