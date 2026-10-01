/** One media upload host advertised by the `media_conn` handshake. */
export interface MediaConnHost {
    hostname: string;
    /** Omitted when the server sends no usable value (never `NaN`). */
    maxContentLengthBytes?: number;
}

/** The parsed `media_conn` record used by the uploader. */
export interface MediaConnInfo {
    hosts: MediaConnHost[];
    auth: string | undefined;
    /** Always a finite positive number; falls back to `MEDIA_CONN_DEFAULT_TTL`. */
    ttl: number;
    fetchDate: Date;
}

/** Fallback lifetime (seconds) when the server omits or mangles `ttl`. */
export declare const MEDIA_CONN_DEFAULT_TTL: number;

/**
 * Parse a `<media_conn>` node. Numeric attributes can never come out as `NaN`, which used
 * to freeze the upload handshake in a permanently "not expired" state (BUGREPORT §2.45).
 */
export declare function parseMediaConnNode(
    mediaConnNode: { tag?: string; attrs?: Record<string, any>; content?: any } | null | undefined,
    options?: { now?: number }
): MediaConnInfo;

/**
 * Whether a cached media connection must be re-fetched. Anything unusable (missing record,
 * no fetch date, non-finite or non-positive ttl) counts as expired.
 */
export declare function isMediaConnExpired(
    media: { ttl?: number; fetchDate?: Date | number } | null | undefined,
    now?: number
): boolean;
