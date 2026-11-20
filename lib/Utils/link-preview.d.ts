export function getUrlInfo(text: any, opts?: {
    thumbnailWidth?: number;
    fetchOpts?: {
        timeout?: number;
        timeoutMs?: number;
        maxContentLength?: number;
        allowPrivate?: boolean;
        checkDns?: boolean;
        headers?: any;
        dispatcher?: any;
        fetchImpl?: typeof fetch;
        allowHosts?: string[];
        /** skip pre-resolving the redirect chain (for callers supplying their own safe fetcher) */
        resolveRedirects?: boolean;
        /** fetch the preview over an IP-pinned client instead of `link-preview-js` */
        pinDns?: boolean;
        [key: string]: any;
    };
    uploadImage?: any;
    logger?: any;
    /** JAP: optional replacement for `link-preview-js`'s `getLinkPreview` (proxy/cache/test double) */
    fetcher?: (url: string, options?: any) => Promise<any>;
}): Promise<{
    'canonical-url': any;
    'matched-text': any;
    title: any;
    description: any;
    originalThumbnailUrl: any;
    jpegThumbnail?: Buffer;
    highQualityThumbnail?: any;
} | undefined>;

/**
 * A drop-in `opts.fetcher` that fetches preview metadata over an IP-pinned connection,
 * so no third-party library re-resolves the hostname on our behalf. Parses OpenGraph,
 * Twitter card, `<title>` and `<meta name="description">` only.
 */
export function createPinnedLinkPreviewFetcher(fetcherOpts?: {
    allowPrivate?: boolean;
    allowHosts?: string[];
    timeoutMs?: number;
    maxRedirects?: number;
    headers?: any;
}): (url: string, opts?: any) => Promise<{
    url: string;
    title?: string;
    siteName?: string;
    description?: string;
    mediaType?: string;
    contentType?: string;
    images?: string[];
    favicons?: string[];
}>;
