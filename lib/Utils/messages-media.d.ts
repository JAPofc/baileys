/** generates all the keys required to encrypt/decrypt & sign a media message */
export function getMediaKeys(buffer: any, mediaType: any): Promise<{
    iv: any;
    cipherKey: any;
    macKey: any;
}>;
export function getAudioDuration(buffer: any): Promise<any>;
/**
  referenced from and modifying https://github.com/wppconnect-team/wa-js/blob/main/src/chat/functions/prepareAudioWaveform.ts
 */
/**
 * Reduce raw PCM samples (one channel) to WhatsApp's 64-bucket waveform, 0..100 per bucket.
 * Clips shorter than 64 samples are handled (§2.208).
 */
export function computeAudioWaveform(rawData: ArrayLike<number>, samples?: number): Uint8Array;
export function getAudioWaveform(buffer: any, logger: any): Promise<Uint8Array<ArrayBuffer> | undefined>;
/** generates a thumbnail for a given media, if required */
export function generateThumbnail(file: any, mediaType: any, options: any): Promise<{
    thumbnail: any;
    originalImageDimensions: {
        width: any;
        height: any;
    } | undefined;
}>;
export function extensionForMediaMessage(message: any): any;
export function getImageProcessingLibrary(): Promise<any>;
export function hkdfInfoKey(type: any): string;
export function getRawMediaUploadData(media: any, mediaType: any, logger: any): Promise<{
    filePath: any;
    fileSha256: any;
    fileLength: number;
}>;
export function extractVideoThumb(path: any, time: any, size: any): Promise<any>;
export function extractImageThumb(bufferOrFilePath: any, width?: number): Promise<{
    buffer: any;
    original: {
        width: any;
        height: any;
    };
}>;
export function encodeBase64EncodedStringForUpload(b64: any): string;
/** Where a `cover` crop takes its square from. */
export declare const PROFILE_PICTURE_POSITIONS: string[];
/**
 * Build the square JPEG WhatsApp wants for a profile picture. All image backends
 * centre-crop identically now; `fit: 'contain'` letterboxes instead of cropping.
 */
export declare function generateProfilePicture(mediaUpload: any, dimensions?: {
    width?: number;
    height?: number;
    fit?: 'cover' | 'contain';
    position?: 'centre' | 'center' | 'top' | 'bottom' | 'left' | 'right';
}): Promise<{ img: Buffer; width: number; height: number; fit: string; position: string }>;
export function mediaMessageSHA256B64(message: any): any;
export function toReadable(buffer: any): any;
export function toBuffer(stream: any): Promise<any>;
export function getStream(item: any, opts: any): Promise<{
    stream: any;
    type: string;
}>;
export function isPrivateHost(hostname: string): boolean;
/** Strip the brackets a URL keeps around an IPv6 literal (`[::1]` -> `::1`). */
export function unbracketHost(hostname: string): string;
export function assertSafeHttpUrl(url: any, options?: {
    /** disable the private/loopback check entirely */
    allowPrivate?: boolean;
    /** also reject hosts whose DNS records point at a private address (default true) */
    checkDns?: boolean;
    /**
     * Hosts exempted from the private/loopback check, e.g. `['127.0.0.1', 'media.lan']`.
     * Lets you reach your own intranet host without switching the guard off for
     * everything else. Compared case-insensitively; IPv6 brackets optional.
     */
    allowHosts?: string[];
}): Promise<URL>;
/**
 * Walk a redirect chain with the full SSRF guard (including DNS resolution) on every hop
 * and return the final validated URL. For callers that cannot follow redirects safely
 * themselves.
 */
export function resolveSafeRedirectUrl(url: string | URL, options?: any): Promise<URL>;
/**
 * A `fetch`-compatible client that connects to the exact IP the SSRF guard validated,
 * closing the DNS-rebinding window between check and request. Never follows redirects.
 */
