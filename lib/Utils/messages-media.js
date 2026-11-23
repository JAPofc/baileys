import { Boom } from '@hapi/boom';
import { spawn } from 'child_process';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import * as Crypto from 'crypto';
import { once } from 'events';
import { createReadStream, createWriteStream, promises as fs, WriteStream } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Readable, Transform } from 'stream';
import { URL } from 'url';
import { proto } from '../../WAProto/index.js';
import { DEFAULT_ORIGIN, MEDIA_HKDF_KEY_MAPPING, MEDIA_PATH_MAP, NEWSLETTER_MEDIA_PATH_MAP } from '../Defaults/index.js';
import { getBinaryNodeChild, getBinaryNodeChildBuffer, jidNormalizedUser } from '../WABinary/index.js';
import { aesDecryptGCM, aesEncryptGCM, hkdf } from './crypto.js';
import { generateMessageIDV2 } from './generics.js';
import { exifOrientedDimensions } from './exif-orientation.js';
const getTmpFilesDirectory = () => tmpdir();

const DEFAULT_FETCH_TIMEOUT_MS = 60_000;

const isPrivateIPv4 = (ip) => {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
    const [a, b] = parts;
    return a === 0 || a === 10 || a === 127 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 100 && b >= 64 && b <= 127); // carrier-grade NAT
};

/**
 * JAP@Fix (§2.70 / v2.4.8): IPv4-mapped IPv6 was matched with three literal string
 * prefixes (`::ffff:127.`, `::ffff:10.`, `::ffff:192.168.`), which misses the dotted
 * forms of 169.254/16, 172.16/12, 100.64/10 and 0.0.0.0 entirely -- and misses EVERY
 * mapped address written in hex (`::ffff:7f00:1` is 127.0.0.1) or expanded
 * (`0:0:0:0:0:ffff:a9fe:a9fe`). `http://[::ffff:169.254.169.254]/` is the cloud
 * metadata endpoint. Map such addresses back to IPv4 and apply the IPv4 rules.
 *
 * @returns {string | null} the embedded IPv4 address, or null if this is not one
 */
const mappedIPv4 = (ip) => {
    const h = ip.toLowerCase();
    // expand to 8 groups so `::` placement does not matter
    const [head, tail = ''] = h.includes('::') ? h.split('::') : [h, null];
    const headGroups = head ? head.split(':') : [];
    const tailGroups = tail ? tail.split(':') : [];
    // a trailing dotted quad occupies the last two groups
    const last = tailGroups.length ? tailGroups[tailGroups.length - 1] : headGroups[headGroups.length - 1];
    let dotted = null;
    if (last && last.includes('.')) {
        if (isIP(last) !== 4) return null;
        dotted = last;
        if (tailGroups.length) tailGroups.pop();
        else headGroups.pop();
    }
    const width = dotted ? 6 : 8;
    const fill = tail === null ? 0 : width - headGroups.length - tailGroups.length;
    if (fill < 0) return null;
    const groups = [...headGroups, ...Array(fill).fill('0'), ...tailGroups].map(g => parseInt(g || '0', 16));
    if (groups.length !== width || groups.some(g => !Number.isInteger(g) || g < 0 || g > 0xffff)) return null;
    // ::ffff:a.b.c.d (mapped) and ::a.b.c.d (deprecated compatible)
    const leadingZero = groups.slice(0, 5).every(g => g === 0);
    if (!leadingZero) return null;
    const marker = groups[5];
    if (marker !== 0xffff && marker !== 0) return null;
    if (dotted) return dotted;
    const [hi, lo] = [groups[6], groups[7]];
    if (marker === 0 && hi === 0 && lo <= 1) return null; // :: and ::1 are handled separately
    return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
};

