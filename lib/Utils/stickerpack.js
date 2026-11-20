/**
 * JAP@Add --- part of the @japofc/baileys utils (stickerpack.ts.)
 *
 * Adds support for building/sending WhatsApp Sticker Pack messages.
 *
 * Exports:
 *   - convertToWebP() — converts a Buffer, URL string, or Stream into a WebP
 *     sticker buffer (passthrough if already WebP), sharp → @napi-rs/image
 *     fallback chain, 512x512 'inside' fit, quality 80.
 *   - generateStickerPackId() — generates a random pack ID
 *   - buildStickerPackProto() — builds the proto-level payload for a StickerPackMessage
 *   - STICKER_PACK_MESSAGE_TYPE — the message type string 'sticker_pack'
 *   - prepareStickerPackMessage() — full ZIP-build + upload + thumbnail
 *     pipeline for a ready-to-send stickerPackMessage.
 *
 * NOTE: source imported isWebPBuffer/isAnimatedWebP from its own
 * from-messages.ts, which is not part of this fork's port. Reimplemented
 * below as small standalone binary-sniffing helpers (RIFF/WEBP header +
 * ANIM chunk check) so this file has no external dependency on that addon.
 */
import { Boom } from '@hapi/boom';
import { zip } from 'fflate';
import { promises as fsPromises } from 'fs';
import { proto } from '../../WAProto/index.js';
import { sha256 } from './crypto.js';
import { generateMessageIDV2, unixTimestampSeconds } from './generics.js';
import { encryptedStream, getImageProcessingLibrary, getStream, toBuffer } from './messages-media.js';
/** True if `buffer` starts with a RIFF....WEBP container header. */
export const isWebPBuffer = (buffer) => {
    return (buffer.length > 12 &&
        buffer.toString('ascii', 0, 4) === 'RIFF' &&
        buffer.toString('ascii', 8, 12) === 'WEBP');
};
/** True if a WebP buffer contains an ANIM chunk (animated sticker). */
export const isAnimatedWebP = (buffer) => {
    if (!isWebPBuffer(buffer)) {
        return false;
    }
    // JAP@Fix (§2.148): this used to be `buffer.includes('ANIM')`, which scans the whole
    // file -- including compressed pixel data, where those four bytes turn up by chance.
    // A still sticker then went out flagged as animated. Walk the RIFF chunk list instead:
    // an animated WebP is VP8X with a real ANIM chunk in the top level.
    let offset = 12;
    while (offset + 8 <= buffer.length) {
        const fourCC = buffer.toString('ascii', offset, offset + 4);
        if (fourCC === 'ANIM') {
            return true;
        }
        const size = buffer.readUInt32LE(offset + 4);
        // chunks are padded to an even length
        offset += 8 + size + (size % 2);
    }
    return false;
};
/**
 * JAP@Fix (§2.186/§2.187) --- the one place that turns an arbitrary image buffer into a
 * sticker-shaped WebP. There used to be three copies of this logic (convertToWebP, the
 * per-sticker loop in prepareStickerPackMessage, and the pack cover), which is how the
 * animation bug below survived in all three at once.
 *
 * @param buffer raw input bytes
 * @param lib the resolved image-processing library
 * @param opts.allowAnimated false for the tray icon, which WhatsApp shows as a still
 * @returns `{ buffer, isAnimated }`
 */