/** Test hook: pin the image backend (`{ sharp }` | `{ image }` | `{ jimp }`) or reset with null. */
export function _setImageProcessingLibrary(library?: any): void;
export function createPinnedFetch(pinOptions?: {
    allowPrivate?: boolean;
    allowHosts?: string[];
    timeoutMs?: number;
}): (input: string | URL, init?: {
    method?: string;
    headers?: any;
    timeoutMs?: number;
    signal?: AbortSignal;
}) => Promise<{
    status: number;
    statusText: string;
    ok: boolean;
    url: string;
    redirected: boolean;
    headers: { get(name: string): string | null; has(name: string): boolean; forEach(fn: (value: any, key: string) => void): void };
    body: NodeJS.ReadableStream & { cancel(): Promise<void> };
    text(): Promise<string>;
    json(): Promise<any>;
    arrayBuffer(): Promise<ArrayBuffer>;
}>;
/**
 * Fetch a URL as a stream. Every redirect hop is re-validated against the SSRF guard
 * (§2.207); `options.maxRedirects` caps the chain (default 5).
 */
export function getHttpStream(url: any, options?: any): Promise<any>;
export function fetchBuffer(url: any, options?: any): Promise<Buffer>;
export function encryptedStream(media: any, mediaType: any, { logger, saveOriginalFileIfRequired, opts }?: any): Promise<{
    mediaKey: any;
    originalFilePath: any;
    encFilePath: any;
    mac: any;
    fileEncSha256: any;
    fileSha256: any;
    fileLength: number;
}>;
export const DEF_MEDIA_HOST: "mmg.whatsapp.net";
export function getUrlFromDirectPath(directPath: any, host?: string): string;
export function downloadContentFromMessage({ mediaKey, directPath, url }: {
    mediaKey: any;
    directPath: any;
    url: any;
}, type: any, opts?: any): Promise<any>;
export function downloadEncryptedContent(downloadUrl: any, { cipherKey, iv }: {
    cipherKey: any;
    iv: any;
}, { startByte, endByte, options }?: any): Promise<any>;
export function uploadWithNodeHttp({ url, filePath, headers, timeoutMs, agent }: {
    url: any;
    filePath: any;
    headers: any;
    timeoutMs: any;
    agent: any;
}, redirectCount?: number): Promise<any>;
export function getWAUploadToServer({ customUploadHosts, fetchAgent, logger, options }: {
    customUploadHosts: any;
    fetchAgent: any;
    logger: any;
    options: any;
}, refreshMediaConn: any): (filePath: any, { mediaType, fileEncSha256B64, timeoutMs, newsletter }: {
    mediaType: any;
    fileEncSha256B64: any;
    timeoutMs: any;
    newsletter: any;
}) => Promise<{
    mediaUrl: any;
    directPath: any;
    meta_hmac: any;
    fbid: any;
    ts: any;
    thumbnailDirectPath: any;
    thumbnailSha256: any;
}>;
export function encryptMediaRetryRequest(key: any, mediaKey: any, meId: any): {
    tag: string;
    attrs: {
        id: any;
        to: string;
        type: string;
    };
    content: ({
        tag: string;
        attrs: {
            jid?: undefined;
            from_me?: undefined;
            participant?: undefined;
        };
        content: {
            tag: string;
            attrs: {};
            content: any;
        }[];
    } | {
        tag: string;
        attrs: {
            jid: any;
            from_me: string;
            participant: any;
        };
        content?: undefined;
    })[];
};
export function decodeMediaRetryNode(node: any): {
    key: {
        id: any;
        remoteJid: any;
        fromMe: boolean;
        participant: any;
    };
};
export function decryptMediaRetryData({ ciphertext, iv }: {
    ciphertext: any;
    iv: any;
}, mediaKey: any, msgId: any): any;
export function getStatusCodeForMediaRetry(code: any): number;

/** JAP@Add (§2.178) — pixel dimensions from a JPEG's frame header, or null. Dependency-free. */
export function jpegDimensions(buffer: unknown): { width: number; height: number } | null;
/** JAP@Add (§2.178) — native pixel dimensions of a video, or null. Costs one ffmpeg run. */
export function extractVideoDimensions(path: string, time?: string): Promise<{ width: number; height: number } | null>;
