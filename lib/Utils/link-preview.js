import { Boom } from '@hapi/boom';
import { prepareWAMessageMedia } from './messages.js';
import { assertSafeHttpUrl, createPinnedFetch, extractImageThumb, getHttpStream, isPrivateHost, resolveSafeRedirectUrl } from './messages-media.js';
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
const META_RE = /<meta\s[^>]*>/gi;
const attr = (tag, name) => {
    const m = tag.match(new RegExp(name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\'|([^\\s">]+))', 'i'));
    return m ? (m[2] ?? m[3] ?? m[4] ?? '') : undefined;
};
const decodeEntities = (v) => typeof v !== 'string' ? v : v
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');

/**
 * JAP@Add (§2.211 follow-up): a drop-in `opts.fetcher` that closes the DNS-rebinding
 * window for link previews.
 *
 * `link-preview-js` does its own fetching with the global `fetch`, so no option we pass it
 * can pin a connection to an address we validated -- the honest answer when this landed was "use
 * your own fetcher if you need that guarantee". This IS that fetcher: it fetches the page
 * over `createPinnedFetch` (guard + pinned IP on every hop, redirects followed by hand)
 * and reads the handful of metadata tags a preview actually needs, so no third-party
 * request is made on our behalf at all.
 *
 * Trade-off, stated plainly: the metadata parser here is deliberately small (OpenGraph,
 * Twitter cards, `<title>`, `<meta name="description">`). `link-preview-js` understands
 * more exotic pages. Previews are best-effort; a connection to 169.254.169.254 is not.
 *
 * @returns {(url: string, opts?: object) => Promise<object>} shaped like `getLinkPreview`
 */
export const createPinnedLinkPreviewFetcher = (fetcherOpts = {}) => {
    const doFetch = createPinnedFetch(fetcherOpts);
    const maxRedirects = fetcherOpts.maxRedirects ?? 5;
    return async (url, opts = {}) => {
        let current = new URL(url.toString());
        let response;
        for (let hop = 0; ; hop++) {
            response = await doFetch(current.toString(), {
                method: 'GET',
                headers: opts.headers || fetcherOpts.headers,
                timeoutMs: opts.timeout ?? fetcherOpts.timeoutMs
            });
            const location = response.status >= 300 && response.status < 400
                ? response.headers.get('location')
                : null;
            if (!location) break;
            await response.body?.cancel?.();
            if (hop >= maxRedirects) {
                throw new Boom(`Too many redirects fetching preview for ${url}`, { statusCode: 400, data: { url: current.toString() } });
            }
            current = new URL(location, current);
        }
        const contentType = response.headers.get('content-type') || '';
        if (!/html|xml/i.test(contentType)) {
            await response.body?.cancel?.();
            return { url: current.toString(), mediaType: contentType.split(';')[0] || 'application/octet-stream', contentType };
        }
        const html = await response.text();
        const meta = {};
        for (const tag of html.match(META_RE) || []) {
            const key = (attr(tag, 'property') || attr(tag, 'name') || '').toLowerCase();
            const content = attr(tag, 'content');
            if (key && content !== undefined && meta[key] === undefined) {
                meta[key] = decodeEntities(content);
            }
        }
        const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const images = [];
        for (const key of ['og:image', 'twitter:image', 'twitter:image:src']) {
            const v = meta[key];
            if (v) {
                try { images.push(new URL(v, current).toString()); } catch { /* unusable image url */ }
            }
        }
        return {
            url: meta['og:url'] || current.toString(),
            title: meta['og:title'] || meta['twitter:title'] || (titleTag ? decodeEntities(titleTag[1].trim()) : undefined),
            siteName: meta['og:site_name'],
            description: meta['og:description'] || meta['twitter:description'] || meta['description'],
            mediaType: meta['og:type'] || 'website',
            contentType,
            images,
            favicons: []
        };
    };
};

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
        // JAP@Add (§2.211 follow-up): `fetchOpts.pinDns` swaps in the pinned fetcher, which
        // is the only configuration where the address we validated is the address we
        // connect to. Default stays `link-preview-js` -- richer parsing, documented gap.
        const getLinkPreview = opts.fetcher
            || (opts.fetchOpts?.pinDns
                ? createPinnedLinkPreviewFetcher({
                    allowPrivate: !!opts.fetchOpts?.allowPrivate,
                    allowHosts: opts.fetchOpts?.allowHosts,
                    timeoutMs: opts.fetchOpts?.timeout,
                    maxRedirects: opts.fetchOpts?.maxRedirects
                })
                : (await import('link-preview-js')).getLinkPreview);
        let previewLink = text;
        if (!text.startsWith('https://') && !text.startsWith('http://')) {
            previewLink = 'https://' + previewLink;
        }
        const allowPrivate = !!opts.fetchOpts?.allowPrivate;
        // JAP@Fix `allowHosts` was honoured by getHttpStream (thumbnails) but silently
        // ignored by the url guard here, so one option meant two different things on the
        // same call. Pass it through.
        const guardOpts = {
            allowPrivate,
            checkDns: opts.fetchOpts?.checkDns !== false,
            allowHosts: opts.fetchOpts?.allowHosts
        };
        // JAP@Fix (§2.211) --- the redirect hook below is synchronous, so it can only
        // compare hostnames; it cannot resolve DNS, which is where the guard does its real
        // work. That left a strong check on the first URL and a weak one on every hop
        // after it. Resolve the whole chain here instead, with the full guard on each hop,
        // and hand the library a URL that has already passed it.
        //
        // Costs one extra request. `resolveRedirects: false` opts out for callers who
        // supply their own already-safe fetcher.
        previewLink = opts.fetchOpts?.resolveRedirects === false
            ? (await assertSafeHttpUrl(previewLink, guardOpts)).toString()
            : (await resolveSafeRedirectUrl(previewLink, {
                ...guardOpts,
                pinDns: !!opts.fetchOpts?.pinDns,
                timeoutMs: opts.fetchOpts?.timeout,
                maxRedirects: opts.fetchOpts?.maxRedirects
            })).toString();
        const info = await getLinkPreview(previewLink, {
            ...opts.fetchOpts,
            followRedirects: 'follow',
            // Second layer. The chain was already resolved and validated above, so in the
            // normal case nothing redirects here at all; this stays as defence in depth
            // for anything that appears between the two requests. It is the weaker check
            // (no DNS) and is no longer the only one.
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
