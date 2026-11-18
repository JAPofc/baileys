import { prepareWAMessageMedia } from './messages.js';
import { assertSafeHttpUrl, extractImageThumb, getHttpStream, isPrivateHost } from './messages-media.js';
const THUMBNAIL_WIDTH_PX = 192;
/** Fetches an image and generates a thumbnail for it */
const getCompressedJpegThumbnail = async (url, { thumbnailWidth, fetchOpts }) => {
    const stream = await getHttpStream(url, fetchOpts);
    const result = await extractImageThumb(stream, thumbnailWidth);
    return result;
};
/**
 * Given a piece of text, checks for any URL present, generates link preview for the same and returns it
 * Return undefined if the fetch failed or no URL was found
 * @param text first matched URL in text
 * @returns the URL info required to generate link preview
 */
export const getUrlInfo = async (text, opts = {
    thumbnailWidth: THUMBNAIL_WIDTH_PX,
    fetchOpts: { timeout: 3000 }
}) => {
    try {
        // retries
        let retries = 0;
        const maxRetry = 5;
        // JAP@Add (§2.122): `opts.fetcher` lets a caller supply its own metadata
        // fetcher (proxy, cache, test double) instead of the bundled `link-preview-js`.
        // Omitted => identical behaviour to before.
        const getLinkPreview = opts.fetcher || (await import('link-preview-js')).getLinkPreview;
        let previewLink = text;
        if (!text.startsWith('https://') && !text.startsWith('http://')) {
            previewLink = 'https://' + previewLink;
        }
        const allowPrivate = !!opts.fetchOpts?.allowPrivate;
        previewLink = (await assertSafeHttpUrl(previewLink, { allowPrivate, checkDns: opts.fetchOpts?.checkDns !== false })).toString();
        const info = await getLinkPreview(previewLink, {
            ...opts.fetchOpts,
            followRedirects: 'follow',
            handleRedirects: (baseURL, forwardedURL) => {
                const urlObj = new URL(baseURL);
                const forwardedURLObj = new URL(forwardedURL);
                if (retries >= maxRetry) {
                    return false;
                }
                if (!allowPrivate && (isPrivateHost(urlObj.hostname) || isPrivateHost(forwardedURLObj.hostname))) {
                    return false;
                }
                if (forwardedURLObj.hostname === urlObj.hostname ||
                    forwardedURLObj.hostname === 'www.' + urlObj.hostname ||
                    'www.' + forwardedURLObj.hostname === urlObj.hostname) {
                    retries += 1;
                    return true;
                }
                else {
                    return false;
                }
            },
            headers: opts.fetchOpts?.headers
        });
        if (info && 'title' in info && info.title) {
            // JAP@Fix (§2.121): `info.images` is absent on several preview shapes
            // returned by link-preview-js, so destructuring it threw a TypeError that the
            // outer catch re-raised -- a perfectly good title/description preview was lost
            // because the page simply had no picture.
            const [image] = Array.isArray(info.images) ? info.images : [];
            const urlInfo = {
                'canonical-url': info.url,
                'matched-text': text,
                title: info.title,
                description: info.description,
                originalThumbnailUrl: image
            };
            if (opts.uploadImage && image) {
                const { imageMessage } = await prepareWAMessageMedia({ image: { url: image } }, {
                    upload: opts.uploadImage,
                    mediaTypeOverride: 'thumbnail-link',
                    options: opts.fetchOpts
                });
                urlInfo.jpegThumbnail = imageMessage?.jpegThumbnail ? Buffer.from(imageMessage.jpegThumbnail) : undefined;
                urlInfo.highQualityThumbnail = imageMessage || undefined;
            }
            else {
                try {
                    urlInfo.jpegThumbnail = image ? (await getCompressedJpegThumbnail(image, opts)).buffer : undefined;
                }
                catch (error) {
                    opts.logger?.debug({ err: error.stack, url: previewLink }, 'error in generating thumbnail');
                }
            }
            return urlInfo;
        }
    }
    catch (error) {
        // JAP@Fix (§2.121): non-Error throws (strings, `undefined` from an aborted
        // fetch) made `error.message.includes` blow up with a TypeError that masked the
        // real failure.
        const message = typeof error?.message === 'string' ? error.message : String(error ?? '');
        if (!message.includes('receive a valid')) {
            throw error;
        }
    }
};
