import type { USyncError } from '../Utils/usync-result.js';

/** A single entry of a parsed USync list: the protocol results plus the user's jid. */
export interface USyncQueryResultEntry {
    id: string;
    [protocol: string]: any;
}

/** The parsed shape of a USync IQ. */
export interface USyncQueryResult {
    list: USyncQueryResultEntry[];
    sideList: USyncQueryResultEntry[];
    /** Server-reported errors; empty when the query succeeded (v2.4.7, BUGREPORT §2.49). */
    errors: USyncError[];
}

export class USyncQuery {
    protocols: any[];
    users: any[];
    context: string;
    mode: string;
    withMode(mode: any): this;
    withContext(context: any): this;
    withUser(user: any): this;
    /** Queue several users at once; null/undefined entries are ignored (v2.4.7). */
    withUsers(...users: any[]): this;
    /** `undefined` when the IQ is not a `result` — callers must handle that. */
    parseUSyncQueryResult(result: any): USyncQueryResult | undefined;
    withDeviceProtocol(): this;
    withContactProtocol(): this;
    /** JAP (§2.139): the short text status (with emoji) shown next to a name. */
    withTextStatusProtocol(): this;
    /** JAP (§2.139): which capabilities each contact's device supports. */
    withFeatureProtocol(features?: string[]): this;
    /** JAP (§2.139): request the server-side `side_list`. */
    withSidelistProtocol(useLidAddressing?: boolean): this;
    /** JAP (§2.134): profile pictures for the whole batch in one round trip. */
    withPictureProtocol(type?: 'image' | 'preview'): this;
    /** JAP (§2.134): business details for the whole batch in one round trip. */
    withBusinessProtocol(profileVersion?: string | number): this;
    withStatusProtocol(): this;
    withDisappearingModeProtocol(): this;
    withBotProfileProtocol(): this;
    withLIDProtocol(): this;
    withUsernameProtocol(): this;
}