const isPrivateIPv6 = (ip) => {
    const h = ip.toLowerCase();
    if (h === '::1' || h === '::') return true;
    const v4 = mappedIPv4(h);
    if (v4) return isPrivateIPv4(v4);
    const first = parseInt(h.split(':')[0] || '0', 16);
    // fc00::/7 unique-local, fe80::/10 link-local (fe80–febf)
    if (Number.isInteger(first) && ((first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80)) return true;
    return false;
};

/** Strip the brackets a URL keeps around an IPv6 literal (`[::1]` -> `::1`). */
export const unbracketHost = (hostname) => String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase();

export const isPrivateHost = (hostname) => {
    const host = unbracketHost(hostname);
    if (!host) return true;
    if (host === 'localhost' || host.endsWith('.localhost')) return true;
    const family = isIP(host);
    if (family === 4) return isPrivateIPv4(host);
    if (family === 6) return isPrivateIPv6(host);
    return false;
};

/**
 * Validate an HTTP(S) URL before a helper fetches user-controlled input.
 * By default this blocks loopback/private/link-local IPs (including DNS
 * results) to reduce SSRF foot-guns. Pass `{ allowPrivate: true }` when you
 * intentionally fetch a trusted intranet/local URL.
 */
export const assertSafeHttpUrl = async (url, { allowPrivate = false, checkDns = true, allowHosts } = {}) => {
    let parsed;
    try {
        parsed = new URL(url.toString());
    } catch (err) {
        throw new Boom(`Invalid URL: ${url}`, { statusCode: 400, data: { url }, cause: err });
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Boom(`Unsupported URL protocol: ${parsed.protocol}`, { statusCode: 400, data: { url: parsed.toString() } });
    }
    if (allowPrivate) return parsed;
    // JAP@Add (v2.4.8): `allowHosts` carves out specific hosts (your own LAN media
    // server, a localhost test fixture) WITHOUT switching the SSRF guard off for
    // everything else, which is what `allowPrivate: true` does.
    if (allowHosts?.length) {
        const bare = unbracketHost(parsed.hostname);
        if (allowHosts.some(h => unbracketHost(h) === bare)) {
            return parsed;
        }
    }
    if (isPrivateHost(parsed.hostname)) {
        throw new Boom(`Refusing to fetch private/loopback host: ${parsed.hostname}`, { statusCode: 400, data: { url: parsed.toString() } });
    }
    // JAP@Fix (§2.70 / v2.4.8): `URL.hostname` keeps the brackets around an IPv6
    // literal, so `isIP(parsed.hostname)` was always 0 and EVERY IPv6 URL fell into
    // the DNS branch -- where resolving the bracketed string always fails. Public
    // IPv6-literal URLs were therefore refused outright, with the misleading
    // "Failed to resolve host: [2606:4700:4700::1111]".
    const bareHost = unbracketHost(parsed.hostname);
    if (checkDns && !isIP(bareHost)) {
        let records;
        try {
            records = await lookup(bareHost, { all: true, verbatim: true });
        } catch (err) {
            throw new Boom(`Failed to resolve host: ${parsed.hostname}`, { statusCode: 400, data: { url: parsed.toString() }, cause: err });
        }
        for (const record of records || []) {
            if (isPrivateHost(record.address)) {
                throw new Boom(`Refusing to fetch host that resolves to a private address: ${parsed.hostname}`, { statusCode: 400, data: { url: parsed.toString(), address: record.address } });
            }
        }
    }
    return parsed;
};

let imageProcessingLibrary;
let _imageLibInitPromise = null; // JAP@Fix (bug 22): deduplicate parallel init calls
export const getImageProcessingLibrary = async () => {
    if (imageProcessingLibrary) {
        return imageProcessingLibrary;
    }
    if (!_imageLibInitPromise) {
        _imageLibInitPromise = (async () => {
            //@ts-ignore
            const [sharp, image, jimp] = await Promise.all([
                import('sharp').catch(() => { }),
                import('@napi-rs/image').catch(() => { }),
                import('jimp').catch(() => { })
            ]);
            if (sharp) {
                imageProcessingLibrary = { sharp };
            }
            else if (image) {
                imageProcessingLibrary = { image };
            }
            else if (jimp) {
                imageProcessingLibrary = { jimp };
            }
            else {
                throw new Boom('No image processing library available');
            }
            return imageProcessingLibrary;
        })();
    }
    return _imageLibInitPromise;
};
/**
 * JAP@Add (§2.212/§2.213 test hook) --- pin the image backend, or clear the cache.
 *
 * `getImageProcessingLibrary()` picks sharp > @napi-rs/image > jimp and caches the winner,
 * so on any machine with sharp the other two branches are unreachable -- which is exactly
 * how two wrong-output bugs sat in the @napi-rs/image branch with a fully green suite.
 * Tests use this to exercise every backend on one machine.
 *
 * @param {object | null} [library] `{ sharp }` | `{ image }` | `{ jimp }`, or null to reset
 */
export const _setImageProcessingLibrary = (library) => {
    imageProcessingLibrary = library || undefined;
    _imageLibInitPromise = null;
};

export const hkdfInfoKey = (type) => {
    const hkdfInfo = MEDIA_HKDF_KEY_MAPPING[type];
    return `WhatsApp ${hkdfInfo} Keys`;
};
export const getRawMediaUploadData = async (media, mediaType, logger) => {
    const { stream } = await getStream(media);
    logger?.debug('got stream for raw upload');
    const hasher = Crypto.createHash('sha256');
    const filePath = join(tmpdir(), mediaType + generateMessageIDV2());
    const fileWriteStream = createWriteStream(filePath);
    let fileLength = 0;
    try {
        for await (const data of stream) {
            fileLength += data.length;
            hasher.update(data);
            if (!fileWriteStream.write(data)) {
                await once(fileWriteStream, 'drain');
            }
        }
        fileWriteStream.end();
        await once(fileWriteStream, 'finish');
        stream.destroy();
        const fileSha256 = hasher.digest();
        logger?.debug('hashed data for raw upload');
        return {
            filePath: filePath,
            fileSha256,
            fileLength
        };
    }
    catch (error) {
        fileWriteStream.destroy();
        stream.destroy();
        try {
            await fs.unlink(filePath);
        }
        catch {
            //
        }
        throw error;
    }
};
/** generates all the keys required to encrypt/decrypt & sign a media message */
export async function getMediaKeys(buffer, mediaType) {
    if (!buffer) {
        throw new Boom('Cannot derive from empty media key');
    }
    if (typeof buffer === 'string') {
        buffer = Buffer.from(buffer.replace('data:;base64,', ''), 'base64');
    }
    // expand using HKDF to 112 bytes, also pass in the relevant app info
    const expandedMediaKey = hkdf(buffer, 112, { info: hkdfInfoKey(mediaType) });
    return {
        iv: expandedMediaKey.slice(0, 16),
        cipherKey: expandedMediaKey.slice(16, 48),
        macKey: expandedMediaKey.slice(48, 80)
    };
}
/**
 * JAP@Add (§2.178): read the pixel dimensions straight out of a JPEG's SOF marker.
 *
 * Dependency-free on purpose: the image libraries are all optional, and this has to work on
 * an install that has none of them (the same reasoning as `getWebPDimensions()` in
 * sticker-exif.js). Returns null for anything that is not a JPEG we can read.
 */
export const jpegDimensions = (buffer) => {
    if (!Buffer.isBuffer(buffer) || buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
        return null;
    }
    let offset = 2;
    while (offset + 9 < buffer.length) {
        if (buffer[offset] !== 0xff) {
            offset++; // resync rather than give up: padding bytes are legal between segments
            continue;
        }
        const marker = buffer[offset + 1];
        // standalone markers carry no length
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
            offset += 2;
            continue;
        }
        if (marker === 0xd9 || marker === 0xda) {
            return null; // end of image / start of scan: no frame header found
        }
        const length = buffer.readUInt16BE(offset + 2);
        // SOF0..SOF15, excluding the DHT/JPG/DAC markers that share the range
        const isFrameHeader = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
        if (isFrameHeader) {
            return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
        }
        if (length < 2) {
            return null;
        }
        offset += 2 + length;
    }
    return null;
};
/** Extracts video thumb using FFMPEG */
export const extractVideoThumb = async (path, time, size = { width: 32 }) => {
    // JAP@Add --- auto-detect the binary (ffmpeg-static / @ffmpeg-installer /
    // system PATH / FFMPEG_PATH) instead of blindly assuming PATH
    const { requireFfmpegPath } = await import('./ffmpeg-path.js');
    const ffmpegBin = await requireFfmpegPath();
    // JAP@Fix (§2.179): `size` had no default and was never checked, so omitting it -- which
    // the sibling extractImageThumb(buf, width = 32) lets you do -- reached ffmpeg as
    // `scale=undefined:-1` and died on "Cannot parse expression for width: 'undefined'",
    // or threw a bare "Cannot read properties of undefined". Neither names the real mistake.
    const targetWidth = size?.width;
    if (!Number.isFinite(Number(targetWidth)) || Number(targetWidth) <= 0) {
        throw new Boom('extractVideoThumb: "size.width" must be a positive number', {
            statusCode: 400,
            data: { size }
        });
    }
    const grabFrame = async (seek) => {
        const args = ['-loglevel', 'error'];
        if (seek) {
            args.push('-ss', String(seek));
        }
        // JAP@Fix (§2.177): ffmpeg 7 refuses to open the mjpeg encoder for limited-range
        // YUV ("Non full-range YUV is non-standard") and exits 234 having written nothing,
        // so EVERY video thumbnail failed on a modern ffmpeg. Asking for yuvj420p -- the
        // full-range pixel format JPEG actually uses -- is what the encoder wants, and is
        // accepted by older builds too.
        args.push('-i', path, '-an', '-sn', '-dn', '-map_metadata', '-1', '-vf', `scale=${Number(targetWidth)}:-1`, '-frames:v', '1', '-c:v', 'mjpeg', '-pix_fmt', 'yuvj420p', '-f', 'image2pipe', 'pipe:1');
        const ffmpeg = spawn(ffmpegBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        const chunks = [];
        const stderrChunks = [];
        ffmpeg.stdout.on('data', (chunk) => chunks.push(chunk));
        ffmpeg.stderr.on('data', (chunk) => stderrChunks.push(chunk));
        const [code] = await once(ffmpeg, 'close');
        return { code, buffer: Buffer.concat(chunks), stderr: Buffer.concat(stderrChunks).toString('utf8') };
    };
    let result = await grabFrame(time);
    // JAP@Fix (§2.105): seeking past the end of the clip makes ffmpeg exit **0** with no frame
    // written, so a video shorter than `time` (the default is 1s — plenty of status clips and
    // short videos are) produced a silent 0-byte "thumbnail" that was then embedded in the
    // message. Fall back to the very first frame, and refuse to return a non-JPEG.
    if (result.code === 0 && !result.buffer.length && time && String(time) !== '0') {
        result = await grabFrame(0);
    }
    if (result.code !== 0) {
        throw new Boom(`FFmpeg failed (code ${result.code}):\n` + result.stderr);
    }
    const buffer = result.buffer;
    if (!buffer.length || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
        throw new Boom(`FFmpeg produced no frame for this video (seek "${time}" — is the clip shorter than that?)`, {
            statusCode: 422,
            data: { path, time, bytes: buffer.length, stderr: result.stderr }
        });
    }
    return buffer;
};
/**
 * Build the small JPEG preview WhatsApp ships inside the message, plus the dimensions of
 * the original.
 *
 * JAP@Fix (§2.61 / v2.4.7): the sharp and @napi-rs/image branches read raw metadata and
 * never applied the EXIF `Orientation` tag, while the jimp branch auto-rotates on read --
 * so the same portrait photo produced an upright thumbnail with one optional library
 * installed and a sideways one (with `width`/`height` swapped on the wire) with another.
 * The returned `original` is now always what a viewer displays, and the sharp thumbnail is
 * auto-oriented to match.
 */
/**
 * JAP@Add (§2.178): the native pixel dimensions of a video, as `{ width, height }` or null.
 *
 * Decodes a single unscaled frame to JPEG and reads its frame header. That costs one extra
 * ffmpeg invocation per video, which is why it is only called when dimensions are actually
 * missing. ffprobe would be the obvious tool, but `ffmpeg-static` -- the binary most installs
 * end up using -- does not ship it.
 */
export const extractVideoDimensions = async (path, time = '00:00:00') => {
    const { requireFfmpegPath } = await import('./ffmpeg-path.js');
    const ffmpegBin = await requireFfmpegPath();
    const args = ['-loglevel', 'error'];
    if (time) {
        args.push('-ss', String(time));
    }
    args.push('-i', path, '-an', '-sn', '-dn', '-map_metadata', '-1', '-frames:v', '1', '-c:v', 'mjpeg', '-pix_fmt', 'yuvj420p', '-f', 'image2pipe', 'pipe:1');
    const run = (argv) => new Promise((resolve) => {
        const proc = spawn(ffmpegBin, argv, { stdio: ['ignore', 'pipe', 'ignore'] });
        const chunks = [];
        proc.stdout.on('data', (chunk) => chunks.push(chunk));
        proc.on('close', (code) => resolve({ code, buffer: Buffer.concat(chunks) }));
        proc.on('error', () => resolve({ code: -1, buffer: Buffer.alloc(0) }));
    });
    let out = await run(args);
    // same seek-past-the-end case extractVideoThumb handles (§2.105)
    if ((!out.buffer.length || out.code !== 0) && time && String(time) !== '0' && String(time) !== '00:00:00') {
        out = await run(args.filter((a, i) => !(args[i - 1] === '-ss' || a === '-ss')));
    }
    return out.code === 0 ? jpegDimensions(out.buffer) : null;
};
export const extractImageThumb = async (bufferOrFilePath, width = 32) => {
    if (bufferOrFilePath instanceof Readable) {
        bufferOrFilePath = await toBuffer(bufferOrFilePath);
    }
    const lib = await getImageProcessingLibrary();
    if ('sharp' in lib && lib.sharp?.default) {
        const img = lib.sharp.default(bufferOrFilePath);
        const dimensions = await img.metadata();
        // .rotate() with no argument means "apply the EXIF orientation"
        const buffer = await img.rotate().resize(width).jpeg({ quality: 50 }).toBuffer();
        return {
            buffer,
            original: exifOrientedDimensions(dimensions)
        };
    }
    else if ('image' in lib && lib.image?.Transformer) {
        if (!Buffer.isBuffer(bufferOrFilePath)) {
            bufferOrFilePath = await fs.readFile(bufferOrFilePath);
        }
        const img = new lib.image.Transformer(bufferOrFilePath);
        const dimensions = await img.metadata();
        const buffer = await img.resize(width, undefined, 0).jpeg(50);
        return {
            buffer,
            original: exifOrientedDimensions(dimensions)
        };
    }
    else if ('jimp' in lib && lib.jimp?.Jimp) {
        const jimp = await lib.jimp.Jimp.read(bufferOrFilePath);
        const dimensions = {
            width: jimp.width,
            height: jimp.height
        };
        const buffer = await jimp
            .resize({ w: width, mode: lib.jimp.ResizeStrategy.BILINEAR })
            .getBuffer('image/jpeg', { quality: 50 });
        return {
            buffer,
            original: dimensions
        };
    }
    else {
        throw new Boom('No image processing library available');
    }
};
export const encodeBase64EncodedStringForUpload = (b64) => encodeURIComponent(b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/\=+$/, ''));
/** Where a `cover` crop takes its square from when the source is not square. */
export const PROFILE_PICTURE_POSITIONS = ['centre', 'center', 'top', 'bottom', 'left', 'right'];

