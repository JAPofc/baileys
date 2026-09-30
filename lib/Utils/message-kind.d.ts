/** Companion "addon kind" for list / native-flow style messages. */
export type WaButtonAddonKind = 'list' | 'interactive' | 'payment_info' | 'order_details';

/**
 * Resolves which kind of button/list addon an outgoing message carries.
 * Returns null if the message has no button/list/native-flow content.
 */
export declare const resolveButtonAddonKind: (message: any) => WaButtonAddonKind | null;

export type InteractiveReplyKind =
    | 'buttons_response'
    | 'list_response'
    | 'native_flow_response'
    | 'template_button_reply'
    | null;

/** Normalized shape returned by parseInteractiveReply. */
export interface NormalizedInteractiveReply {
    kind: InteractiveReplyKind;
    /** The button/row/native-flow id the user selected. */
    id: string | null;
    /** Visible text of the selection, if present. */
    displayText: string | null;
    /** Parsed paramsJson for native-flow responses, or null. */
    params: Record<string, any> | null;
}

/**
 * Reads whatever a user tapped (button, list row, or native-flow reply) and
 * returns one consistent shape. Safe against malformed paramsJson.
 */
export declare const parseInteractiveReply: (message: any) => NormalizedInteractiveReply;
