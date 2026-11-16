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
    withStatusProtocol(): this;
    withDisappearingModeProtocol(): this;
    withBotProfileProtocol(): this;
    withLIDProtocol(): this;
    withUsernameProtocol(): this;
}
