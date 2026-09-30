/**
 * JAP@Add --- Type declarations for the command router.
 */
export declare const extractCommandText: (webMessage: any) => string;
export interface RouterContext {
    sock: any;
    msg: any;
    key: any;
    jid: string;
    sender: string;
    isGroup: boolean;
    /** Text of the replied-to message, or ''. */
    readonly quotedText: string;
    /** Jids mentioned in this message. */
    readonly mentions: string[];
    /** Sender is in RouterOptions.owners. */
    isOwner: boolean;
    pushName: string;
    text: string;
    raw: string;
    command: string;
    args: string[];
    reply: (content: any, opts?: any) => Promise<any>;
    react: (emoji: string) => Promise<any>;
}
export interface RouterDenial {
    reason: 'groupOnly' | 'dmOnly' | 'ownerOnly' | 'adminOnly' | 'cooldown';
    remainingMs?: number;
}
export interface RouterCommandOptions {
    desc?: string;
    category?: string;
    /** Per-user cooldown for this command in ms. */
    cooldownMs?: number;
    /** Only group admins may run it (group metadata is cached). */
    adminOnly?: boolean;
    /** Only jids from RouterOptions.owners may run it. */
    ownerOnly?: boolean;
    groupOnly?: boolean;
    dmOnly?: boolean;
    /** Excluded from the help menu. */
    hidden?: boolean;
}
export interface RouterOptions {
    prefix?: string | string[];
    ignoreMe?: boolean;
    help?: boolean;
    onError?: (err: any, ctx: RouterContext) => void;
    /** Owner jids for ownerOnly commands (device suffixes tolerated). */
    owners?: string | string[];
    /** Called when a guard blocks a command. */
    onDenied?: (ctx: RouterContext, denial: RouterDenial) => void;
    /** Group-admin cache TTL in ms. Default 60000. */
    adminCacheTtlMs?: number;
    /** Called for prefixed-but-unknown commands (message counts as handled). */
    onUnknownCommand?: (ctx: RouterContext) => any;
}
export interface Router {
    command(names: string | string[], handler: (ctx: RouterContext) => any, opts?: RouterCommandOptions): Router;
    use(mw: (ctx: RouterContext, next: () => Promise<void>) => any): Router;
    /** Unregister a command and all its aliases. */
    remove(name: string): boolean;
    handle(sock: any, webMessage: any): Promise<boolean>;
    attach(sock: any): () => void;
    list(): Array<{
        names: string[];
        desc: string;
        category: string;
        cooldownMs: number;
        adminOnly: boolean;
        ownerOnly: boolean;
        groupOnly: boolean;
        dmOnly: boolean;
        hidden: boolean;
    }>;
}
export declare const createRouter: (opts?: RouterOptions) => Router;