export const _toStickerWebP = async (buffer, lib, opts = {}) => {
    const allowAnimated = opts.allowAnimated !== false;
    const hasSharp = 'sharp' in lib && !!lib.sharp?.default;
    const hasImage = 'image' in lib && !!lib.image?.Transformer;
    if (!hasSharp && !hasImage) {
        throw new Boom('No image processing library (sharp or @napi-rs/image) available for converting sticker to WebP.');
    }
    const alreadyWebP = isWebPBuffer(buffer);
    const animatedInput = alreadyWebP && isAnimatedWebP(buffer);
    if (alreadyWebP && !hasSharp) {
        // @napi-rs/image cannot resize an animated WebP without flattening it; passing the
        // input through untouched is the lesser evil, as it was before.
        return { buffer, isAnimated: animatedInput };
    }
    if (!hasSharp) {
        return { buffer: await new lib.image.Transformer(buffer).resize(512, 512).webp(80), isAnimated: false };
    }
    // JAP@Fix (§2.186): sharp was called WITHOUT `{ animated: true }`, so it silently read
    // only the first frame. An animated GIF or WebP sticker was converted into a still image
    // and then reported as `isAnimated: false` -- the sticker looked accepted and simply did
    // not move. Read every page, and keep them through the resize.
    const probe = await lib.sharp.default(buffer, { animated: true }).metadata();
    const multiPage = (probe.pages ?? 1) > 1;
    const keepAnimation = multiPage && allowAnimated;
    // JAP@Fix (§2.187): a WebP input was returned untouched at whatever size it happened to
    // be, so a 600x600 WebP went out as a 600x600 "sticker". Only skip the re-encode when the
    // input is already WebP AND already within the 512 box.
    if (alreadyWebP && animatedInput === keepAnimation
        && (probe.width ?? 0) <= 512 && (probe.height ?? 0) <= 512) {
        return { buffer, isAnimated: animatedInput };
    }
    const out = await lib.sharp
        .default(buffer, { animated: keepAnimation })
        .resize(512, 512, { fit: 'inside' })
        .webp({ quality: 80 })
        .toBuffer();
    return { buffer: out, isAnimated: keepAnimation && isAnimatedWebP(out) };
};
/**
 * Convert a Buffer, URL string, or Stream into a WebP sticker buffer.
 * If the input is already a valid WebP, it's returned untouched (and
 * `isAnimated` reflects whether it's an animated WebP).
 */
export const convertToWebP = async (input) => {
    const { stream } = await getStream(input);
    const buffer = await toBuffer(stream);
    return _toStickerWebP(buffer, await getImageProcessingLibrary());
};
/** Generate a random sticker pack ID (16 hex chars). */
export const generateStickerPackId = () => {
    const arr = new Uint8Array(8);
    for (let i = 0; i < 8; i++)
        arr[i] = Math.floor(Math.random() * 256);
    return Array.from(arr)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
};
/** Build the proto-level stickerPackMessage payload (name/publisher/packId/description only). */
export const buildStickerPackProto = (pack) => ({
    name: pack.name,
    publisher: pack.publisher,
    packId: pack.packId ?? generateStickerPackId(),
    description: pack.description ?? ''
});
/** stickerPack message type marker — for use with getMediaType()-style dispatch. */
export const STICKER_PACK_MESSAGE_TYPE = 'sticker_pack';
/**
 * Build the media-cache key for a sticker pack, or `false` when the pack cannot be cached.
 *
 * JAP@Fix (§2.147): the key used to be `'sticker:' + urls.join('@')` over whatever subset of
 * the stickers happened to be URL-based. Two ways that served the WRONG pack from cache:
 *   1. a pack mixing URLs and Buffers still produced a key, built only from the URLs -- so
 *      two packs sharing one URL but differing in every Buffer collided;
 *   2. the key ignored cover, name, publisher, description and packId entirely, so
 *      rebranding a pack returned the previous build.
 * Caching now requires every sticker AND the cover to be URL-based (what the old comment
 * already claimed), and the rest of the pack identity is folded into the hash.
 */
