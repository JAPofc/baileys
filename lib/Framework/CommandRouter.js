/**
 * lib/Framework/CommandRouter.js
 * Author: J.AP (@japofc/baileys)
 *
 * A batteries-included command router for the Bot framework. The bare
 * `Bot.command()` only does word-boundary prefix matching — real bots need
 * configurable prefixes, aliases, argument/flag parsing, per-user cooldowns,
 * permission gates (owner / group-only / DM-only / group-admin), and a help
 * screen that stays in sync with what's registered. This provides all of that
 * as ONE middleware you drop into the existing `use()` chain.
 *
 * The dispatch core is pure and clock-injectable, so it unit-tests without a
 * live socket: `handle(ctx)` reads `ctx.text` / `ctx.isGroup` / `ctx.sender`
 * and calls `ctx.reply(...)`, all of which a plain object can supply.
 *
 * Argument parsing reuses the vendored `args-parser` (tokenizeArgs/parseArgs/
 * parseCommand) so quoting and `--flags` behave exactly as documented there.
 */
import { parseCommand, parseArgs } from '../Utils/args-parser.js';
import { areJidsSameUser, isJidGroup, jidNormalizedUser } from '../WABinary/index.js';
import defaultLogger from '../Utils/logger.js';

/** Reasons `handle()` can decline to run a command (stable strings for callers). */
export const CommandOutcome = Object.freeze({
    NO_PREFIX: 'no-prefix',
    EMPTY: 'empty',
    UNKNOWN: 'unknown-command',
    DISABLED: 'disabled',
    PERMISSION: 'permission-denied',
    COOLDOWN: 'cooldown',
    OK: 'ok',
    ERROR: 'handler-error'
});