/**
 * Build the square JPEG WhatsApp wants for a profile picture.
 *
 * JAP@Fix (§2.98): the three optional image backends disagreed, and two were wrong — the
 * jimp branch cropped from the **top-left** (`crop({ x: 0, y: 0 })`), so a landscape photo
 * lost everything right of centre, and the @napi-rs branch did a plain `resize(w, h)`, which
 * **distorts** a non-square photo instead of cropping it. Only the sharp branch center-cropped.
 * Same call, same input, three different pictures depending on what happened to be installed.
 * All three centre-crop now (and honour `position`), so the result no longer depends on the
 * optional library in use.
 */
export const generateProfilePicture = async (mediaUpload, dimensions) => {
    let buffer;
    // `fit: 'contain'` letterboxes the ORIGINAL aspect ratio onto the canvas instead of
    // cropping — the whole picture survives. Default stays 'cover' (WhatsApp's own behavior).
    const { width: w = 720, height: h = 720, fit = 'cover', position = 'centre' } = dimensions || {};
    const useContain = fit === 'contain';
    if (!PROFILE_PICTURE_POSITIONS.includes(position)) {
        throw new Boom(`generateProfilePicture: unknown position "${position}" (${PROFILE_PICTURE_POSITIONS.join(' | ')})`, {
            statusCode: 400,
            data: { position }
        });
    }
    if (Buffer.isBuffer(mediaUpload)) {
        buffer = mediaUpload;
    }
    else {
        // Use getStream to handle all WAMediaUpload types (Buffer, Stream, URL)
        const { stream } = await getStream(mediaUpload);
        // Convert the resulting stream to a buffer
        buffer = await toBuffer(stream);
    }
    /** Offset of a centre/top/left/... square crop inside a `width × height` source. */
    const cropOrigin = (width, height, size) => {
        const spareX = Math.max(0, width - size);
        const spareY = Math.max(0, height - size);
        switch (position) {
            case 'top':
                return { x: Math.floor(spareX / 2), y: 0 };
            case 'bottom':
                return { x: Math.floor(spareX / 2), y: spareY };
            case 'left':
                return { x: 0, y: Math.floor(spareY / 2) };
            case 'right':
                return { x: spareX, y: Math.floor(spareY / 2) };
            default:
                return { x: Math.floor(spareX / 2), y: Math.floor(spareY / 2) };
        }
    };
    const lib = await getImageProcessingLibrary();
    let img;
    if ('sharp' in lib && lib.sharp?.default) {
        img = lib.sharp
            .default(buffer)
            .resize(w, h, useContain
            ? { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } }
            : { fit: 'cover', position: position === 'center' ? 'centre' : position })
            .jpeg({
            quality: 80
        })
            .toBuffer();
    }
    else if ('image' in lib && lib.image?.Transformer) {
        // JAP@Fix (§2.212): this branch only runs when `sharp` is absent, so no test ever
        // executed it -- and both halves were wrong about the one thing a profile picture
        // must be: an exact w x h square.
        //   cover:   crop(size) -> resize(w,h,Nearest). `resize` defaults to ResizeFit.Cover,
        //            which never UPSCALES, so a 600x300 source came out 300x300 while the
        //            function returned `{ width: 720, height: 720 }`. The caller was told a
        //            size the bytes did not have.
        //   contain: `scale = Math.min(w/width, h/height, 1)` is 1 for any source smaller
        //            than the canvas, so the image was returned untouched -- 600x300, not
        //            square at all, and never letterboxed despite the option's whole point.
        // Fixed by forcing the exact canvas: ResizeFit.Fill after a square crop (aspect is
        // already right, so nothing is squashed), and a real letterbox built from a black
        // canvas via fromRgbaPixels + overlay.
        // Proven by experiment, not assumed: @napi-rs/image NEVER upscales -- not with
        // ResizeFit.Fill, not with Cover/Inside/Outside, not with fastResize. A 300x300 crop
        // asked to become 720x720 stays 300x300. `jimp` is a hard dependency, so it is
        // always there to finish the job when the source is smaller than the canvas.
        const upscaleWithJimp = async (input, tw, th) => {
            const { Jimp, ResizeStrategy } = await import('jimp');
            const canvasImg = await Jimp.read(Buffer.from(input));
            return await canvasImg
                .resize({ w: tw, h: th, mode: ResizeStrategy?.BILINEAR })
                .getBuffer('image/jpeg', { quality: 80 });
        };
        const exactly = async (input, tw, th) => {
            const out = await input;
            const m = await new lib.image.Transformer(Buffer.from(out)).metadata();
            return (m.width === tw && m.height === th) ? out : await upscaleWithJimp(out, tw, th);
        };
        const Fill = lib.image.ResizeFit?.Fill ?? 1;
        const Inside = lib.image.ResizeFit?.Inside ?? 2;
        const Lanczos3 = lib.image.ResizeFilterType?.Lanczos3 ?? 4;
        const meta = await new lib.image.Transformer(buffer).metadata();
        if (useContain) {
            const scale = Math.min(w / meta.width, h / meta.height);
            const sw = Math.max(1, Math.min(w, Math.round(meta.width * scale)));
            const sh = Math.max(1, Math.min(h, Math.round(meta.height * scale)));
            const scaled = await new lib.image.Transformer(buffer)
                .resize(sw, sh, Lanczos3, Inside)
                .png();
            if (typeof lib.image.Transformer.fromRgbaPixels === 'function') {
                // opaque black canvas, matching the sharp branch's background
                const canvas = Buffer.alloc(w * h * 4);
                for (let i = 3; i < canvas.length; i += 4) {
                    canvas[i] = 255;
                }
                img = exactly(lib.image.Transformer
                    .fromRgbaPixels(canvas, w, h)
                    .overlay(scaled, Math.floor((w - sw) / 2), Math.floor((h - sh) / 2))
                    .jpeg(80), w, h);
            }
            else {
                // no compositing available: stretch to the canvas rather than hand back a
                // non-square picture while claiming it is w x h
                img = exactly(new lib.image.Transformer(buffer).resize(w, h, Lanczos3, Fill).jpeg(80), w, h);
            }
        }
        else {
            const size = Math.min(meta.width, meta.height);
            const { x, y } = cropOrigin(meta.width, meta.height, size);
            const transformer = new lib.image.Transformer(buffer);
            // crop first so a non-square source is cut, not squashed
            const squared = typeof transformer.crop === 'function'
                ? transformer.crop(x, y, size, size)
                : transformer;
            img = exactly(squared.resize(w, h, Lanczos3, Fill).jpeg(80), w, h);
        }
    }
    else if ('jimp' in lib && lib.jimp?.Jimp) {
        const jimp = await lib.jimp.Jimp.read(buffer);
        if (useContain) {
            img = jimp.contain({ w, h }).getBuffer('image/jpeg', { quality: 80 });
        }
        else {
            const size = Math.min(jimp.width, jimp.height);
            const { x, y } = cropOrigin(jimp.width, jimp.height, size);
            const cropped = jimp.crop({ x, y, w: size, h: size });
            img = cropped.resize({ w, h, mode: lib.jimp.ResizeStrategy.BILINEAR }).getBuffer('image/jpeg', { quality: 80 });
        }
    }
    else {
        throw new Boom('No image processing library available');
    }
    return {
        img: await img,
        width: w,
        height: h,
        fit,
        position
    };
};
export const mediaMessageSHA256B64 = (message) => {
    const media = Object.values(message)[0];
    return media?.fileSha256 && Buffer.from(media.fileSha256).toString('base64');
};
export async function getAudioDuration(buffer) {
    const musicMetadata = await import('music-metadata');
    let metadata;
    const options = {
        duration: true
    };
    if (Buffer.isBuffer(buffer)) {
        metadata = await musicMetadata.parseBuffer(buffer, undefined, options);
    }
    else if (typeof buffer === 'string') {
        metadata = await musicMetadata.parseFile(buffer, options);
    }
    else {
        metadata = await musicMetadata.parseStream(buffer, undefined, options);
    }
    return metadata.format.duration;
}
/**
  referenced from and modifying https://github.com/wppconnect-team/wa-js/blob/main/src/chat/functions/prepareAudioWaveform.ts
 */
