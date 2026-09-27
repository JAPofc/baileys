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
	| 'smallcaps';

/** Wrap text in a box (double/single/round borders). */
export declare const boxText: (text: string, options?: { style?: 'double' | 'single' | 'round' }) => string;

/** Names accepted by styleText(). */
export declare const listTextStyles: () => TextStyle[];

/** Restyle a string; characters without a variant pass through unchanged. */
export declare const styleText: (text: string, style: TextStyle) => string;
