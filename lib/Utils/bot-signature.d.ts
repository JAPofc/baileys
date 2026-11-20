import type { KeyObject } from 'crypto';

export declare const BOT_SIGNATURE_ALGO: string;
export declare const BOT_SIGNATURE_LENGTH: number;
export declare const BOT_SIGNATURE_PREFIX: string;
export declare const BOT_SIGNATURE_USE_CASE: { UNKNOWN: 0; BOT_MESSAGE: 1; BOT_PROFILE: 2 };

/** Structural DER check on a certificate chain (no crypto). */
export declare function isParsableCertificateChain(chain: any): boolean;
/** The exact bytes a bot proof signs. */
export declare function constructSignaturePayload(opts: {
    payload?: any; certificateChain: any; useCase?: number; version?: number;
}): Buffer;
/** Load a trust root (PEM, DER/SPKI, or an existing KeyObject). */
export declare function loadBotSignatureRoot(material: string | Buffer | Uint8Array | KeyObject | { key: string | Buffer }): KeyObject;

export interface BotSignatureResult {
    verified: boolean;
    reason: string | null;
    useCase?: number;
    version?: number;
    chainLength: number;
}
/** Verify the bot proof on a message (never reports `verified` without a trust root). */
export declare function verifyBotSignature(message: any, opts?: {
    root?: string | Buffer | Uint8Array | KeyObject; payload?: any; proofIndex?: number;
}): BotSignatureResult;
/** Read a rich response only if its proof checks out (`rich` is null otherwise). */
export declare function readSignedRichResponse(message: any, opts?: {
    root?: string | Buffer | Uint8Array | KeyObject; payload?: any; proofIndex?: number;
}): BotSignatureResult & { rich: any | null };
/** Boolean shorthand over verifyBotSignature(). */
export declare function verifyRichResponseSignature(message: any, opts?: Record<string, any>): boolean;
