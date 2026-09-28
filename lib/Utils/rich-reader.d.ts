/** One parsed block of a rich-response card. */
export interface RichBlock {
    type: 'heading' | 'text' | 'code' | 'table' | 'latex' | 'divider' | 'spacer' | 'suggestion' | 'image' | 'sources' | 'unknown';
    /** heading/text/suggestion */
    text?: string;
    /** text: resolved inline entities (links etc.) */
    entities?: Array<{ key: string; label: string; url?: string; typename?: string; raw: any }>;
    /** code */
    language?: string;
    code?: string;
    /** table */
    rows?: string[][];
    headerRows?: number[];
    title?: string;
    /** latex */
    expression?: string;
    /** suggestion */
    promptType?: string;
    /** unknown/image/sources passthrough */
    typename?: string;
    messageType?: number;
    raw?: any;
    [key: string]: any;
}

/** Result of readRichMessage(). `found: false` means the input is not a rich response. */
export interface ReadRichMessageResult {
    found: boolean;
    /** unified response_id (when present) */
    responseId?: string;
    /** messageContextInfo.botMetadata.botResponseId (when present) */
    botResponseId?: string;
    blocks: RichBlock[];
    /** convenience: texts of every suggestion pill */
    suggestions: string[];
    /** flat text rendering of the whole card (headings, text, fenced code, tables) */
    text: string;
    raw?: { rich: any; unified: any; botMetadata: any };
}

/**
 * Parse a received AI rich-response message (Meta AI style card) into plain
 * structured blocks — the reader counterpart to the AIRich builder. Accepts a
 * full WebMessageInfo, a message content object, or `AIRich.build()` output.
 * Never throws.
 */
export function readRichMessage(msg: any): ReadRichMessageResult;