/** Permission sub-reasons surfaced on a PERMISSION outcome. */
export const PermissionReason = Object.freeze({
    OWNER: 'owner-only',
    GROUP: 'group-only',
    PRIVATE: 'private-only',
    ADMIN: 'admin-only',
    BOT_ADMIN: 'bot-admin-required',
    CUSTOM: 'custom'
});

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const fmtDuration = (ms) => {
    const s = Math.ceil(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return rem ? `${m}m ${rem}s` : `${m}m`;
};

export class CommandRouter {
    /**
     * @param {object} [opts]
     * @param {string|string[]} [opts.prefixes='!'] accepted command prefixes
     * @param {string[]} [opts.ownerJids=[]] JIDs treated as bot owners
     * @param {boolean} [opts.caseInsensitive=true] l-case the command word for matching
     * @param {number} [opts.cooldownMs=0] default per-user cooldown for every command
     * @param {(ctx)=>boolean|Promise<boolean>} [opts.isAdmin] resolve group-admin status of ctx.sender
     * @param {(ctx)=>boolean|Promise<boolean>} [opts.isBotAdmin] resolve whether the bot itself is a group admin
     * @param {()=>number} [opts.now=Date.now] injectable clock (for cooldowns/tests)
     * @param {object} [opts.logger]
     * @param {(ctx,info)=>any} [opts.onUnknown] called when a valid-prefix word matches no command
     * @param {(ctx,info)=>any} [opts.onPermissionDenied]
     * @param {(ctx,info)=>any} [opts.onCooldown]
     * @param {(ctx,info)=>any} [opts.onError] handler threw
     */
    constructor(opts = {}) {
        this.prefixes = asArray(opts.prefixes ?? '!').filter((p) => typeof p === 'string' && p.length);
        if (!this.prefixes.length) this.prefixes = ['!'];
        this.caseInsensitive = opts.caseInsensitive ?? true;
        this.defaultCooldownMs = opts.cooldownMs ?? 0;
        this.now = typeof opts.now === 'function' ? opts.now : Date.now;
        this.logger = opts.logger ?? defaultLogger.child({ module: 'Framework.CommandRouter' });
        this.ownerJids = new Set(asArray(opts.ownerJids).map((j) => jidNormalizedUser(j)).filter(Boolean));
        this._isAdmin = opts.isAdmin;
        this._isBotAdmin = opts.isBotAdmin;
        this.onUnknown = opts.onUnknown;
        this.onPermissionDenied = opts.onPermissionDenied;
        this.onCooldown = opts.onCooldown;
        this.onError = opts.onError;

        /** @type {Map<string, object>} canonical name → definition */
        this.commands = new Map();
        /** @type {Map<string, string>} alias/name (lowercased when caseInsensitive) → canonical name */
        this._lookup = new Map();
        /** @type {Map<string, number>} `${name}\u0000${sender}` → cooldown-expiry ts */
        this._cooldowns = new Map();
    }

    _key(name) {
        return this.caseInsensitive ? String(name).toLowerCase() : String(name);
    }

    /**
     * Register a command. Two call styles:
     *   command('ping', handler)
     *   command({ name, aliases, handler, description, usage, category, cooldownMs,
     *             ownerOnly, groupOnly, privateOnly, adminOnly, botAdmin,
     *             hidden, disabled, booleans, alias, defaults, permission })
     */
    command(defOrName, maybeHandler) {
        const def = typeof defOrName === 'string'
            ? { name: defOrName, handler: maybeHandler }
            : { ...defOrName };
        if (!def.name || typeof def.name !== 'string') {
            throw new TypeError('CommandRouter.command: a string `name` is required');
        }
        if (typeof def.handler !== 'function') {
            throw new TypeError(`CommandRouter.command("${def.name}"): a handler function is required`);
        }
        def.aliases = asArray(def.aliases).filter((a) => typeof a === 'string' && a.length);
        def.category = def.category || 'General';
        def.cooldownMs = def.cooldownMs ?? this.defaultCooldownMs;
        def.description = def.description || '';
        def.usage = def.usage || '';

        const canonical = this._key(def.name);
        const names = [def.name, ...def.aliases];
        for (const n of names) {
            const key = this._key(n);
            const existing = this._lookup.get(key);
            if (existing && existing !== canonical) {
                throw new Error(`CommandRouter: "${n}" already registered by command "${existing}"`);
            }
        }
        this.commands.set(canonical, def);
        for (const n of names) this._lookup.set(this._key(n), canonical);
        return this;
    }

    /** Register many at once (array of definitions). */
    register(defs) {
        for (const d of asArray(defs)) this.command(d);
        return this;
    }

    /** Remove a command (by name or any alias). Returns true if something was removed. */
    remove(name) {
        const canonical = this._lookup.get(this._key(name));
        if (!canonical) return false;
        const def = this.commands.get(canonical);
        this.commands.delete(canonical);
        for (const n of [def.name, ...def.aliases]) this._lookup.delete(this._key(n));
        return true;
    }

    /** Look up a command definition by name or alias. */
    get(name) {
        return this.commands.get(this._lookup.get(this._key(name)) ?? '\u0000');
    }

    has(name) {
        return this._lookup.has(this._key(name));
    }

    /** All registered command definitions (deduped), optionally including hidden. */
    list({ includeHidden = false } = {}) {
        return [...this.commands.values()].filter((d) => includeHidden || !d.hidden);
    }

    /** Distinct categories in registration order. */
    categories({ includeHidden = false } = {}) {
        const seen = [];
        for (const d of this.list({ includeHidden })) {
            if (!seen.includes(d.category)) seen.push(d.category);
        }
        return seen;
    }

    /**
     * Build a human-readable help string from the registry, grouped by category.
     * @param {object} [opts]
     * @param {string} [opts.category] limit to one category
     * @param {string} [opts.prefix] prefix to show (defaults to the first configured)
     * @param {string} [opts.title]
     * @param {boolean} [opts.includeHidden=false]
     */
    help({ category, prefix, title = '*Commands*', includeHidden = false } = {}) {
        const p = prefix ?? this.prefixes[0];
        const cats = category ? [category] : this.categories({ includeHidden });
        const lines = [title];
        for (const cat of cats) {
            const cmds = this.list({ includeHidden }).filter((d) => d.category === cat);
            if (!cmds.length) continue;
            lines.push('', `*${cat}*`);
            for (const d of cmds) {
                const usage = d.usage ? ` ${d.usage}` : '';
                const desc = d.description ? ` — ${d.description}` : '';
                lines.push(`• ${p}${d.name}${usage}${desc}`);
            }
        }
        return lines.join('\n');
    }

    /** Detailed help for a single command (or null if unknown). */
    describe(name, { prefix } = {}) {
        const d = this.get(name);
        if (!d) return null;
        const p = prefix ?? this.prefixes[0];
        const lines = [`*${p}${d.name}*`];
        if (d.description) lines.push(d.description);
        if (d.usage) lines.push(`Usage: ${p}${d.name} ${d.usage}`);
        if (d.aliases.length) lines.push(`Aliases: ${d.aliases.map((a) => p + a).join(', ')}`);
        if (d.cooldownMs) lines.push(`Cooldown: ${fmtDuration(d.cooldownMs)}`);
        const gates = [];
        if (d.ownerOnly) gates.push('owner');
        if (d.adminOnly) gates.push('group admin');
        if (d.groupOnly) gates.push('groups only');
        if (d.privateOnly) gates.push('DM only');
        if (gates.length) lines.push(`Requires: ${gates.join(', ')}`);
        return lines.join('\n');
    }

    /** Clear a user's cooldown for a command (or every cooldown when name omitted). */
    resetCooldown(name, sender) {
        if (name == null) {
            this._cooldowns.clear();
            return;
        }
        const canonical = this._lookup.get(this._key(name));
        if (!canonical) return;
        if (sender == null) {
            for (const k of [...this._cooldowns.keys()]) {
                if (k.startsWith(canonical + '\u0000')) this._cooldowns.delete(k);
            }
        } else {
            this._cooldowns.delete(`${canonical}\u0000${jidNormalizedUser(sender) || sender}`);
        }
    }

    /** Remaining cooldown in ms for (command, sender); 0 when ready. */
    cooldownRemaining(name, sender) {
        const canonical = this._lookup.get(this._key(name));
        if (!canonical) return 0;
        const key = `${canonical}\u0000${jidNormalizedUser(sender) || sender}`;
        const expiry = this._cooldowns.get(key);
        if (!expiry) return 0;
        return Math.max(0, expiry - this.now());
    }

    isOwner(jid) {
        if (!jid || !this.ownerJids.size) return false;
        for (const owner of this.ownerJids) {
            if (areJidsSameUser(owner, jid)) return true;
        }
        return false;
    }

    async _resolveAdmin(ctx) {
        if (typeof ctx?.isSenderAdmin === 'function') return !!(await ctx.isSenderAdmin());
        if (typeof ctx?.isSenderAdmin === 'boolean') return ctx.isSenderAdmin;
        if (this._isAdmin) return !!(await this._isAdmin(ctx));
        return false;
    }

    async _resolveBotAdmin(ctx) {
        if (typeof ctx?.isBotAdmin === 'function') return !!(await ctx.isBotAdmin());
        if (typeof ctx?.isBotAdmin === 'boolean') return ctx.isBotAdmin;
        if (this._isBotAdmin) return !!(await this._isBotAdmin(ctx));
        return false;
    }

    /**
     * Parse + dispatch one message context. Never throws — a throwing handler is
     * routed to onError and reported as an ERROR outcome.
     * @returns {Promise<{matched:boolean, executed:boolean, outcome:string, command?:string, reason?:string, remainingMs?:number, error?:Error}>}
     */
    async handle(ctx) {
        const text = ctx?.text;
        if (typeof text !== 'string' || !text.trim()) {
            return { matched: false, executed: false, outcome: CommandOutcome.EMPTY };
        }
        const parsed = parseCommand(text, { prefixes: this.prefixes, lowerCommand: this.caseInsensitive });
        if (!parsed) {
            return { matched: false, executed: false, outcome: CommandOutcome.NO_PREFIX };
        }
        const def = this.get(parsed.command);
        if (!def) {
            if (this.onUnknown) await this.onUnknown(ctx, { command: parsed.command, prefix: parsed.prefix });
            return { matched: false, executed: false, outcome: CommandOutcome.UNKNOWN, command: parsed.command };
        }
        if (def.disabled) {
            return { matched: true, executed: false, outcome: CommandOutcome.DISABLED, command: def.name };
        }

        const isGroup = ctx.isGroup ?? (ctx.remoteJid ? isJidGroup(ctx.remoteJid) : false);
        const sender = ctx.sender ?? ctx.message?.key?.participant ?? ctx.remoteJid;

        // --- permission gates ---
        let deny = null;
        if (def.ownerOnly && !this.isOwner(sender)) deny = PermissionReason.OWNER;
        else if (def.groupOnly && !isGroup) deny = PermissionReason.GROUP;
        else if (def.privateOnly && isGroup) deny = PermissionReason.PRIVATE;
        else if (def.adminOnly && isGroup && !(await this._resolveAdmin(ctx))) deny = PermissionReason.ADMIN;
        else if (def.botAdmin && isGroup && !(await this._resolveBotAdmin(ctx))) deny = PermissionReason.BOT_ADMIN;
        else if (typeof def.permission === 'function' && !(await def.permission(ctx))) deny = PermissionReason.CUSTOM;

        if (deny) {
            const info = { command: def.name, reason: deny, def };
            if (this.onPermissionDenied) await this.onPermissionDenied(ctx, info);
            return { matched: true, executed: false, outcome: CommandOutcome.PERMISSION, command: def.name, reason: deny };
        }

        // --- cooldown ---
        const cdKey = `${this._key(def.name)}\u0000${jidNormalizedUser(sender) || sender || ''}`;
        if (def.cooldownMs > 0 && !this.isOwner(sender)) {
            const expiry = this._cooldowns.get(cdKey);
            const nowTs = this.now();
            if (expiry && nowTs < expiry) {
                const remainingMs = expiry - nowTs;
                const info = { command: def.name, remainingMs, def };
                if (this.onCooldown) await this.onCooldown(ctx, info);
                return { matched: true, executed: false, outcome: CommandOutcome.COOLDOWN, command: def.name, remainingMs };
            }
        }

        // --- argument parsing (augment ctx) ---
        const parsedArgs = parseArgs(parsed.argString, {
            booleans: def.booleans,
            alias: def.alias,
            defaults: def.defaults
        });
        const { _: positionals, ...flags } = parsedArgs;
        ctx.command = def.name;
        ctx.prefix = parsed.prefix;
        ctx.args = positionals;
        ctx.argString = parsed.argString;
        ctx.flags = flags;
        ctx.matchedCommand = def;

        // set cooldown BEFORE running the handler so a slow handler can't be spammed
        if (def.cooldownMs > 0 && !this.isOwner(sender)) {
            this._cooldowns.set(cdKey, this.now() + def.cooldownMs);
        }

        try {
            await def.handler(ctx);
            return { matched: true, executed: true, outcome: CommandOutcome.OK, command: def.name };
        } catch (error) {
            // a failed run shouldn't hold the cooldown hostage
            this._cooldowns.delete(cdKey);
            if (this.onError) {
                await this.onError(ctx, { command: def.name, error, def });
            } else {
                this.logger.error({ err: error, command: def.name }, 'command handler threw');
            }
            return { matched: true, executed: false, outcome: CommandOutcome.ERROR, command: def.name, error };
        }
    }

    /** Adapt this router to the Bot `use((ctx,next)=>{})` middleware signature. */
    middleware() {
        return async (ctx, next) => {
            const result = await this.handle(ctx);
            if (!result.matched && typeof next === 'function') await next();
            return result;
        };
    }
}

/**
 * Build an `isAdmin(ctx)` resolver backed by a live socket's group metadata,
 * with a short TTL cache so a burst of commands doesn't hammer the server.
 * @param {object} sock a connected socket (needs groupMetadata)
 * @param {object} [opts]
 * @param {number} [opts.cacheMs=60000]
 */
export const createGroupAdminResolver = (sock, { cacheMs = 60000 } = {}) => {
    const cache = new Map(); // jid -> { at, admins:Set<normalizedUser> }
    const load = async (jid, now) => {
        const hit = cache.get(jid);
        if (hit && now - hit.at < cacheMs) return hit.admins;
        const meta = await sock.groupMetadata(jid);
        const admins = new Set(
            (meta?.participants ?? [])
                .filter((p) => p.admin === 'admin' || p.admin === 'superadmin')
                .map((p) => jidNormalizedUser(p.id))
                .filter(Boolean)
        );
        cache.set(jid, { at: now, admins });
        return admins;
    };
    return async (ctx) => {
        const jid = ctx?.remoteJid;
        const sender = ctx?.sender ?? ctx?.message?.key?.participant;
        if (!jid || !sender) return false;
        try {
            const admins = await load(jid, Date.now());
            const norm = jidNormalizedUser(sender);
            for (const a of admins) {
                if (areJidsSameUser(a, norm)) return true;
            }
            return false;
        } catch {
            return false;
        }
    };
};