/**
 * Reduce raw PCM samples (one channel, floats in [-1, 1]) to WhatsApp's 64-bucket waveform.
 *
 * Returns 64 bytes in the range 0..100. Clips shorter than 64 samples used to divide by a
 * block size of zero and come back as 64 zeros (§2.208); each sample now gets its own
 * bucket instead. Digital silence legitimately produces all zeros.
 */
export function computeAudioWaveform(rawData, samples = 64) {
    const length = rawData?.length || 0;
    if (!length) {
        return new Uint8Array(samples);
    }
    // never 0: with fewer samples than buckets each bucket covers a single sample
    const blockSize = Math.max(1, Math.floor(length / samples));
    const filteredData = [];
    for (let i = 0; i < samples; i++) {
        const blockStart = blockSize * i;
        let sum = 0;
        let counted = 0;
        for (let j = 0; j < blockSize; j++) {
            const sample = rawData[blockStart + j];
            if (sample === undefined || Number.isNaN(sample)) {
                break; // past the end of the clip
            }
            sum += Math.abs(sample);
            counted++;
        }
        filteredData.push(counted ? sum / counted : 0);
    }
    // scale so the loudest bucket lands on 100; an all-silent clip stays all zeros
    const peak = Math.max(...filteredData);
    if (!(peak > 0)) {
        return new Uint8Array(samples);
    }
    return new Uint8Array(filteredData.map(n => Math.min(100, Math.max(0, Math.floor((100 * n) / peak)))));
}
export async function getAudioWaveform(buffer, logger) {
    try {
        // @ts-ignore
        const { default: decoder } = await import('audio-decode');
        let audioData;
        if (Buffer.isBuffer(buffer)) {
            audioData = buffer;
        }
        else if (typeof buffer === 'string') {
            const rStream = createReadStream(buffer);
            audioData = await toBuffer(rStream);
        }
        else {
            audioData = await toBuffer(buffer);
        }
        const audioBuffer = await decoder(audioData);
        // JAP@Fix (§2.209) audio-decode does not return one shape. The WebAudio-style
        // decoders hand back an AudioBuffer with getChannelData(); the wav path in
        // audio-decode 3.x returns a plain `{ channelData, sampleRate }`. The old code
        // called getChannelData() unconditionally, so for those formats this threw
        // straight into the catch below and the function returned undefined -- silently,
        // because the catch only logs at debug level.
        const rawData = typeof audioBuffer?.getChannelData === 'function'
            ? audioBuffer.getChannelData(0)
            : audioBuffer?.channelData?.[0] ?? audioBuffer?._channelData?.[0];
        if (!rawData?.length) {
            throw new Boom('audio decoder returned no channel data', { statusCode: 400 });
        }
        const waveform = computeAudioWaveform(rawData);
        return waveform;
    }
    catch (e) {
        logger?.debug('Failed to generate waveform: ' + e);
    }
}
export const toReadable = (buffer) => {
    const readable = new Readable({ read: () => { } });
    readable.push(buffer);
    readable.push(null);
    return readable;
};
export const toBuffer = async (stream) => {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    stream.destroy();
    return Buffer.concat(chunks);
};
export const getStream = async (item, opts) => {
    if (Buffer.isBuffer(item)) {
        return { stream: toReadable(item), type: 'buffer' };
    }
    if ('stream' in item) {
        return { stream: item.stream, type: 'readable' };
    }
    const urlStr = item.url.toString();
    if (urlStr.startsWith('data:')) {
        const buffer = Buffer.from(urlStr.split(',')[1], 'base64');
        return { stream: toReadable(buffer), type: 'buffer' };
    }
    if (urlStr.startsWith('http://') || urlStr.startsWith('https://')) {
        return { stream: await getHttpStream(item.url, opts), type: 'remote' };
    }
    return { stream: createReadStream(item.url), type: 'file' };
};
/** generates a thumbnail for a given media, if required */
export async function generateThumbnail(file, mediaType, options) {
    let thumbnail;
    let originalImageDimensions;
    if (mediaType === 'image') {
        const { buffer, original } = await extractImageThumb(file);
        thumbnail = buffer.toString('base64');
        if (original.width && original.height) {
            originalImageDimensions = {
                width: original.width,
                height: original.height
            };
        }
    }
    else if (mediaType === 'video') {
        try {
            const buff = await extractVideoThumb(file, '00:00:00', { width: 32, height: 32 });
            thumbnail = buff.toString('base64');
        }
        catch (err) {
            options.logger?.debug('could not generate video thumb: ' + err);
        }
        // JAP@Fix (§2.178): only the image branch ever filled originalImageDimensions, and
        // prepareWAMessageMedia fills uploadData.width/height from nothing else -- so every
        // video sent without explicit dimensions went out with none at all, and clients
        // rendered a wrongly-shaped placeholder until the file finished downloading.
        // The thumbnail itself is scaled to 32px, so it cannot answer this; probe one
        // unscaled frame and read its JPEG frame header.
        try {
            originalImageDimensions = await extractVideoDimensions(file) ?? undefined;
        }
        catch (err) {
            options.logger?.debug('could not read video dimensions: ' + err);
        }
    }
    return {
        thumbnail,
        originalImageDimensions
    };
}
/**
 * Walk a redirect chain with the full SSRF guard on every hop and return the final URL.
 *
 * For callers that cannot follow redirects safely themselves. `link-preview-js` is the
 * motivating case: its redirect hook is synchronous, so it can only compare hostnames --
 * it cannot resolve DNS, which is where the guard does its real work. Resolving the chain
 * here first means the library is handed a URL that has already passed the strong check,
 * and told not to redirect again.
 *
 * Honest about what this does not fix: between this resolution and the caller's own
 * request, DNS can change underneath both of us. Closing that needs the resolved address
 * pinned into the connection, which is not something a caller using someone else's fetch
 * can do. This removes the asymmetry (strong guard at the front door, weak one at the
 * side door); it does not make DNS rebinding impossible.
 *
 * @param {string|URL} url
 * @param {object} [options] — as `assertSafeHttpUrl`, plus `maxRedirects`, `timeoutMs`,
 *   `probeMethod` (default GET), `fetchImpl`
 * @returns {Promise<URL>} the final, validated URL
 */