export const stickerPackCacheKey = ({ cover, stickers = [], name, publisher, description, packId }) => {
    if (!stickers.length) {
        return false;
    }
    const urls = stickers.map((s) => (typeof s?.data === 'object' && s.data?.url) || null);
    const coverUrl = typeof cover === 'object' && cover?.url ? cover.url : null;
    if (!coverUrl || !urls.every(Boolean)) {
        return false;
    }
    const identity = JSON.stringify({
        urls,
        coverUrl,
        name: name ?? null,
        publisher: publisher ?? null,
        description: description ?? null,
        packId: packId ?? null,
        emojis: stickers.map((s) => s?.emojis ?? null)
    });
    return 'sticker:' + sha256(Buffer.from(identity)).toString('base64');
};
const ITSL_CONCURRENCY_LIMIT = 15;
/**
 * Build a complete, ready-to-send stickerPackMessage (ZIP built, encrypted,
 * and uploaded) — full pipeline: per-sticker WebP conversion (15-way
 * concurrency batching), 1MB per-sticker size limit, 60-sticker pack limit,
 * cover→trayIcon-in-ZIP, and a separate 252×252 JPEG thumbnail upload.
 */
export const prepareStickerPackMessage = async (message, options) => {
    // JAP@Fix (bug 62): packId was never destructured here, so a caller-supplied
    // pack ID was silently dropped and a fresh one always generated below.
    const { cover, stickers = [], name = '📦 Sticker Pack', publisher = 'GitHub: JAPofc', description = '🏷️ japofc/baileys', packId } = message;
    if (stickers.length > 60) {
        throw new Boom('Sticker pack exceeds the maximum limit of 60 stickers', { statusCode: 400 });
    }
    if (stickers.length === 0) {
        throw new Boom('Sticker pack must contain at least one sticker', { statusCode: 400 });
    }
    if (!cover) {
        throw new Boom('Sticker pack must contain a cover', { statusCode: 400 });
    }
    const { logger } = options;
    // Media caching (keyed by concatenated sticker URLs, if all stickers are URL-based)
    const cacheableKey = options.mediaCache
        ? stickerPackCacheKey({ cover, stickers, name, publisher, description, packId })
        : false;
    if (cacheableKey) {
        const mediaBuff = await options.mediaCache.get(cacheableKey);
        if (mediaBuff) {
            logger?.debug({ cacheableKey }, 'got media cache hit');
            return proto.Message.StickerPackMessage.decode(mediaBuff);
        }
    }
    const lib = await getImageProcessingLibrary();
    const hasSharp = 'sharp' in lib && !!lib.sharp?.default;
    const hasImage = 'image' in lib && !!lib.image?.Transformer;
    if (!hasSharp && !hasImage) {
        throw new Boom('No image processing library (sharp or @napi-rs/image) available for converting sticker to WebP.');
    }
    const stickerPackIdValue = packId ?? generateMessageIDV2();
    const stickerData = {};
    const stickerMetadata = new Array(stickers.length);
    for (let i = 0; i < stickers.length; i += ITSL_CONCURRENCY_LIMIT) {
        const chunkEnd = Math.min(i + ITSL_CONCURRENCY_LIMIT, stickers.length);
        const promises = [];
        for (let j = i; j < chunkEnd; j++) {
            promises.push((async (index) => {
                const sticker = stickers[index];
                const { stream } = await getStream(sticker.data);
                const buffer = await toBuffer(stream);
                const converted = await _toStickerWebP(buffer, lib);
                const webpBuffer = converted.buffer;
                const isAnimated = converted.isAnimated;
                if (webpBuffer.length > 1024 * 1024) {
                    throw new Boom(`Sticker at index ${index} exceeds the 1MB size limit`, { statusCode: 400 });
                }
                const hash = sha256(webpBuffer).toString('base64').replace(/\//g, '-');
                const fileName = `${hash}.webp`;
                stickerData[fileName] = [new Uint8Array(webpBuffer), { level: 0 }];
                stickerMetadata[index] = {
                    fileName,
                    mimetype: 'image/webp',
                    isAnimated,
                    emojis: sticker.emojis || ['✨'],
                    accessibilityLabel: sticker.accessibilityLabel || '‎'
                };
            })(j));
        }
        await Promise.all(promises);
    }
    const trayIconFileName = `${stickerPackIdValue}.webp`;
    const { stream: coverStream } = await getStream(cover);
    const coverBuffer = await toBuffer(coverStream);
    // the tray icon is shown as a still -- never carry animation into it
    const { buffer: coverWebpBuffer } = await _toStickerWebP(coverBuffer, lib, { allowAnimated: false });
    stickerData[trayIconFileName] = [new Uint8Array(coverWebpBuffer), { level: 0 }];
    const zipBuffer = await new Promise((resolve, reject) => {
        zip(stickerData, (error, data) => (error ? reject(error) : resolve(Buffer.from(data))));
    });
    const stickerPackUpload = await encryptedStream(zipBuffer, 'sticker-pack', { logger, opts: options.options });
    let stickerPackUploadResult;
    try {
        stickerPackUploadResult = await options.upload(stickerPackUpload.encFilePath, {
            fileEncSha256B64: stickerPackUpload.fileEncSha256.toString('base64'),
            mediaType: 'sticker-pack',
            timeoutMs: options.mediaUploadTimeoutMs
        });
    }
    finally {
        fsPromises.unlink(stickerPackUpload.encFilePath).catch(() => logger?.warn('failed to remove tmp file'));
    }
    const obj = {
        name,
        publisher,
        stickerPackId: stickerPackIdValue,
        packDescription: description,
        stickerPackOrigin: proto.Message.StickerPackMessage.StickerPackOrigin.USER_CREATED,
        stickerPackSize: zipBuffer.length,
        stickers: stickerMetadata,
        fileSha256: stickerPackUpload.fileSha256,
        fileEncSha256: stickerPackUpload.fileEncSha256,
        mediaKey: stickerPackUpload.mediaKey,
        directPath: stickerPackUploadResult.directPath,
        fileLength: stickerPackUpload.fileLength,
        mediaKeyTimestamp: unixTimestampSeconds(),
        trayIconFileName
    };
    try {
        let thumbnailBuffer;
        if (hasSharp) {
            thumbnailBuffer = await lib.sharp.default(coverBuffer).resize(252, 252).jpeg().toBuffer();
        }
        else {
            // hasImage is guaranteed here since hasSharp||hasImage is enforced above.
            // JAP@Fix (bug 63): removed a jimp fallback branch that could never be
            // reached (the earlier guard already requires sharp or image), and which
            // main sticker/cover conversion above doesn't support anyway — it was
            // dead code presenting a false sense of a jimp-only code path.
            thumbnailBuffer = await new lib.image.Transformer(coverBuffer).resize(252, 252).jpeg();
        }
        if (!thumbnailBuffer || thumbnailBuffer.length === 0) {
            throw new Error('Failed to generate thumbnail buffer');
        }
        const thumbUpload = await encryptedStream(thumbnailBuffer, 'thumbnail-sticker-pack', {
            logger,
            opts: options.options,
            mediaKey: stickerPackUpload.mediaKey
        });
        let thumbUploadResult;
        try {
            thumbUploadResult = await options.upload(thumbUpload.encFilePath, {
                fileEncSha256B64: thumbUpload.fileEncSha256.toString('base64'),
                mediaType: 'thumbnail-sticker-pack',
                timeoutMs: options.mediaUploadTimeoutMs
            });
        }
        finally {
            fsPromises.unlink(thumbUpload.encFilePath).catch(() => logger?.warn('failed to remove tmp file'));
        }
        Object.assign(obj, {
            thumbnailDirectPath: thumbUploadResult.directPath,
            thumbnailSha256: thumbUpload.fileSha256,
            thumbnailEncSha256: thumbUpload.fileEncSha256,
            thumbnailHeight: 252,
            thumbnailWidth: 252,
            imageDataHash: sha256(thumbnailBuffer).toString('base64')
        });
    }
    catch (error) {
        logger?.warn(`Thumbnail generation failed: ${error}`);
    }
    if (cacheableKey) {
        logger?.debug({ cacheableKey }, 'set cache (background)');
        options.mediaCache.set(cacheableKey, Buffer.from(proto.Message.StickerPackMessage.encode(obj).finish()));
    }
    return proto.Message.StickerPackMessage.fromObject(obj);
};
