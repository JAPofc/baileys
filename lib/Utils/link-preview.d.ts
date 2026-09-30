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
        [key: string]: any;
    };
    uploadImage?: any;
    logger?: any;
}): Promise<{
    'canonical-url': any;
    'matched-text': any;
    title: any;
    description: any;
    originalThumbnailUrl: any;
    jpegThumbnail?: Buffer;
    highQualityThumbnail?: any;
} | undefined>;