/**
 * JAP@Add (§2.211 follow-up): a `fetch`-compatible function that pins the connection to
 * the exact IP address the SSRF guard validated.
 *
 * The remaining hole after §2.211 was a TOCTOU one: we resolved a hostname, decided its
 * addresses were public, and then handed the *name* to `fetch`, which resolved it again.
 * A DNS server that answers `93.184.216.34` the first time and `127.0.0.1` the second
 * walks straight past a guard that only ever saw the first answer. The fix is to stop
 * resolving twice: validate the addresses once, then force the socket to use one of them
 * via the `lookup` hook of `node:http`/`node:https`, with the original hostname still sent
 * as `Host`/SNI so virtual hosting and TLS keep working.
 *
 * Returns a minimal Response: `status`, `ok`, `url`, `headers.get()`, `text()`,
 * `arrayBuffer()`, `json()`, and a `body` stream with `cancel()`. Enough for
 * `resolveSafeRedirectUrl`, `getHttpStream`, and metadata fetching. It deliberately does
 * NOT follow redirects (`redirect: 'manual'` is the only supported mode) -- every hop has
 * to go back through the guard.
 *
 * @param {object} [pinOptions] — as `assertSafeHttpUrl` (`allowPrivate`, `allowHosts`)
 */
export const createPinnedFetch = (pinOptions = {}) => {
    return async (input, init = {}) => {
        const parsed = await assertSafeHttpUrl(input.toString(), { ...pinOptions, checkDns: true });
        const bareHost = unbracketHost(parsed.hostname);
        // JAP@Note: pattern 39 again, and it bit me while writing this very function --
        // `assertSafeHttpUrl` returns early for an allow-listed host, so the re-check below
        // has to honour the same carve-out or the two guards disagree about the same url.
        const hostAllowed = !!pinOptions.allowHosts?.some(h => unbracketHost(h) === bareHost);
        const allowPrivateAddrs = !!pinOptions.allowPrivate || hostAllowed;
        // the addresses this host is allowed to resolve to for this request, and nothing else
        let pinned;
        if (isIP(bareHost)) {
            pinned = [{ address: bareHost, family: isIP(bareHost) }];
        } else {
            const records = await lookup(bareHost, { all: true, verbatim: true });
            pinned = [];
            for (const record of records || []) {
                // `assertSafeHttpUrl` already rejected private answers; re-check because this
                // is a second resolution and the whole point is to trust nothing in between
                if (!allowPrivateAddrs && isPrivateHost(record.address)) {
                    throw new Boom(`Refusing to fetch host that resolves to a private address: ${parsed.hostname}`, { statusCode: 400, data: { url: parsed.toString(), address: record.address } });
                }
                pinned.push(record);
            }
            if (!pinned.length) {
                throw new Boom(`Failed to resolve host: ${parsed.hostname}`, { statusCode: 400, data: { url: parsed.toString() } });
            }
        }
        const transport = parsed.protocol === 'https:' ? await import('node:https') : await import('node:http');
        const pinnedLookup = (_hostname, opts, cb) => {
            const want = typeof opts === 'function' ? {} : (opts || {});
            const callback = typeof opts === 'function' ? opts : cb;
            const match = want.family
                ? pinned.find(r => r.family === want.family)
                : pinned[0];
            if (!match) {
                callback(new Error(`No pinned address for ${parsed.hostname} (family ${want.family})`));
                return;
            }
            if (want.all) {
                callback(null, pinned.map(r => ({ address: r.address, family: r.family })));
            } else {
                callback(null, match.address, match.family);
            }
        };
        const headers = {};
        const rawHeaders = init.headers;
        if (rawHeaders) {
            if (typeof rawHeaders.forEach === 'function' && !Array.isArray(rawHeaders)) {
                rawHeaders.forEach((v, k) => { headers[k] = v; });
            } else {
                for (const [k, v] of Array.isArray(rawHeaders) ? rawHeaders : Object.entries(rawHeaders)) {
                    if (v !== undefined) headers[k] = v;
                }
            }
        }
        return await new Promise((resolve, reject) => {
            const req = transport.request(parsed, {
                method: init.method || 'GET',
                headers,
                lookup: pinnedLookup,
                // the certificate must still match the NAME, not the pinned address
                servername: parsed.protocol === 'https:' && !isIP(bareHost) ? bareHost : undefined
            }, res => {
                const headerBag = {
                    get: (name) => {
                        const v = res.headers[name.toLowerCase()];
                        return Array.isArray(v) ? v.join(', ') : (v ?? null);
                    },
                    has: (name) => res.headers[name.toLowerCase()] !== undefined,
                    forEach: (fn) => { for (const [k, v] of Object.entries(res.headers)) fn(Array.isArray(v) ? v.join(', ') : v, k); }
                };
                const readBody = () => new Promise((res2, rej2) => {
                    const chunks = [];
                    res.on('data', c => chunks.push(c));
                    res.on('end', () => res2(Buffer.concat(chunks)));
                    res.on('error', rej2);
                });
                const status = res.statusCode || 0;
                resolve({
                    status,
                    statusText: res.statusMessage || '',
                    ok: status >= 200 && status < 300,
                    url: parsed.toString(),
                    redirected: false,
                    headers: headerBag,
                    body: Object.assign(res, { cancel: async () => { res.destroy(); } }),
                    text: async () => (await readBody()).toString('utf8'),
                    json: async () => JSON.parse((await readBody()).toString('utf8')),
                    arrayBuffer: async () => {
                        const b = await readBody();
                        return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
                    }
                });
            });
            const timeoutMs = init.timeoutMs ?? pinOptions.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
            req.setTimeout(timeoutMs, () => {
                req.destroy(new Boom(`Timed out fetching ${parsed}`, { statusCode: 408, data: { url: parsed.toString() } }));
            });
            init.signal?.addEventListener?.('abort', () => req.destroy(new Error('aborted')), { once: true });
            req.on('error', reject);
            req.end();
        });
    };
};

