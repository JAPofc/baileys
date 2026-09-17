import type { makeCommunitiesSocket } from './communities.js';

/** Mex query IDs captured from live WA Web sessions (may rotate with WA updates). */
export interface UsernameQueryIds {
    CHECK: string;
    CHECK_MULTI: string;
    SET: string;
    GET: string;
    GET_RECOMMENDATIONS: string;
    PIN_SET: string;
}
export declare const USERNAME_QUERY_IDS: UsernameQueryIds;
/** Type twin of the const above (lets `import('…').USERNAME_QUERY_IDS` resolve in type position). */
export type USERNAME_QUERY_IDS = UsernameQueryIds;

/**
 * Fetch the freshest USERNAME_QUERY_IDS from the repo's main branch (used by
 * `autoRotateQueryIds`). Never throws — resolves to the pinned fallback set
 * (`isLatest: false`) on any failure.
 */
export declare const fetchLatestUsernameQueryIds: (options?: {
    timeoutMs?: number;
    dispatcher?: unknown;
}) => Promise<{ queryIds: UsernameQueryIds; isLatest: boolean }>;

export interface UsernameCheckResult {
    SUCCESS: 'SUCCESS';
    INVALID: 'INVALID';
}
export declare const USERNAME_CHECK_RESULT: UsernameCheckResult;
/** Type twin of the const above. */
export type USERNAME_CHECK_RESULT = UsernameCheckResult;

export interface UsernameSource {
    FB: 'FB';
    IG: 'IG';
    USER_INPUT: 'USER_INPUT';
    SUGGESTION: 'SUGGESTION';
}
export declare const USERNAME_SOURCE: UsernameSource;
/** Type twin of the const above. */
export type USERNAME_SOURCE = UsernameSource;

export interface SetUsernameOptions {
    source?: string;
    sessionId?: string;
    pin?: string;
    reserved?: boolean;
}

export interface CheckUsernameResult {
    available: boolean;
    username: string;
    suggestions?: any[];
    rejectionReasons?: any[];
    suggestionsEligible?: boolean;
}

export interface FoundUsernameUser {
    jid: string;
    contact: boolean;
}

/**
 * WhatsApp Username socket layer: check, set, pin, find, and recommend
 * usernames. (Method list mirrors the makeWASocket return type in
 * Socket/index.d.ts — keep both in sync.)
 */
export interface UsernameSocketMethods {
    /** Check username availability (with suggestions when taken). */
    checkUsername: (username: string, includeSuggestions?: boolean) => Promise<CheckUsernameResult>;
    /** Check multiple usernames at once. */
    checkUsernameMulti: (usernames: string[]) => Promise<any>;
    /** Set own username. */
    setUsername: (username: string, options?: SetUsernameOptions) => Promise<any>;
    /** Reserve a username (WA 2026 reservation flow — same endpoint, `reserved: true`). */
    reserveUsername: (username: string, options?: SetUsernameOptions) => Promise<any>;
    /** Delete / unset own username. */
    deleteUsername: () => Promise<any>;
    /** Get own username (null when unset). */
    getMyUsername: () => Promise<string | null>;
    /** Pin/unpin username (requires PIN). */
    setUsernamePin: (pin: string) => Promise<any>;
    /** Find a user by username (USync). Null when not found. */
    findUserByUsername: (username: string, pin?: string) => Promise<FoundUsernameUser | null>;
    /** Fetch usernames of known contacts (USync). */
    fetchContactUsernames: (...jids: string[]) => Promise<any[]>;
    /** Get username recommendations. */
    getUsernameRecommendations: (source?: string | null) => Promise<any>;
}

export declare const makeUsernameSocket: (config: any) => ReturnType<typeof makeCommunitiesSocket> & UsernameSocketMethods;
