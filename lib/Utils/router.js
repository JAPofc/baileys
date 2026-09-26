/**
 * JAP@Add --- Minimal command router for prefix bots.
 *
 * ```js
 * import { createRouter } from '@japofc/baileys'
 * const router = createRouter({ prefix: '!' })
 * router.command('ping', async (ctx) => ctx.reply('pong! 🏓'), { desc: 'Check bot' })
 * router.command(['hi', 'hello'], async (ctx) => ctx.reply(`Hello @${ctx.sender.split('@')[0]}!`))
 * router.attach(sock) // listens to messages.upsert; returns detach()
 * ```
 *
 * Context: `{ sock, msg, key, jid, sender, pushName, text, raw, command, args,
 * reply(), react() }`. A `help`/`menu` command is registered automatically
 * (disable with `{ help: false }`). Handler errors go to `onError`
 * (default: `console.error`, router keeps running).
 */
import { extractMessageContent } from './messages.js';
/** Pull reply-able text out of any incoming message (text/extended/captions). */
export const extractCommandText = (webMessage) => {
    const content = extractMessageContent(webMessage?.message);
    if (!content) {
        return '';
    }
    return content.conversation
        || content.extendedTextMessage?.text
        || content.imageMessage?.caption
        || content.videoMessage?.caption
        || '';
};
export const createRouter = ({ prefix = '!', ignoreMe = true, help = true, onError, owners = [], onDenied, adminCacheTtlMs = 60_000 } = {}) => {
    const prefixes = (Array.isArray(prefix) ? prefix : [prefix]).filter((p) => typeof p === 'string' && p);
    const commands = new Map();
    const middlewares = [];
    // JAP@Upgrade (guards): owner set is device-suffix tolerant —
    // 'me:12@s.whatsapp.net' and 'me@s.whatsapp.net' both match.
    const stripDevice = (jid) => String(jid || '').replace(/:\d+(?=@)/, '');
    const ownerSet = new Set((Array.isArray(owners) ? owners : [owners]).filter(Boolean).map(stripDevice));
    const cooldowns = new Map(); // `${command}:${sender}` -> lastRunAt
    const adminCache = new Map(); // groupJid -> { at, admins: Set }
    const handleError = typeof onError === 'function'
        ? onError
        : (err, ctx) => console.error(`[router:${ctx?.command || '?'}]`, err);
    const denied = typeof onDenied === 'function' ? onDenied : () => { };
    const getAdmins = async (sock, groupJid) => {
        const cached = adminCache.get(groupJid);
        if (cached && Date.now() - cached.at < adminCacheTtlMs) {
            return cached.admins;
        }
        const meta = await sock.groupMetadata(groupJid);
        const admins = new Set();
        for (const p of meta?.participants || []) {
            if (p.admin) {
                admins.add(stripDevice(p.id));
            }
        }
        adminCache.set(groupJid, { at: Date.now(), admins });
        return admins;
    };
    // Returns null when allowed, or a denial descriptor.
    const checkGuards = async (sock, ctx, entry) => {
        const { groupOnly, dmOnly, ownerOnly, adminOnly, cooldownMs } = entry.opts;
        if (groupOnly && !ctx.isGroup) {
            return { reason: 'groupOnly' };
        }
        if (dmOnly && ctx.isGroup) {
            return { reason: 'dmOnly' };
        }
        if (ownerOnly && !ownerSet.has(stripDevice(ctx.sender))) {
            return { reason: 'ownerOnly' };
        }
        if (adminOnly) {
            if (!ctx.isGroup) {
                return { reason: 'adminOnly' };
            }
            let admins;
            try {
                admins = await getAdmins(sock, ctx.jid);
            }
            catch {
                return { reason: 'adminOnly' }; // metadata unavailable → deny safely
            }
            if (!admins.has(stripDevice(ctx.sender))) {
                return { reason: 'adminOnly' };
            }
        }
        if (cooldownMs) {
            const key = `${entry.names[0]}:${ctx.sender}`;
            const last = cooldowns.get(key) || 0;
            const remainingMs = last + cooldownMs - Date.now();
            if (remainingMs > 0) {
                return { reason: 'cooldown', remainingMs };
            }
            cooldowns.set(key, Date.now());
            if (cooldowns.size > 10_000) {
                const oldest = cooldowns.keys().next().value;
                cooldowns.delete(oldest);
            }
        }
        return null;
    };
    const parse = (text) => {
        const clean = String(text || '').trim();
        if (!clean) {
            return null;
        }
        const hit = prefixes.find((p) => clean.startsWith(p));
        if (!hit) {
            return null;
        }
        const [command, ...args] = clean.slice(hit.length).trim().split(/\s+/).filter(Boolean);
        if (!command) {
            return null;
        }
        return { command: command.toLowerCase(), args, raw: clean };
    };
    const makeCtx = (sock, webMessage, parsed) => {
        const key = webMessage.key || {};
        const jid = key.remoteJid;
        const sender = key.participant || jid;
        return {
            sock,
            msg: webMessage,
            key,
            jid,
            sender,
            isGroup: typeof jid === 'string' && jid.endsWith('@g.us'),
            pushName: webMessage.pushName || '',
            text: parsed.raw,
            raw: parsed.raw,
            command: parsed.command,
            args: parsed.args,
            reply: (content, opts = {}) => sock.sendMessage(jid, typeof content === 'string' ? { text: content } : content, { quoted: webMessage, ...opts }),
            react: (emoji) => sock.sendMessage(jid, { react: { text: emoji, key } })
        };
    };
    const runMiddlewares = async (ctx, handler) => {
        let index = -1;
        const next = async () => {
            index++;
            if (index < middlewares.length) {
                await middlewares[index](ctx, next);
            }
            else {
                await handler(ctx);
            }
        };
        await next();
    };
    const router = {
        /**
         * Register `command('name' | ['alias', ...], handler, opts)`.
         * opts: `{ desc, category, cooldownMs, adminOnly, ownerOnly,
         * groupOnly, dmOnly }` — guard denials go to the router-level
         * `onDenied(ctx, denial)` callback.
         */
        command(names, handler, { desc = '', category = '', cooldownMs = 0, adminOnly = false, ownerOnly = false, groupOnly = false, dmOnly = false } = {}) {
            const list = (Array.isArray(names) ? names : [names])
                .map((n) => String(n || '').toLowerCase())
                .filter(Boolean);
            if (!list.length || typeof handler !== 'function') {
                throw new TypeError("router.command(names, handler) requires name(s) + function");
            }
            const entry = {
                handler,
                desc: String(desc || ''),
                names: list,
                opts: { category: String(category || ''), cooldownMs, adminOnly, ownerOnly, groupOnly, dmOnly }
            };
            for (const name of list) {
                commands.set(name, entry);
            }
            return router;
        },
        /** Register middleware `(ctx, next) => { ...; await next() }`. */
        use(mw) {
            if (typeof mw !== 'function') {
                throw new TypeError('router.use(mw) requires a function');
            }
            middlewares.push(mw);
            return router;
        },
        /** Handle one incoming message. Returns true when a command matched. */
        async handle(sock, webMessage) {
            if (!webMessage?.key || (ignoreMe && webMessage.key.fromMe)) {
                return false;
            }
            const parsed = parse(extractCommandText(webMessage));
            if (!parsed) {
                return false;
            }
            const entry = commands.get(parsed.command);
            if (!entry) {
                return false;
            }
            const ctx = makeCtx(sock, webMessage, parsed);
            try {
                const denial = await checkGuards(sock, ctx, entry);
                if (denial) {
                    denied(ctx, denial);
                    return true; // matched, but blocked by a guard
                }
                await runMiddlewares(ctx, entry.handler);
            }
            catch (err) {
                handleError(err, ctx);
            }
            return true;
        },
        /** Attach to `sock.ev('messages.upsert')`. Returns a detach function. */
        attach(sock) {
            const onUpsert = ({ messages } = {}) => {
                for (const m of messages || []) {
                    void router.handle(sock, m);
                }
            };
            sock.ev.on('messages.upsert', onUpsert);
            return () => {
                try {
                    sock.ev.off('messages.upsert', onUpsert);
                }
                catch { }
            };
        },
        /** List registered primary command names (for custom help screens). */
        list() {
            const seen = new Set();
            const out = [];
            for (const entry of commands.values()) {
                if (seen.has(entry)) {
                    continue;
                }
                seen.add(entry);
                out.push({ names: entry.names, desc: entry.desc, ...entry.opts });
            }
            return out;
        }
    };
    if (help) {
        router.command(['help', 'menu'], async (ctx) => {
            // JAP@Upgrade: menu grouped by category when categories are used.
            const all = router.list();
            const hasCategories = all.some(c => c.category);
            const line = ({ names, desc, adminOnly, ownerOnly }) => {
                const badge = ownerOnly ? ' 👑' : adminOnly ? ' 🛡️' : '';
                return `• ${prefixes[0]}${names[0]}${badge}${desc ? ` — ${desc}` : ''}`;
            };
            let body;
            if (hasCategories) {
                const groups = new Map();
                for (const cmd of all) {
                    const cat = cmd.category || 'General';
                    if (!groups.has(cat)) {
                        groups.set(cat, []);
                    }
                    groups.get(cat).push(line(cmd));
                }
                body = [...groups].map(([cat, lines]) => `*${cat}*\n${lines.join('\n')}`).join('\n\n');
            }
            else {
                body = all.map(line).join('\n');
            }
            await ctx.reply(`🤖 *Bot Menu*\n\n${body || '(no commands)'}`);
        }, { desc: 'Show this menu' });
    }
    return router;
};
