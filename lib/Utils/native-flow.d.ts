export declare const NATIVE_FLOW_NAMES: string[];
export declare const NATIVE_FLOW_BUTTON_LIMIT: number;
export declare const NATIVE_FLOW_ROW_LIMIT: number;
export declare const WEB_SUPPORTED_FLOW_NAMES: string[];
/** Is this a name the live (refreshable) table accepts? */
export declare function isKnownFlowName(name: string): boolean;
/** Will WhatsApp Web draw this button? */
export declare function isWebSupportedButtonName(name: string): boolean;
/** Work out the native-flow name for a loosely-specified button. */
export declare function getNativeFlowNameByButtonName(button: string | Record<string, any>): string | null;
/** Check buttons before they go on the wire. */
export declare function checkNativeFlowButtons(buttons: any, opts?: {
    limit?: number; requireWebSupport?: boolean;
}): { ok: boolean; errors: string[]; warnings: string[] };
/** Normalise buttons into `{ name, buttonParamsJson }` (throws, naming the offender). */
export declare function validateAndNormalizeButtons(buttons: any, opts?: {
    limit?: number; requireWebSupport?: boolean;
}): { name: string; buttonParamsJson: string }[];
/** Normalise list sections/rows (accepts a flat row array too). */
export declare function validateAndNormalizeSections(sections: any, opts?: { rowLimit?: number }): {
    title: string; rows: { title: string; description?: string; id: string }[];
}[];
