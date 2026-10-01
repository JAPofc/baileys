/**
 * JAP@Add --- Type declarations for the Mini App sender.
 */
export declare const MINI_APP_DEFAULT_BUTTON_TEXT: string;
export interface MiniAppFlowOptions {
    id: string;
    cta?: string;
    screen?: string;
    data?: any;
    action?: string;
    actionPayload?: any;
    version?: string;
    token?: string;
}
export interface MiniAppOptions {
    title?: string;
    body?: string;
    text?: string;
    url?: string;
    appUrl?: string;
    flow?: string | MiniAppFlowOptions;
    params?: Record<string, string | number | boolean>;
    /** HMAC-SHA256 key; when set, the opener URL's params are signed (tamper-proof). */
    secret?: string;
    /** Opener-URL lifetime in seconds; signs an `exp` the web app can enforce. */
    expiresIn?: number;
    buttonText?: string;
    buttons?: any[];
    footer?: string;
    thumbnail?: Buffer | string;
    /** Toggle cta_url's (WA-ignored) `webview_interaction` flag. Default true. Kept for backward compatibility — for a REAL in-app webview use `openWebview`. */
    useWebview?: boolean;
    /** Emit a real native in-app webview button (`open_webview`) instead of `cta_url`. Default false (cta_url renders on regular accounts; open_webview needs the in-app-webview capability). */
    openWebview?: boolean;
    onThumbnailError?: (err: any) => void;
    /** Remote thumbnail fetch timeout (default 10s). */
    thumbnailTimeoutMs?: number;
    /** Remote thumbnail byte cap (default 512 KiB). */
    thumbnailMaxBytes?: number;
    /** Allow localhost/private-IP thumbnail URLs. Off by default to reduce SSRF risk. */
    allowPrivateThumbnail?: boolean;
    thumbnailHeaders?: any;
    dispatcher?: any;
    fetchImpl?: typeof fetch;
    [key: string]: any;
}
/** A parsed mini-app / WhatsApp Flow in-chat submission. */
export interface MiniAppResponse {
    name?: string;
    version?: number;
    params: Record<string, any>;
    flowToken?: string;
    body?: string;
}
export declare const buildMiniAppContent: (opts?: MiniAppOptions) => Promise<any>;
export declare const sendMiniApp: (sock: any, jid: any, miniApp: MiniAppOptions, options?: any) => Promise<any>;
/** Single-use nonce store for one-time mini-app / webview links. */
export interface NonceStore {
    /** Mint a fresh nonce to embed in a signed link (via createMiniAppLink's `nonce`). */
    issue(size?: number): string;
    /** Returns true exactly once per issued nonce; false for unknown/used/expired. */
    consume(nonce: string): boolean;
    has(nonce: string): boolean;
    clear(): void;
    readonly size: number;
}
export declare const createNonceStore: (opts?: { ttlMs?: number; max?: number; now?: () => number }) => NonceStore;
export interface MiniAppLinkOptions {
    secret?: string;
    expiresIn?: number;
    /** Bind the link to one opener (e.g. recipient JID); rejected for anyone else. */
    audience?: string | number;
    /** One-time token to embed (pair with a NonceStore on the verify side). */
    nonce?: string;
    now?: () => number;
}
export interface MiniAppVerifyOptions {
    secret?: string;
    now?: () => number;
    /** Require the link's `aud` to equal this value (403 on mismatch). */
    audience?: string | number;
    /** Consume a one-time nonce; 403 on unknown/used/expired. */
    nonceStore?: NonceStore;
}
export declare const createMiniAppLink: (baseUrl: string, params?: Record<string, string | number | boolean>, opts?: MiniAppLinkOptions) => string;
export declare const parseMiniAppParams: (link: string, opts?: MiniAppVerifyOptions) => Record<string, string>;
/** Verify a mini-app request (URL, query string, or params object) server-side. */
export declare const verifyMiniAppRequest: (input: string | Record<string, any>, opts?: MiniAppVerifyOptions) => Record<string, string>;
/** Read a WhatsApp Flow / mini-app submission from an incoming message (null if not one). */
export declare const parseMiniAppResponse: (message: any) => MiniAppResponse | null;
export declare const buildFlowDataExchange: (action: string, data?: any, opts?: { version?: string; token?: string }) => any;
/** Build a WhatsApp Flows `navigate` action payload targeting a screen. */
export declare const buildFlowNavigate: (screen: string, data?: any, opts?: { version?: string; token?: string }) => any;
