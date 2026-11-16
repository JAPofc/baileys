/** Fancy text — Unicode restyling for bot menus (bold, monospace, circled…). */

export type TextStyle =
	| 'bold'
	| 'italic'
	| 'boldItalic'
	| 'serifBold'
	| 'script'
	| 'fraktur'
	| 'doubleStruck'
	| 'monospace'
	| 'circled'
	| 'squared'
	| 'negativeSquared'
	| 'boldFraktur'
	| 'fullwidth'
	| 'smallcaps'
	| 'upsideDown';

/** Wrap text in a box (double/single/round borders). */
export declare const boxText: (text: string, options?: { style?: 'double' | 'single' | 'round' }) => string;

/** Names accepted by styleText(). */
export declare const listTextStyles: () => TextStyle[];

/** Restyle a string; characters without a variant pass through unchanged. */
export declare const styleText: (text: string, style: TextStyle) => string;

/**
 * Inverse of styleText: map styled Unicode letters/digits back to plain ASCII
 * (small-caps normalize to lowercase; upside-down text is not reversed).
 * Unknown characters pass through unchanged.
 */
export declare const unstyleText: (text: string) => string;