/**
 * Picks the fetch implementation for a guarded request. `pinDns: true` (or a caller that
 * passes nothing and wants the strongest default available) gets the IP-pinned one.
 */
const pickGuardedFetch = (options) => {
    if (options.fetchImpl) return options.fetchImpl;
    if (options.pinDns && !options.dispatcher) return createPinnedFetch(options);
    return fetch;
};

export const resolveSafeRedirectUrl = async (url, options = {}) => {
    let parsed = await assertSafeHttpUrl(url, options);
    const timeoutMs = options.timeoutMs ?? options.timeout ?? DEFAULT_FETCH_TIMEOUT_MS;
    const maxRedirects = options.maxRedirects ?? 5;
    const doFetch = pickGuardedFetch(options);

    for (let hop = 0; ; hop++) {
        const response = await doFetch(parsed.toString(), {
            dispatcher: options.dispatcher,
            method: options.probeMethod || 'GET',
            headers: options.headers,
            redirect: 'manual',
            signal: AbortSignal.timeout(timeoutMs)
        });
        const location = response.status >= 300 && response.status < 400
            ? response.headers?.get?.('location')
            : null;
        response.body?.cancel?.();
        if (!location) {
            return parsed;
        }
        if (hop >= maxRedirects) {
            throw new Boom(`Too many redirects resolving ${url}`, { statusCode: 400, data: { url: parsed.toString() } });
        }
        parsed = await assertSafeHttpUrl(new URL(location, parsed).toString(), options);
    }
};

export const getHttpStream = async (url, options = {}) => {
    let parsed = await assertSafeHttpUrl(url, options);
    const timeoutMs = options.timeoutMs ?? options.timeout ?? DEFAULT_FETCH_TIMEOUT_MS;
    const maxRedirects = options.maxRedirects ?? 5;
    const doFetch = pickGuardedFetch(options);
    // JAP@Fix (§2.207): only the FIRST url went through the SSRF guard. fetch() follows
    // redirects by default, so a remote server could answer a perfectly innocent image URL
    // with `302 Location: http://169.254.169.254/...` (or a loopback port) and we would
    // fetch it and hand the bytes back -- the guard checked a url we then did not use.
    // Follow redirects by hand and validate every hop.
    let response;
    for (let hop = 0; ; hop++) {
        response = await doFetch(parsed.toString(), {
            dispatcher: options.dispatcher,
            method: 'GET',
            headers: options.headers,
            redirect: 'manual',
            // JAP@Fix (bug 26/39): no timeout = potential infinite hang on slow CDN
            signal: AbortSignal.timeout(timeoutMs)
        });
        const location = response.status >= 300 && response.status < 400
            ? response.headers?.get?.('location')
            : null;
        if (!location) {
            break;
        }
        if (hop >= maxRedirects) {
            throw new Boom(`Too many redirects fetching ${url}`, { statusCode: 400, data: { url: parsed.toString() } });
        }
        // a relative Location resolves against the hop we are on
        parsed = await assertSafeHttpUrl(new URL(location, parsed).toString(), options);
        response.body?.cancel?.();
    }
    if (!response.ok) {
        throw new Boom(`Failed to fetch stream from ${parsed}`, { statusCode: response.status, data: { url: parsed.toString() } });
    }
    const max = options.maxContentLength;
    const declared = Number(response.headers?.get?.('content-length'));
    if (max && Number.isFinite(declared) && declared > max) {
        throw new Boom(`content length exceeded when fetching remote media`, {
            statusCode: 413,
            data: { url: parsed.toString(), contentLength: declared, maxContentLength: max }
        });
    }
    // @ts-ignore Node18+ Readable.fromWeb exists
    return response.body instanceof Readable ? response.body : Readable.fromWeb(response.body);
};

/** Fetch a URL into a Buffer with timeout, SSRF guard and streaming size cap. */
export const fetchBuffer = async (url, options = {}) => {
    const stream = await getHttpStream(url, options);
    const chunks = [];
    let length = 0;
    try {
        for await (const chunk of stream) {
            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            length += buf.length;
            if (options.maxContentLength && length > options.maxContentLength) {
                throw new Boom(`content length exceeded when fetching remote media`, {
                    statusCode: 413,
                    data: { url: url.toString(), contentLength: length, maxContentLength: options.maxContentLength }
                });
            }
            chunks.push(buf);
        }
        return Buffer.concat(chunks, length);
    } finally {
        stream.destroy?.();
    }
};
export const encryptedStream = async (media, mediaType, { logger, saveOriginalFileIfRequired, opts } = {}) => {
    const { stream, type } = await getStream(media, opts);
    logger?.debug('fetched media stream');
    const mediaKey = Crypto.randomBytes(32);
    const { cipherKey, iv, macKey } = await getMediaKeys(mediaKey, mediaType);
    const encFilePath = join(getTmpFilesDirectory(), mediaType + generateMessageIDV2() + '-enc');
    const encFileWriteStream = createWriteStream(encFilePath);
    let originalFileStream;
    let originalFilePath;
    if (saveOriginalFileIfRequired) {
        originalFilePath = join(getTmpFilesDirectory(), mediaType + generateMessageIDV2() + '-original');
        originalFileStream = createWriteStream(originalFilePath);
    }
    let fileLength = 0;
    const aes = Crypto.createCipheriv('aes-256-cbc', cipherKey, iv);
    const hmac = Crypto.createHmac('sha256', macKey).update(iv);
    const sha256Plain = Crypto.createHash('sha256');
    const sha256Enc = Crypto.createHash('sha256');
    const onChunk = async (buff) => {
        sha256Enc.update(buff);
        hmac.update(buff);
        // Handle backpressure: if write returns false, wait for drain
        if (!encFileWriteStream.write(buff)) {
            await once(encFileWriteStream, 'drain');
        }
    };
    try {
        for await (const data of stream) {
            if (type === 'remote' &&
                opts?.maxContentLength &&
                fileLength + data.length > opts.maxContentLength) {
                throw new Boom(`content length exceeded when encrypting "${type}"`, {
                    statusCode: 413,
                    data: { media, type, contentLength: fileLength + data.length, maxContentLength: opts.maxContentLength }
                });
            }
            fileLength += data.length;
            if (originalFileStream) {
                if (!originalFileStream.write(data)) {
                    await once(originalFileStream, 'drain');
                }
            }
            sha256Plain.update(data);
            await onChunk(aes.update(data));
        }
        await onChunk(aes.final());
        const mac = hmac.digest().slice(0, 10);
        sha256Enc.update(mac);
        const fileSha256 = sha256Plain.digest();
        const fileEncSha256 = sha256Enc.digest();
        encFileWriteStream.write(mac);
        const encFinishPromise = once(encFileWriteStream, 'finish');
        const originalFinishPromise = originalFileStream ? once(originalFileStream, 'finish') : Promise.resolve();
        encFileWriteStream.end();
        originalFileStream?.end?.();
        stream.destroy();
        // Wait for write streams to fully flush to disk
        // This helps reduce memory pressure by allowing OS to release buffers
        await encFinishPromise;
        await originalFinishPromise;
        logger?.debug('encrypted data successfully');
        return {
            mediaKey,
            originalFilePath,
            encFilePath,
            mac,
            fileEncSha256,
            fileSha256,
            fileLength
        };
    }
    catch (error) {
        // destroy all streams with error
        encFileWriteStream.destroy();
        originalFileStream?.destroy?.();
        aes.destroy();
        hmac.destroy();
        sha256Plain.destroy();
        sha256Enc.destroy();
        stream.destroy();
        try {
            await fs.unlink(encFilePath);
            if (originalFilePath) {
                await fs.unlink(originalFilePath);
            }
        }
        catch (err) {
            logger?.error({ err }, 'failed deleting tmp files');
        }
        throw error;
    }
};
export const DEF_MEDIA_HOST = 'mmg.whatsapp.net';
const AES_CHUNK_SIZE = 16;
const toSmallestChunkSize = (num) => {
    return Math.floor(num / AES_CHUNK_SIZE) * AES_CHUNK_SIZE;
};
export const getUrlFromDirectPath = (directPath, host = DEF_MEDIA_HOST) => `https://${host}${directPath}`;
const extractHost = (url) => {
    if (!url)
        return undefined;
    try {
        return new URL(url).host;
    }
    catch {
        return undefined;
    }
};
export const downloadContentFromMessage = async ({ mediaKey, directPath, url }, type, opts = {}) => {
    // Fallback host: explicit opt > host parsed from `url` > DEF_MEDIA_HOST.
    // Lets us honor a non-default host carried by the proto without forcing callers to thread it through.
    const fallbackHost = opts.host ?? extractHost(url);
    const downloadUrl = directPath ? getUrlFromDirectPath(directPath, fallbackHost) : url;
    if (!downloadUrl) {
        throw new Boom('No valid media URL or directPath present in message', { statusCode: 400 });
    }
    const keys = await getMediaKeys(mediaKey, type);
    // JAP@Fix (bug 24): was single-attempt only — now retries up to 3x with delay
    const MAX_RETRIES = 3;
    let lastErr;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            return await downloadEncryptedContent(downloadUrl, keys, opts);
        } catch (err) {
            lastErr = err;
            if (attempt < MAX_RETRIES - 1) {
                await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
            }
        }
    }
    throw lastErr;
};
/**
 * Decrypts and downloads an AES256-CBC encrypted file given the keys.
 * Assumes the SHA256 of the plaintext is appended to the end of the ciphertext
 * */
