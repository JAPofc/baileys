/** Status tools — auto-styling + normalization for status broadcasts. */

/** Random '#rrggbb'. */
export declare const randomStatusColor: (options?: { random?: () => number }) => string;
/** Random WhatsApp status font id (0-8). */
export declare const randomStatusFont: (options?: { random?: () => number }) => number;

/**
 * Normalize status content and derive style options:
 * text → random font/colors (unless provided); image/video → text becomes
 * caption, style fields dropped; audio → ptt defaults true, bg kept.
 */
export declare const prepareStatusContent: (
	content: Record<string, unknown>,
	options?: { random?: () => number; autoStyle?: boolean }
) => {
	content: Record<string, unknown>;
	styleOptions: { font?: number; textColor?: string; backgroundColor?: string; ptt?: boolean };
};
