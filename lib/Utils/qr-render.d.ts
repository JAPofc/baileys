/**
 * QR rendering utilities on top of the vendored qrcodegen engine.
 * @author J.AP
 */

/** Error-correction level; accepts short and long names, case-insensitive. */
export type QRECC = 'L' | 'M' | 'Q' | 'H' | 'LOW' | 'MEDIUM' | 'QUARTILE' | 'HIGH';

export interface QRMatrixOptions {
    /** Error-correction level (default 'M'). */
    ecc?: QRECC;
    /** Light border in modules on every side (default 2). */
    quietZone?: number;
}

export interface QRTerminalOptions extends QRMatrixOptions {
    /**
     * true (default): two module rows per text line using half-blocks (▀▄█),
     * half the height of classic full-block renderers.
     * false: double-width full blocks for terminals with poor unicode support.
     */
    small?: boolean;
    /** Flip light/dark for white-on-black terminals (default false). */
    inverted?: boolean;
}

export interface QRSVGOptions extends QRMatrixOptions {
    /** Dark module color (default '#000000'). */
    dark?: string;
    /** Background color (default '#ffffff'). */
    light?: string;
}

/** Encode `text` and return the module matrix (true = dark), quiet zone included. */
export declare const qrToMatrix: (text: string, options?: QRMatrixOptions) => boolean[][];

/** Render a QR as a multi-line terminal string. */
export declare const renderQRToTerminal: (text: string, options?: QRTerminalOptions) => string;

/** Render a QR as a standalone SVG string (viewBox in module units). */
export declare const qrToSVG: (text: string, options?: QRSVGOptions) => string;

/** "ABCDEFGH" -> "ABCD-EFGH" for display; leaves non-8-char codes untouched. */
export declare const formatPairingCode: (code: string | null | undefined) => string;