export const downloadEncryptedContent = async (downloadUrl, { cipherKey, iv }, { startByte, endByte, options } = {}) => {
    let bytesFetched = 0;
    let startChunk = 0;
    let firstBlockIsIV = false;
    // if a start byte is specified -- then we need to fetch the previous chunk as that will form the IV
    if (startByte) {
        const chunk = toSmallestChunkSize(startByte || 0);
        if (chunk) {
            startChunk = chunk - AES_CHUNK_SIZE;
            bytesFetched = chunk;
            firstBlockIsIV = true;
        }
    }
    const endChunk = endByte ? toSmallestChunkSize(endByte || 0) + AES_CHUNK_SIZE : undefined;
    const headersInit = options?.headers ? options.headers : undefined;
    const headers = {
        ...(headersInit
            ? Array.isArray(headersInit)
                ? Object.fromEntries(headersInit)
                : headersInit
            : {}),
        Origin: DEFAULT_ORIGIN
    };
    if (startChunk || endChunk) {
        headers.Range = `bytes=${startChunk}-`;
        if (endChunk) {
            headers.Range += endChunk;
        }
    }
    // download the message
    const fetched = await getHttpStream(downloadUrl, {
        ...(options || {}),
        headers
    });
    let remainingBytes = Buffer.from([]);
    let aes;
    const pushBytes = (bytes, push) => {
        if (startByte || endByte) {
            // JAP@Fix (§2.77): both bounds used to be computed against a possibly-undefined
            // counterpart, so `{ startByte }` on its own evaluated `endByte - bytesFetched`
            // to NaN and sliced every chunk down to nothing -- a resumed download completed
            // "successfully" with zero bytes. Each bound is now applied only when it exists.
            const start = startByte !== undefined && bytesFetched < startByte
                ? Math.max(startByte - bytesFetched, 0)
                : undefined;
            const end = endByte !== undefined && bytesFetched + bytes.length >= endByte
                ? Math.max(endByte - bytesFetched, 0)
                : undefined;
            push(bytes.slice(start, end));
            bytesFetched += bytes.length;
        }
        else {
            push(bytes);
        }
    };
    const output = new Transform({
        transform(chunk, _, callback) {
            let data = remainingBytes.length ? Buffer.concat([remainingBytes, chunk]) : chunk;
            const decryptLength = toSmallestChunkSize(data.length);
            remainingBytes = data.slice(decryptLength);
            data = data.slice(0, decryptLength);
            if (!aes) {
                let ivValue = iv;
                if (firstBlockIsIV) {
                    ivValue = data.slice(0, AES_CHUNK_SIZE);
                    data = data.slice(AES_CHUNK_SIZE);
                }
                aes = Crypto.createDecipheriv('aes-256-cbc', cipherKey, ivValue);
                // if an end byte that is not EOF is specified
                // stop auto padding (PKCS7) -- otherwise throws an error for decryption
                if (endByte) {
                    aes.setAutoPadding(false);
                }
            }
            try {
                pushBytes(aes.update(data), b => this.push(b));
                callback();
            }
            catch (error) {
                callback(error);
            }
        },
        final(callback) {
            try {
                // JAP@Fix (§2.77): an empty response body never constructed the decipher, so
                // this used to blow up with `Cannot read properties of undefined (reading
                // 'final')` instead of saying what actually went wrong.
                if (!aes) {
                    throw new Boom('Media download returned an empty body — nothing to decrypt', {
                        statusCode: 502,
                        data: { url: downloadUrl.toString(), startByte, endByte }
                    });
                }
                pushBytes(aes.final(), b => this.push(b));
                callback();
            }
            catch (error) {
                callback(error);
            }
        }
    });
    return fetched.pipe(output, { end: true });
};
export function extensionForMediaMessage(message) {
    const getExtension = (mimetype) => mimetype.split(';')[0]?.split('/')[1];
    const type = Object.keys(message)[0];
    let extension;
    if (type === 'locationMessage' || type === 'liveLocationMessage' || type === 'productMessage') {
        extension = '.jpeg';
    }
    else {
        const messageContent = message[type];
        extension = getExtension(messageContent.mimetype);
    }
    return extension;
}
const isNodeRuntime = () => {
    return (typeof process !== 'undefined' &&
        process.versions?.node !== null &&
        typeof process.versions.bun === 'undefined' &&
        typeof globalThis.Deno === 'undefined');
};
export const uploadWithNodeHttp = async ({ url, filePath, headers, timeoutMs, agent }, redirectCount = 0) => {
    if (redirectCount > 5) {
        throw new Error('Too many redirects');
    }
    const parsedUrl = new URL(url);
    const httpModule = parsedUrl.protocol === 'https:' ? await import('https') : await import('http');
    // Get file size for Content-Length header (required for Node.js streaming)
    const fileStats = await fs.stat(filePath);
    const fileSize = fileStats.size;
    return new Promise((resolve, reject) => {
        const req = httpModule.request({
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'POST',
            headers: {
                ...headers,
                'Content-Length': fileSize
            },
            agent,
            timeout: timeoutMs
        }, res => {
            // Handle redirects (3xx)
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume(); // Consume response to free resources
                // JAP@Fix (§2.207): the upload follows redirects by hand and never re-checked
                // where it was being sent -- the next hop carries the media file itself, so a
                // redirect to a loopback or metadata address would have uploaded the user's
                // media there. The upload hosts are public, so the standard guard applies.
                const newUrl = new URL(res.headers.location, url).toString();
                resolve(assertSafeHttpUrl(newUrl).then(() => uploadWithNodeHttp({
                    url: newUrl,
                    filePath,
                    headers,
                    timeoutMs,
                    agent
                }, redirectCount + 1)));
                return;
            }
            let body = '';
            res.on('data', chunk => (body += chunk));
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                }
                catch {
                    resolve(undefined);
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Upload timeout'));
        });
        const stream = createReadStream(filePath);
        stream.pipe(req);
        stream.on('error', err => {
            req.destroy();
            reject(err);
        });
    });
};
const uploadWithFetch = async ({ url, filePath, headers, timeoutMs, agent }) => {
    // Convert Node.js Readable to Web ReadableStream
    const nodeStream = createReadStream(filePath);
    const webStream = Readable.toWeb(nodeStream);
    // Native fetch only accepts Undici-style dispatchers, not generic https Agents.
    const dispatcher = typeof agent?.dispatch === 'function' ? agent : undefined;
    const response = await fetch(url, {
        ...(dispatcher ? { dispatcher } : {}),
        method: 'POST',
        body: webStream,
        headers,
        duplex: 'half',
        signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined
    });
    try {
        return (await response.json());
    }
    catch {
        return undefined;
    }
};
/**
 * Uploads media to WhatsApp servers.
 *
 * ## Why we have two upload implementations:
 *
 * Node.js's native `fetch` (powered by undici) has a known bug where it buffers
 * the entire request body in memory before sending, even when using streams.
 * This causes memory issues with large files (e.g., 1GB file = 1GB+ memory usage).
 * See: https://github.com/nodejs/undici/issues/4058
 *
 * Other runtimes (Bun, Deno, browsers) correctly stream the request body without
 * buffering, so we can use the web-standard Fetch API there.
 *
 * ## Future considerations:
 * Once the undici bug is fixed, we can simplify this to use only the Fetch API
 * across all runtimes. Monitor the GitHub issue for updates.
 */
