export interface InteractiveValidationErrorOptions {
    context?: any;
    errors?: string[];
    warnings?: string[];
    example?: any;
}

/**
 * Thrown when button payload authoring validation fails.
 * Carries structured errors/warnings + a canonical example.
 */
export class InteractiveValidationError extends Error {
    constructor(message: string, options?: InteractiveValidationErrorOptions);
    context: any;
    errors: string[];
    warnings: string[];
    example: any;
    toJSON(): Record<string, any>;
    formatDetailed(): any;
}

export interface ButtonValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

export interface AuthoringValidationResult extends ButtonValidationResult {
    cleaned: any[];
}

/** Normalise legacy/upstream button shapes into native-flow `{ name, buttonParamsJson }`. */
export declare function buildInteractiveButtons(buttons?: any[]): any[];
/** Validate raw button objects before conversion. Permissive — only blocks clearly malformed input. */
export declare function validateAuthoringButtons(buttons: any): AuthoringValidationResult;
/** Strict validator for sendButtons() payload. */
export declare function validateSendButtonsPayload(data: any): ButtonValidationResult;
/** Strict validator for sendInteractiveMessage() authoring payload. */
export declare function validateSendInteractiveMessagePayload(data: any): ButtonValidationResult;
/** Validate already-converted interactiveMessage content (just before WAMessage creation). */
export declare function validateInteractiveMessageContent(content: any): ButtonValidationResult;
/** Convert the high-level authoring shape into the proto structure WAProto expects. */
export declare function convertToInteractiveMessage(content: any): any;
/** Low-level power function — validate, convert, build WAMessage, relay. */
export declare function sendInteractiveMessage(sock: any, jid: string, content: any, options?: Record<string, any>): Promise<any>;
/** Extended send variant with thumbnail / externalAdReply patching. */
export declare function sendInteractiveMessageV2(sock: any, jid: string, content: any, options?: Record<string, any>): Promise<any>;
/** Convenience wrapper for the common quick-reply / CTA button use case. */
export declare function sendButtons(sock: any, jid: string, data?: {
    text?: string;
    footer?: string;
    buttons?: any[];
    [key: string]: any;
}, options?: Record<string, any>): Promise<any>;
