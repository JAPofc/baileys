/**
 * JAP@Add --- part of the @japofc/baileys utils (media-messages.ts.)
 * Jimp-based profile-picture image generators (square + panoramic/wide).
 * Deduplicated aliases kept intact: generateProfilePictureFull ===
 * changeprofileFull, generateProfilePictureFP === generatePP (source had
 * these as byte-identical pairs under different names).
 */
// JAP@Fix: jimp is lazy-loaded (same pattern as better-sqlite3 /
// fluent-ffmpeg / node-webpmux elsewhere in this fork). A static top-level
// import made every consumer pay ~200ms startup + ~11MB heap for an image
// library only the profile-picture helpers use, and broke browser-targeting
// bundlers (jimp@1.6.x ships an empty `export {}` stub as its browser entry,
// so bundlephobia/esbuild-web resolved Jimp/JimpMime to nothing). Node's
// module registry caches the dynamic import, so the cost is paid once per
// process on first use — repeat calls hit the cache at ~0ms.
let jimpModule = null;
const loadJimp = async () => {
    if (!jimpModule) {
        jimpModule = await import('jimp');
    }
    return jimpModule;
};
const toBuffer = async (stream) => {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    stream.destroy?.();
    return Buffer.concat(chunks);
};
/**
 * Generates a panoramic/wide profile picture buffer — landscape images are
 * scaled down to a 720px-wide target, portrait images to a 324px-wide
 * target, preserving aspect ratio throughout.
 */
const generateWideProfilePicture = async (img) => {
    const { Jimp, JimpMime } = await loadJimp();
    const jimp = await Jimp.read(img);
    const width = jimp.bitmap.width;
    const height = jimp.bitmap.height;
    const ratio = width > height ? width / 720 : width / 324;
    const targetWidth = Math.round(width / ratio);
    const targetHeight = Math.round(height / ratio);
    const buffer = await jimp.resize({ w: targetWidth, h: targetHeight }).getBuffer(JimpMime.jpeg, { quality: 100 });
    return { img: buffer };
};
export const generateProfilePictureFull = generateWideProfilePicture;
export const changeprofileFull = generateWideProfilePicture;
/**
 * Generates a square profile picture buffer (main image, scaled to fit
 * within 720x720) plus a normalized preview buffer.
 */
const generateSquareProfilePicture = async (buffer) => {
    const { Jimp, JimpMime } = await loadJimp();
    const jimp = await Jimp.read(buffer);
    const img = await jimp.clone().scaleToFit({ w: 720, h: 720 }).getBuffer(JimpMime.jpeg);
    const preview = await jimp.clone().normalize().getBuffer(JimpMime.jpeg);
    return { img, preview };
};
export const generateProfilePictureFP = generateSquareProfilePicture;
export const generatePP = generateSquareProfilePicture;
/**
 * Generates a profile picture buffer from a flexible input source — a raw
 * Buffer, a `{ url }` media-upload descriptor, or a `{ stream }`
 * media-upload descriptor. Resizes the longer dimension down to 720px,
 * preserving aspect ratio on the other.
 */
export const generateProfilePicturee = async (mediaUpload) => {
    let bufferOrFilePath;
    if (Buffer.isBuffer(mediaUpload)) {
        bufferOrFilePath = mediaUpload;
    }
    else if ('url' in mediaUpload) {
        bufferOrFilePath = mediaUpload.url.toString();
    }
    else {
        bufferOrFilePath = await toBuffer(mediaUpload.stream);
    }
    const { Jimp, JimpMime } = await loadJimp();
    const jimp = await Jimp.read(bufferOrFilePath);
    const { width, height } = jimp.bitmap;
    const resized = width > height
        ? jimp.resize({ w: 720, h: Math.round((height / width) * 720) })
        : jimp.resize({ w: Math.round((width / height) * 720), h: 720 });
    const img = await resized.getBuffer(JimpMime.jpeg, { quality: 100 });
    return { img };
};
