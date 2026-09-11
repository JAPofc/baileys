/**
 * Vendored Project Nayuki QR Code generator (MIT).
 * Upstream: https://github.com/nayuki/QR-Code-generator
 * Declarations mirror the upstream public API used by jap-baileys.
 */

export declare class QrCode {
    static encodeText(text: string, ecl: QrCode.Ecc): QrCode;
    static encodeBinary(data: Readonly<Array<number>>, ecl: QrCode.Ecc): QrCode;
    static encodeSegments(
        segs: Readonly<Array<QrSegment>>,
        ecl: QrCode.Ecc,
        minVersion?: number,
        maxVersion?: number,
        mask?: number,
        boostEcl?: boolean,
    ): QrCode;

    static readonly MIN_VERSION: number;
    static readonly MAX_VERSION: number;

    readonly version: number;
    readonly size: number;
    readonly errorCorrectionLevel: QrCode.Ecc;
    readonly mask: number;

    constructor(
        version: number,
        errorCorrectionLevel: QrCode.Ecc,
        dataCodewords: Readonly<Array<number>>,
        msk: number,
    );

    /** true = dark module; coordinates outside the grid return false. */
    getModule(x: number, y: number): boolean;
}

export declare namespace QrCode {
    class Ecc {
        static readonly LOW: Ecc;
        static readonly MEDIUM: Ecc;
        static readonly QUARTILE: Ecc;
        static readonly HIGH: Ecc;
        readonly ordinal: number;
        readonly formatBits: number;
    }
}

export declare class QrSegment {
    static makeBytes(data: Readonly<Array<number>>): QrSegment;
    static makeNumeric(digits: string): QrSegment;
    static makeAlphanumeric(text: string): QrSegment;
    static makeSegments(text: string): Array<QrSegment>;
    static makeEci(assignVal: number): QrSegment;

    readonly mode: QrSegment.Mode;
    readonly numChars: number;

    constructor(mode: QrSegment.Mode, numChars: number, bitData: Readonly<Array<number>>);
    getData(): Array<number>;
}

export declare namespace QrSegment {
    class Mode {
        static readonly NUMERIC: Mode;
        static readonly ALPHANUMERIC: Mode;
        static readonly BYTE: Mode;
        static readonly KANJI: Mode;
        static readonly ECI: Mode;
        readonly modeBits: number;
        numCharCountBits(ver: number): number;
    }
}

declare const qrcodegen: {
    QrCode: typeof QrCode;
    QrSegment: typeof QrSegment;
};
export default qrcodegen;
