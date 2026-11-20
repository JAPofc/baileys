export declare const AIRICH_COMPAT_MODES: readonly ['rich', 'plain', 'interactive', 'auto'];

export interface PlainAIRichButton {
    name?: string;
    display_text?: string;
    id?: string;
    url?: string;
}

export interface BuildPlainAIRichOptions {
    mode?: 'plain' | 'interactive';
    buttons?: PlainAIRichButton[];
    footer?: string;
    contextInfo?: any;
}

/** Flatten resolved AIRich sections into WhatsApp-formatted text (*bold*, ```code```, links). */
export declare function renderAIRichSectionsAsText(sections?: any[], opts?: { title?: string; footer?: string }): string;

/** Wrap flattened card text into an extendedText or interactive (nativeFlow) message content. */
export declare function buildPlainAIRichContent(text: string, opts?: BuildPlainAIRichOptions): any;

/** Decide how a card should be delivered for the destination platform. */
export declare function resolveAIRichCompatMode(
    mode?: 'rich' | 'plain' | 'interactive' | 'auto',
    hints?: { hasButtons?: boolean; supportsInteractive?: boolean }
): { mode: 'rich' | 'plain' | 'interactive'; reason: string };
