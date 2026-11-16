import type { Context } from './Context.js';
import type { ILogger } from '../Utils/logger.js';

/** Stable outcome strings returned by CommandRouter.handle(). */
export const CommandOutcome: {
    readonly NO_PREFIX: 'no-prefix';
    readonly EMPTY: 'empty';
    readonly UNKNOWN: 'unknown-command';
    readonly DISABLED: 'disabled';
    readonly PERMISSION: 'permission-denied';
    readonly COOLDOWN: 'cooldown';
    readonly OK: 'ok';
    readonly ERROR: 'handler-error';
};
export type CommandOutcomeValue = (typeof CommandOutcome)[keyof typeof CommandOutcome];

/** Sub-reason surfaced on a permission-denied outcome. */
export const PermissionReason: {
    readonly OWNER: 'owner-only';
    readonly GROUP: 'group-only';
    readonly PRIVATE: 'private-only';
    readonly ADMIN: 'admin-only';
    readonly BOT_ADMIN: 'bot-admin-required';
    readonly CUSTOM: 'custom';
};
export type PermissionReasonValue = (typeof PermissionReason)[keyof typeof PermissionReason];

/** A command handler receives the (augmented) per-message context. */
export type CommandHandler = (ctx: Context) => unknown | Promise<unknown>;

export interface CommandDefinition {
    /** Primary command word (without prefix). */
    name: string;
    /** Alternative words that invoke the same command. */
    aliases?: string | string[];
    handler: CommandHandler;
    /** One-line description shown in help. */
    description?: string;
    /** Usage/argument hint shown in help (e.g. '<user> [amount]'). */
    usage?: string;
    /** Grouping label for help (default 'General'). */
    category?: string;
    /** Per-user cooldown in ms (owners are exempt). */
    cooldownMs?: number;
    /** Only bot owners may run it. */
    ownerOnly?: boolean;
    /** Only inside groups. */
    groupOnly?: boolean;
    /** Only in direct messages. */
    privateOnly?: boolean;
    /** Only group admins (uses the router's isAdmin resolver). */
    adminOnly?: boolean;
    /** Require the bot itself to be a group admin. */
    botAdmin?: boolean;
    /** Custom async gate; falsy return denies with reason 'custom'. */
    permission?: (ctx: Context) => boolean | Promise<boolean>;
    /** Hide from the generated help. */
    hidden?: boolean;
    /** Registered but temporarily inert. */
    disabled?: boolean;
    /** Flag names parsed as booleans (passed to args-parser). */
    booleans?: string[];
    /** Flag alias map (passed to args-parser). */
    alias?: Record<string, string>;
    /** Default flag values (passed to args-parser). */
    defaults?: Record<string, unknown>;
}

export interface CommandRouterOptions {
    prefixes?: string | string[];
    ownerJids?: string | string[];
    caseInsensitive?: boolean;
    cooldownMs?: number;
    isAdmin?: (ctx: Context) => boolean | Promise<boolean>;
    isBotAdmin?: (ctx: Context) => boolean | Promise<boolean>;
    now?: () => number;
    logger?: ILogger;
    onUnknown?: (ctx: Context, info: { command: string; prefix: string }) => unknown | Promise<unknown>;
    onPermissionDenied?: (ctx: Context, info: { command: string; reason: PermissionReasonValue; def: CommandDefinition }) => unknown | Promise<unknown>;
    onCooldown?: (ctx: Context, info: { command: string; remainingMs: number; def: CommandDefinition }) => unknown | Promise<unknown>;
    onError?: (ctx: Context, info: { command: string; error: Error; def: CommandDefinition }) => unknown | Promise<unknown>;
}

export interface HandleResult {
    matched: boolean;
    executed: boolean;
    outcome: CommandOutcomeValue;
    command?: string;
    reason?: PermissionReasonValue;
    remainingMs?: number;
    error?: Error;
}

/** Batteries-included command router: prefixes, aliases, args, cooldowns, permissions, help. */
export class CommandRouter {
    constructor(opts?: CommandRouterOptions);
    prefixes: string[];
    caseInsensitive: boolean;
    ownerJids: Set<string>;
    readonly commands: Map<string, CommandDefinition>;
    command(name: string, handler: CommandHandler): this;
    command(def: CommandDefinition): this;
    register(defs: CommandDefinition[]): this;
    remove(name: string): boolean;
    get(name: string): CommandDefinition | undefined;
    has(name: string): boolean;
    list(opts?: { includeHidden?: boolean }): CommandDefinition[];
    categories(opts?: { includeHidden?: boolean }): string[];
    help(opts?: { category?: string; prefix?: string; title?: string; includeHidden?: boolean }): string;
    describe(name: string, opts?: { prefix?: string }): string | null;
    resetCooldown(name?: string, sender?: string): void;
    cooldownRemaining(name: string, sender: string): number;
    isOwner(jid: string | undefined): boolean;
    handle(ctx: Context): Promise<HandleResult>;
    middleware(): (ctx: Context, next: () => Promise<void>) => Promise<HandleResult>;
}

/** Build an isAdmin(ctx) resolver backed by a live socket's group metadata (TTL-cached). */
export function createGroupAdminResolver(
    sock: { groupMetadata: (jid: string) => Promise<{ participants?: Array<{ id: string; admin?: string | null }> }> },
    opts?: { cacheMs?: number }
): (ctx: Context) => Promise<boolean>;
