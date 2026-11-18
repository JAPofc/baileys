export declare const HTML_MIME_TYPE: 'text/html';
export declare const HTML_APP_MAX_BYTES: number;
export declare const HTML_APP_WARN_BYTES: number;
export declare const HTML_APP_DEFAULT_FILENAME: string;
export declare const HTML_APP_MULTIPLAYER_GLOBAL: string;

export interface HtmlAppReport {
    ok: boolean; bytes: number; errors: string[]; warnings: string[];
    hasScript: boolean; externalRefs: string[]; sha256: string;
}
/** Validate a bundle before sending (errors = will not render, warnings = will render badly). */
export declare function checkHtmlApp(html: string | Buffer, opts?: {
    maxBytes?: number; warnBytes?: number; allowExternal?: boolean;
}): HtmlAppReport;
/** Normalise any file-ish payload into document content + metadata. */
export declare function prepareFileArtifact(input: string | Buffer | Uint8Array | { data: Buffer; fileName?: string; mimetype?: string }, opts?: {
    fileName?: string; mimetype?: string; caption?: string;
}): { fileName: string; mimetype: string; fileLength: number; sha256: string; caption?: string; document: Buffer };
export interface MultiplayerSession {
    sessionId: string; participants: string[]; host?: string; maxPlayers?: number; startedAt: number;
}
/** The frozen session descriptor script. */
export declare function htmlMultiplayerPrelude(opts?: {
    sessionId?: string; participants?: string | string[]; host?: string; maxPlayers?: number; startedAt?: number;
}): { sessionId: string; session: MultiplayerSession; script: string };
/** Inject (or replace) the multiplayer preamble in a bundle. */
export declare function withHtmlMultiplayer(html: string | Buffer, opts?: Parameters<typeof htmlMultiplayerPrelude>[0]): {
    sessionId: string; session: MultiplayerSession; script: string; html: string;
};
/** Send a bundle as a document — works on any account, no hosting. */
export declare function sendHtmlDocument(sock: any, jid: string, html: string | Buffer, opts?: {
    fileName?: string; caption?: string; validate?: boolean; [k: string]: any;
}): Promise<any>;
/** Send any file as an artifact card. */
export declare function sendHtmlArtifact(sock: any, jid: string, input: Parameters<typeof prepareFileArtifact>[0], opts?: {
    title?: string; description?: string; fileName?: string; mimetype?: string; [k: string]: any;
}): Promise<any>;
/** Send an HTML app: webview card with a `url`, document fallback without one. */
export declare function sendHtmlApp(sock: any, jid: string, html?: string | Buffer | null, opts?: {
    url?: string; title?: string; body?: string; footer?: string; buttonText?: string;
    thumbnail?: any; fallback?: boolean; validate?: boolean; fileName?: string; [k: string]: any;
}): Promise<{ mode: 'webview' | 'document'; message: any }>;
/** A titled HTML block for a rich card. */
export declare function htmlSection(title: string, html: string | Buffer, opts?: { id?: string; collapsed?: boolean }): {
    htmlSection: { id?: string; title: string; collapsed: boolean; html: string; bytes: number; sha256: string };
};
/** Inline media as a data URI an HTML app can use directly. */
export declare function htmlMedia(data: Buffer | Uint8Array, opts?: { mimetype?: string; name?: string }): {
    name?: string; mimetype: string; bytes: number; dataUri: string; img: string;
};
