/**
 * JAP@Add --- Type declarations for the Meta AI helper (experimental).
 */
export declare const META_AI_USER: string;
export declare const META_AI_JIDS: string[];
/** True when the JID addresses Meta AI or any WhatsApp AI bot (`*@bot`). */
export declare const isMetaAIJid: (jid?: string) => boolean;
/** Extract text from a Meta AI web message, unwrapping streamed edits. */
export declare const extractMetaAIText: (webMessage: any) => string;

export interface AskMetaAIOptions {
    timeoutMs?: number;
    jid?: string;
    /** When > 0, wait for streamed edits to settle before resolving. */
    settleMs?: number;
    /** Called on every partial/edited chunk of the reply. */
    onUpdate?: (text: string, message: any) => void;
}
export interface AskMetaAIResult {
    sent: any;
    reply: any;
    text: string;
}
export declare const askMetaAI: (sock: any, prompt: string, opts?: AskMetaAIOptions) => Promise<AskMetaAIResult>;
