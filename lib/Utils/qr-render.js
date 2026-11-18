/**
 * QR rendering utilities on top of the vendored qrcodegen engine.
 * Zero external dependencies.
 *
 * - qrToMatrix(text)            -> boolean[][] (true = dark module)
 * - renderQRToTerminal(text)    -> string using ANSI half-blocks (▀▄█), half the
 *                                  height of classic full-block renderers so WA
 *                                  QRs fit in small terminals; `small: false`
 *                                  switches to double-width full blocks for
 *                                  terminals with poor unicode support.
 * - qrToSVG(text)               -> standalone SVG string (crisp at any size)
 * - formatPairingCode(code)     -> "ABCD-EFGH" display form
 *
 * @author J.AP
 */
import { deflateSync } from 'zlib';
import { QrCode } from './qrcodegen.js';

const DEFAULT_QUIET_ZONE = 2;

const eccFromName = (name) => {
    switch (String(name ?? 'M').toUpperCase()) {
        case 'L': case 'LOW': return QrCode.Ecc.LOW;
        case 'Q': case 'QUARTILE': return QrCode.Ecc.QUARTILE;
        case 'H': case 'HIGH': return QrCode.Ecc.HIGH;
        case 'M': case 'MEDIUM':
        default: return QrCode.Ecc.MEDIUM;
    }
};

/** Encode `text` and return the module matrix (true = dark), quiet zone included. */
export const qrToMatrix = (text, { ecc = 'M', quietZone = DEFAULT_QUIET_ZONE } = {}) => {
    if (typeof text !== 'string' || text.length === 0) {
        throw new Error('qrToMatrix: text must be a non-empty string');
    }
    const qz = Math.max(0, quietZone | 0);
    const qr = QrCode.encodeText(text, eccFromName(ecc));
    const size = qr.size + qz * 2;
    const rows = [];
    for (let y = 0; y < size; y += 1) {
        const row = new Array(size);
        for (let x = 0; x < size; x += 1) {
            row[x] = qr.getModule(x - qz, y - qz);
        }
        rows.push(row);
    }
    return rows;
};

const HALF = { both: '█', top: '▀', bottom: '▄', neither: ' ' };
const HALF_INVERTED = { both: ' ', top: '▄', bottom: '▀', neither: '█' };

/**
 * Render a QR as a terminal string.
 * `small: true` (default) packs two module rows per text line via half-blocks.
 * `inverted: true` flips light/dark for white-on-black terminals where the
 * default reads poorly (WhatsApp scans both polarities, but quiet zone must
 * contrast; keep `inverted: false` unless you know your terminal).
 */
export const renderQRToTerminal = (text, { small = true, inverted = false, ecc = 'M', quietZone = DEFAULT_QUIET_ZONE } = {}) => {
    const matrix = qrToMatrix(text, { ecc, quietZone });
    const size = matrix.length;
    const lines = [];
    if (small) {
        const glyphs = inverted ? HALF_INVERTED : HALF;
        for (let y = 0; y < size; y += 2) {
            let line = '';
            for (let x = 0; x < size; x += 1) {
                const top = matrix[y][x];
                const bottom = y + 1 < size ? matrix[y + 1][x] : false;
                line += top && bottom ? glyphs.both : top ? glyphs.top : bottom ? glyphs.bottom : glyphs.neither;
            }
            lines.push(line);
        }
    }
    else {
        const dark = inverted ? '  ' : '██';
        const light = inverted ? '██' : '  ';
        for (let y = 0; y < size; y += 1) {
            let line = '';
            for (let x = 0; x < size; x += 1) {
                line += matrix[y][x] ? dark : light;
            }
            lines.push(line);
        }
    }
    return lines.join('\n');
};

/** Render a QR as a standalone SVG string (viewBox in module units). */
export const qrToSVG = (text, { ecc = 'M', quietZone = DEFAULT_QUIET_ZONE, dark = '#000000', light = '#ffffff' } = {}) => {
    const matrix = qrToMatrix(text, { ecc, quietZone });
    const size = matrix.length;
    const parts = [];
    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            if (matrix[y][x]) {
                parts.push(`M${x},${y}h1v1h-1z`);
            }
        }
    }
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">`,
        `<rect width="100%" height="100%" fill="${light}"/>`,
        `<path d="${parts.join('')}" fill="${dark}"/>`,
        '</svg>',
    ].join('');
};

// ---- minimal PNG encoder (grayscale 8-bit, filter 0) on Node's zlib ----
const CRC_TABLE = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
        let c = n;
        for (let k = 0; k < 8; k += 1) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        t[n] = c;
    }
    return t;
})();

const crc32 = (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i += 1) {
        c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
};

const pngChunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'latin1');
    data.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
};

/**
 * Render a QR as a PNG Buffer (grayscale, zero external dependencies —
 * hand-rolled encoder on Node's zlib). `scale` is pixels per module.
 */
export const qrToPNG = (text, { ecc = 'M', quietZone = DEFAULT_QUIET_ZONE, scale = 8, dark = 0, light = 255 } = {}) => {
    const matrix = qrToMatrix(text, { ecc, quietZone });
    const px = Math.max(1, scale | 0);
    const size = matrix.length * px;
    // each scanline: 1 filter byte (0 = None) + `size` grayscale bytes
    const raw = Buffer.alloc(size * (size + 1));
    for (let y = 0; y < size; y += 1) {
        const rowStart = y * (size + 1);
        raw[rowStart] = 0;
        const mRow = matrix[(y / px) | 0];
        for (let x = 0; x < size; x += 1) {
            raw[rowStart + 1 + x] = mRow[(x / px) | 0] ? dark : light;
        }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0); // width
    ihdr.writeUInt32BE(size, 4); // height
    ihdr[8] = 8; // bit depth
    ihdr[9] = 0; // color type: grayscale
    ihdr[10] = 0; // compression
    ihdr[11] = 0; // filter
    ihdr[12] = 0; // interlace
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        pngChunk('IHDR', ihdr),
        pngChunk('IDAT', deflateSync(raw, { level: 9 })),
        pngChunk('IEND', Buffer.alloc(0)),
    ]);
};

/** "ABCDEFGH" -> "ABCD-EFGH" for display; leaves non-8-char codes untouched. */
export const formatPairingCode = (code) => {
    const c = String(code ?? '');
    return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
};