const uploadMedia = async (params, logger) => {
    if (isNodeRuntime()) {
        logger?.debug('Using Node.js https module for upload (avoids undici buffering bug)');
        return uploadWithNodeHttp(params);
    }
    else {
        logger?.debug('Using web-standard Fetch API for upload');
        return uploadWithFetch(params);
    }
};
export const getWAUploadToServer = ({ customUploadHosts, fetchAgent, logger, options }, refreshMediaConn) => {
    return async (filePath, { mediaType, fileEncSha256B64, timeoutMs, newsletter }) => {
        // send a query JSON to obtain the url & auth token to upload our media
        let uploadInfo = await refreshMediaConn(false);
        let urls;
        const hosts = [...customUploadHosts, ...uploadInfo.hosts];
        fileEncSha256B64 = encodeBase64EncodedStringForUpload(fileEncSha256B64);
        // Prepare common headers
        const customHeaders = (() => {
            const hdrs = options?.headers;
            if (!hdrs)
                return {};
            return Array.isArray(hdrs) ? Object.fromEntries(hdrs) : hdrs;
        })();
        const headers = {
            ...customHeaders,
            'Content-Type': 'application/octet-stream',
            Origin: DEFAULT_ORIGIN
        };
        for (let hostIdx = 0; hostIdx < hosts.length; hostIdx++) {
            const { hostname } = hosts[hostIdx];
            logger.debug(`uploading to "${hostname}"`);
            const auth = encodeURIComponent(uploadInfo.auth);
            // JAP@Changes 06-02-26 --- Switch media path map for newsletter uploads
            const mediaPathMap = newsletter ? NEWSLETTER_MEDIA_PATH_MAP : MEDIA_PATH_MAP;
            // JAP@Changes 20-03-26 --- Add server thumb for newsletter media
            const serverThumb = newsletter ? '&server_thumb_gen=1' : '';
            const url = `https://${hostname}${mediaPathMap[mediaType]}/${fileEncSha256B64}?auth=${auth}&token=${fileEncSha256B64}${serverThumb}`;
            let result;
            try {
                result = await uploadMedia({
                    url,
                    filePath,
                    headers,
                    timeoutMs,
                    agent: fetchAgent
                }, logger);
                if (result?.url || result?.direct_path) {
                    urls = {
                        mediaUrl: result.url,
                        directPath: result.direct_path,
                        meta_hmac: result.meta_hmac,
                        fbid: result.fbid,
                        ts: result.ts,
                        thumbnailDirectPath: result.thumbnail_info?.thumbnail_direct_path,
                        thumbnailSha256: result.thumbnail_info?.thumbnail_sha256
                    };
                    break;
                }
                else {
                    uploadInfo = await refreshMediaConn(true);
                    throw new Error(`upload failed, reason: ${JSON.stringify(result)}`);
                }
            }
            catch (error) {
                const isLast = hostIdx === hosts.length - 1;
                logger.warn({ trace: error?.stack, uploadResult: result }, `Error in uploading to ${hostname} ${isLast ? '' : ', retrying...'}`);
                // JAP@Fix (bug 23): add exponential backoff delay between hosts instead of immediate retry
                if (!isLast) {
                    await new Promise(r => setTimeout(r, 300 * (hostIdx + 1)));
                }
            }
        }
        if (!urls) {
            throw new Boom('Media upload failed on all hosts', { statusCode: 500 });
        }
        return urls;
    };
};
const getMediaRetryKey = (mediaKey) => {
    return hkdf(mediaKey, 32, { info: 'WhatsApp Media Retry Notification' });
};
/**
 * Generate a binary node that will request the phone to re-upload the media & return the newly uploaded URL
 */
export const encryptMediaRetryRequest = (key, mediaKey, meId) => {
    const recp = { stanzaId: key.id };
    const recpBuffer = proto.ServerErrorReceipt.encode(recp).finish();
    const iv = Crypto.randomBytes(12);
    const retryKey = getMediaRetryKey(mediaKey);
    const ciphertext = aesEncryptGCM(recpBuffer, retryKey, iv, Buffer.from(key.id));
    const req = {
        tag: 'receipt',
        attrs: {
            id: key.id,
            to: jidNormalizedUser(meId),
            type: 'server-error'
        },
        content: [
            // this encrypt node is actually pretty useless
            // the media is returned even without this node
            // keeping it here to maintain parity with WA Web
            {
                tag: 'encrypt',
                attrs: {},
                content: [
                    { tag: 'enc_p', attrs: {}, content: ciphertext },
                    { tag: 'enc_iv', attrs: {}, content: iv }
                ]
            },
            {
                tag: 'rmr',
                attrs: {
                    jid: key.remoteJid,
                    from_me: (!!key.fromMe).toString(),
                    // @ts-ignore
                    participant: key.participant || undefined
                }
            }
        ]
    };
    return req;
};
export const decodeMediaRetryNode = (node) => {
    const rmrNode = getBinaryNodeChild(node, 'rmr');
    const event = {
        key: {
            id: node.attrs.id,
            remoteJid: rmrNode.attrs.jid,
            fromMe: rmrNode.attrs.from_me === 'true',
            participant: rmrNode.attrs.participant
        }
    };
    const errorNode = getBinaryNodeChild(node, 'error');
    if (errorNode) {
        const errorCode = +errorNode.attrs.code;
        event.error = new Boom(`Failed to re-upload media (${errorCode})`, {
            data: errorNode.attrs,
            statusCode: getStatusCodeForMediaRetry(errorCode)
        });
    }
    else {
        const encryptedInfoNode = getBinaryNodeChild(node, 'encrypt');
        const ciphertext = getBinaryNodeChildBuffer(encryptedInfoNode, 'enc_p');
        const iv = getBinaryNodeChildBuffer(encryptedInfoNode, 'enc_iv');
        if (ciphertext && iv) {
            event.media = { ciphertext, iv };
        }
        else {
            event.error = new Boom('Failed to re-upload media (missing ciphertext)', { statusCode: 404 });
        }
    }
    return event;
};
export const decryptMediaRetryData = ({ ciphertext, iv }, mediaKey, msgId) => {
    const retryKey = getMediaRetryKey(mediaKey);
    const plaintext = aesDecryptGCM(ciphertext, retryKey, iv, Buffer.from(msgId));
    return proto.MediaRetryNotification.decode(plaintext);
};
export const getStatusCodeForMediaRetry = (code) => MEDIA_RETRY_STATUS_MAP[code];
const MEDIA_RETRY_STATUS_MAP = {
    [proto.MediaRetryNotification.ResultType.SUCCESS]: 200,
    [proto.MediaRetryNotification.ResultType.DECRYPTION_ERROR]: 412,
    [proto.MediaRetryNotification.ResultType.NOT_FOUND]: 404,
    [proto.MediaRetryNotification.ResultType.GENERAL_ERROR]: 418
};
