/**
 * JAP@Add --- Minimal command router for prefix bots.
 *
 * ```js
 * import { createRouter } from '@j.ap/baileys'
 * const router = createRouter({ prefix: '!' })
 * router.command('ping', async (ctx) => ctx.reply('pong! 🏓'), { desc: 'Check bot' })
 * router.command(['hi', 'halo'], async (ctx) => ctx.reply(`Halo @${ctx.sender.split('@')[0]}!`))
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
export const createRouter = ({ prefix = '!', ignoreMe = true, help = true, onError } = {}) => {
    const prefixes = (Array.isArray(prefix) ? prefix : [prefix]).filter((p) => typeof p === 'string' && p);
    const commands = new Map();
    const middlewares = [];
    const handleError = typeof onError === 'function'
        ? onError
        : (err, ctx) => console.error(`[router:${ctx?.command || '?'}]`, err);
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
        /** Register `command('name' | ['alias', ...], handler, { desc })`. */
        command(names, handler, { desc = '' } = {}) {
            const list = (Array.isArray(names) ? names : [names])
                .map((n) => String(n || '').toLowerCase())
                .filter(Boolean);
            if (!list.length || typeof handler !== 'function') {
                throw new TypeError("router.command(names, handler) requires name(s) + function");
            }
            const entry = { handler, desc: String(desc || ''), names: list };
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
                out.push({ names: entry.names, desc: entry.desc });
            }
            return out;
        }
    };
    if (help) {
        router.command(['help', 'menu'], async (ctx) => {
            const lines = router.list().map(({ names, desc }) => `• ${prefixes[0]}${names[0]}${desc ? ` — ${desc}` : ''}`);
            await ctx.reply(`🤖 *Bot Menu*\n\n${lines.join('\n') || '(no commands)'}`);
        }, { desc: 'Show this menu' });
    }
    return router;
};
