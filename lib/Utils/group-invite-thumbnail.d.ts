/// <reference types="node" />
export declare const DEFAULT_GROUP_INVITE_THUMBNAIL_TTL_MS: number;
export declare const DEFAULT_GROUP_INVITE_THUMBNAIL_MAX: number;
export declare const DEFAULT_GROUP_INVITE_THUMBNAIL_TIMEOUT_MS: number;
export type GroupInviteThumbnailCacheOptions = {
    ttlMs?: number;
    max?: number;
    now?: () => number;
};
export type GroupInviteThumbnailCacheHit = {
    hit: boolean;
    value?: Buffer;
};
export type GroupInviteThumbnailCache = {
    readonly ttlMs: number;
    readonly max: number;
    readonly size: number;
    get(jid: string): GroupInviteThumbnailCacheHit;
    set(jid: string, value?: Buffer): Buffer | undefined;
    delete(jid: string): boolean;
    clear(): void;
};
export declare const createGroupInviteThumbnailCache: (opts?: GroupInviteThumbnailCacheOptions) => GroupInviteThumbnailCache;
export type FetchGroupInviteThumbnailOptions = {
    jid?: string;
    getProfilePicUrl?: (jid: string, type?: 'preview' | 'image') => Promise<string | undefined> | string | undefined;
    fetchImpl?: typeof fetch;
    dispatcher?: unknown;
    cache?: GroupInviteThumbnailCache;
    timeoutMs?: number;
    logger?: { debug?: (obj: unknown, msg?: string) => void };
};
export declare const fetchGroupInviteThumbnail: (opts?: FetchGroupInviteThumbnailOptions) => Promise<Buffer | undefined>;
