export declare const BUTTON_CAPABLE_PLATFORMS: string[];
export declare const BUTTON_UNRELIABLE_PLATFORMS: string[];
/** Can the account itself send buttons that will actually render? */
export declare function supportsInteractiveButtons(sock: any): {
    supported: boolean; platform: string | null; reason: string | null;
};
/** Which device sent this message, from its id. */
export declare function getMessageDevice(msg: any): 'ios' | 'android' | 'web' | 'desktop' | 'unknown';
/** Render interactive content as the plain text a non-rendering client can read. */
export declare function describeButtonsAsText(content: any, opts?: { header?: boolean; numbered?: boolean }): string;
/** Send interactive content, falling back to plain text when it would not render. */
export declare function sendInteractiveSafe(sock: any, jid: string, content: Record<string, any>, opts?: {
    fallback?: boolean; requireWebSupport?: boolean; [k: string]: any;
}): Promise<{ mode: 'interactive' | 'text'; reason: string | null; message: any }>;
