/**
 * JAP@Add --- "Mini App" sender.
 *
 * Two delivery modes (both are real WhatsApp "mini app" patterns):
 *
 * 1. `url` — rich interactive card + CTA button opening your web app
 *    (in-app webview when supported, else the system browser). Optional
 *    `params` are appended as query string, so the app knows who opened it.
 * 2. `flow` — WhatsApp Flows button (`flow_action`): a TRUE native in-chat
 *    mini app (forms/screens rendered inside WhatsApp, no browser at all).
 *    Requires a flow ID registered & published in Flows Manager. Both modes
 *    can be combined — the card then carries two buttons.
 *
 * ```js
 * import { sendMiniApp } from '@japofc/baileys'
 * await sendMiniApp(sock, jid, {
 *   title: 'My Mini App',
 *   body: 'Tap the button to open the app 👇',
 *   url: 'https://myapp.example.com',
 *   params: { ref: 'wa-bot' },          // → ?ref=wa-bot
 *   flow: { id: '123456789', cta: '📝 Isi Form', screen: 'WELCOME' }, // optional
 *   thumbnail: 'https://myapp.example.com/icon.png', // url or Buffer (optional)
 * })
 * ```
 */
import { Boom } from '@hapi/boom';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { fetchBuffer } from './messages-media.js';
export const MINI_APP_DEFAULT_BUTTON_TEXT = '🚀 Open App';
const MAX_THUMBNAIL_BYTES = 512 * 1024;
const resolveThumbnail = async (thumbnail, options = {}) => {
    if (!thumbnail) {
        return undefined;
    }
    if (Buffer.isBuffer(thumbnail)) {
        return thumbnail;
    }
    if (typeof thumbnail === 'string') {
        let buf;
        try {
            buf = await fetchBuffer(thumbnail, {
                timeoutMs: options.thumbnailTimeoutMs ?? options.timeoutMs ?? 10_000,
                maxContentLength: options.thumbnailMaxBytes ?? MAX_THUMBNAIL_BYTES,
                allowPrivate: !!options.allowPrivateThumbnail,
                headers: options.thumbnailHeaders,
                dispatcher: options.dispatcher,
                fetchImpl: options.fetchImpl
            });
        }
        catch (err) {
            if (err instanceof Boom) throw err;
            throw new Boom(`miniApp.thumbnail: failed to fetch ${thumbnail} (${err?.message || err})`, { statusCode: 400 });
        }
        if (!buf.length || buf.length > (options.thumbnailMaxBytes ?? MAX_THUMBNAIL_BYTES)) {
            throw new Boom(`miniApp.thumbnail: must be 1–${options.thumbnailMaxBytes ?? MAX_THUMBNAIL_BYTES} bytes`, { statusCode: 400 });
        }
        return buf;
    }
    throw new Boom('miniApp.thumbnail must be a Buffer or a URL string', { statusCode: 400 });
};
const normalizeFlowConfig = (flow) => {
    if (!flow) {
        return undefined;
    }
    const cfg = typeof flow === 'string' ? { id: flow } : flow;
    if (!cfg || typeof cfg !== 'object' || !cfg.id || typeof cfg.id !== 'string') {
        throw new Boom('miniApp.flow.id is required (your published WhatsApp Flow ID)', { statusCode: 400 });
    }
    return cfg;
};
const appendUrlParams = (link, params) => {
    if (!params || typeof params !== 'object' || !Object.keys(params).length) {
        return link;
    }
    let u;
    try {
        u = new URL(link);
    }
    catch {
        throw new Boom(`miniApp.url is not a valid URL: ${link}`, { statusCode: 400 });
    }
    for (const [k, v] of Object.entries(params)) {
        u.searchParams.set(k, String(v));
    }
    return u.toString();
};
/**
 * Build `sendMessage`-ready content for a Mini App card.
 * Needs `url`, `flow`, or both. Thumbnail failures are non-fatal: the card is
 * still built, just without the image.
 */
export const buildMiniAppContent = async ({ title, body, text, url, appUrl, flow, params, secret, expiresIn, buttonText, buttons = [], footer, thumbnail, useWebview = true, openWebview = false, onThumbnailError, thumbnailTimeoutMs, thumbnailMaxBytes, allowPrivateThumbnail, thumbnailHeaders, dispatcher, fetchImpl, ...passthrough } = {}) => {
    const link = url || appUrl;
    const flowCfg = normalizeFlowConfig(flow);
    if ((!link || typeof link !== 'string') && !flowCfg) {
        throw new Boom('miniApp needs either `url` (webview app) or `flow` (WhatsApp Flow) — or both', { statusCode: 400 });
    }
    const mainText = body || text;
    if (!mainText || typeof mainText !== 'string') {
        throw new Boom('miniApp.body (or text) is required', { statusCode: 400 });
    }
    // JAP@Add --- when a `secret` (or `expiresIn`) is supplied, sign the opener
    // URL via createMiniAppLink so the web app can verify + expire it; otherwise
    // keep the plain, backward-compatible query append.
    const finalUrl = link
        ? (secret || expiresIn != null ? createMiniAppLink(link, params, { secret, expiresIn }) : appendUrlParams(link, params))
        : undefined;
    let thumb;
    try {
        thumb = await resolveThumbnail(thumbnail, { thumbnailTimeoutMs, thumbnailMaxBytes, allowPrivateThumbnail, thumbnailHeaders, dispatcher, fetchImpl });
    }
    catch (err) {
        if (typeof onThumbnailError === 'function') {
            try {
                onThumbnailError(err);
            }
            catch { }
        }
    }
    const cardTitle = title || 'Mini App';
    // JAP@Add (v2.4.6): `openWebview` opt-in emits a REAL in-app webview button
    // (native-flow `open_webview`) instead of `cta_url`. Default stays `cta_url`
    // because it renders on regular (non-Business) accounts, whereas `open_webview`
    // needs the in-app-webview capability — so we don't silently regress existing
    // callers. `useWebview` still toggles cta_url's (WA-ignored) webview_interaction
    // flag for backward compatibility.
    const urlButton = finalUrl
        ? (openWebview
            ? { buttonText: buttonText || MINI_APP_DEFAULT_BUTTON_TEXT, webview: { url: finalUrl, inAppWebview: true } }
            : { buttonText: buttonText || MINI_APP_DEFAULT_BUTTON_TEXT, url: finalUrl, useWebview })
        : undefined;
    const nativeFlow = [
        ...(urlButton ? [urlButton] : []),
        ...(flowCfg ? [{ buttonText: flowCfg.cta || '📝 Open', flow: flowCfg }] : []),
        ...buttons
    ];
    const content = {
        text: mainText,
        footer: footer ?? cardTitle,
        nativeFlow,
        ...passthrough
    };
    // NOTE: only attach `thumbnail` when we actually have one — the ad-reply
    // builder throws on a present-but-non-Buffer thumbnail value.
    if (finalUrl) {
        const externalAdReply = {
            title: cardTitle,
            body: mainText.slice(0, 120),
            url: finalUrl,
            mediaType: 1,
            largeThumbnail: !!thumb
        };
        if (thumb) {
            externalAdReply.thumbnail = thumb;
        }
        content.externalAdReply = content.externalAdReply || externalAdReply;
    }
    return content;
};
/**
 * Standalone sender (same style as `sendButtons` / `sendInteractiveMessage`):
 * `sendMiniApp(sock, jid, miniApp, options?)`. A `sock.sendMiniApp` alias exists too.
 */
export const sendMiniApp = async (sock, jid, miniApp, options = {}) => {
    if (!sock || typeof sock.sendMessage !== 'function') {
        throw new Boom('sendMiniApp(sock, ...) requires an active Baileys socket', { statusCode: 400 });
    }
    return sock.sendMessage(jid, await buildMiniAppContent(miniApp), options);
};

/**
 * JAP@Add --- canonical, order-independent serialization of the params that get
 * signed. `sig` itself is never part of its own signature. Shared by the link
 * builder and every verifier so sign/verify can never disagree.
 */
const canonicalPayload = (searchParams) =>
    [...searchParams.entries()]
        .filter(([k]) => k !== 'sig')
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => `${k}=${v}`)
        .join('&');

/**
 * JAP@Add --- build a mini-app deep link with optional HMAC-signed params, so
 * your web app can verify the opener came from your bot untampered — and,
 * optionally, that the link hasn't expired.
 *
 * `createMiniAppLink('https://app.example.com', { uid: '123' }, { secret })`
 *   → `'https://app.example.com/?uid=123&sig=…'`
 * `createMiniAppLink(url, { uid: '1' }, { secret, expiresIn: 3600 })`
 *   → adds a signed `exp` (unix seconds); the link stops verifying after an hour.
 *
 * @param {string} baseUrl
 * @param {Record<string, string|number|boolean>} [params]
 * @param {object} [opts]
 * @param {string} [opts.secret] HMAC-SHA256 key; when set, a `sig` is appended
 * @param {number} [opts.expiresIn] lifetime in SECONDS from now (signed into `exp`)
 * @param {() => number} [opts.now=Date.now] injectable clock (ms)
 */
export const createMiniAppLink = (baseUrl, params = {}, { secret, expiresIn, audience, nonce, now = Date.now } = {}) => {
    let u;
    try {
        u = new URL(baseUrl);
    }
    catch {
        throw new Boom(`miniApp.url is not a valid URL: ${baseUrl}`, { statusCode: 400 });
    }
    for (const [k, v] of Object.entries(params || {})) {
        u.searchParams.set(k, String(v));
    }
    if (expiresIn != null) {
        const secs = Number(expiresIn);
        if (!Number.isFinite(secs) || secs <= 0) {
            throw new Boom('miniApp.expiresIn must be a positive number of seconds', { statusCode: 400 });
        }
        u.searchParams.set('exp', String(Math.floor(now() / 1000) + Math.floor(secs)));
    }
    // Bind the link to a single opener (e.g. the recipient JID) so a shared/leaked
    // link is rejected for anyone else — only meaningful when signed with `secret`.
    if (audience != null && audience !== '') {
        u.searchParams.set('aud', String(audience));
    }
    // One-time token: pair with a nonce store on the verify side to reject replays.
    if (nonce != null && nonce !== '') {
        u.searchParams.set('nonce', String(nonce));
    }
    if (secret) {
        u.searchParams.set('sig', createHmac('sha256', secret).update(canonicalPayload(u.searchParams)).digest('hex'));
    }
    return u.toString();
};

/**
 * JAP@Add --- single-use nonce store for one-time mini-app / webview links.
 * `issue()` mints a nonce you embed in a signed link (via `createMiniAppLink`'s
 * `nonce` option); `consume(nonce)` returns `true` exactly once per issued nonce
 * and `false` for unknown, already-used, or expired nonces — so a captured link
 * can't be replayed. Purely in-memory; inject `now` for testing.
 *
 * @param {object} [opts]
 * @param {number} [opts.ttlMs=600000]  how long an issued nonce stays valid (10 min)
 * @param {number} [opts.max=10000]     cap on tracked nonces (oldest pruned)
 * @param {() => number} [opts.now=Date.now]
 */
export const createNonceStore = ({ ttlMs = 10 * 60 * 1000, max = 10000, now = Date.now } = {}) => {
    const entries = new Map(); // nonce -> { issuedAt, consumed }
    const prune = () => {
        const cutoff = now() - ttlMs;
        for (const [n, e] of entries) {
            if (e.issuedAt < cutoff) entries.delete(n);
        }
        while (entries.size > max) {
            const oldest = entries.keys().next().value;
            if (oldest === undefined) break;
            entries.delete(oldest);
        }
    };
    return {
        issue(size = 16) {
            prune();
            const bytes = Math.max(8, Math.floor(size));
            let n;
            do {
                n = createHmac('sha256', String(Math.random())).update(String(now()) + Math.random()).digest('hex').slice(0, bytes * 2);
            } while (entries.has(n));
            entries.set(n, { issuedAt: now(), consumed: false });
            return n;
        },
        consume(nonce) {
            if (typeof nonce !== 'string' || !nonce) return false;
            const e = entries.get(nonce);
            if (!e) return false;                       // never issued (or already pruned)
            if (e.consumed) return false;               // replay
            if (e.issuedAt < now() - ttlMs) {           // expired
                entries.delete(nonce);
                return false;
            }
            e.consumed = true;
            return true;
        },
        has(nonce) { return entries.has(nonce); },
        clear() { entries.clear(); },
        get size() { return entries.size; }
    };
};

/**
 * JAP@Add --- parse + (optionally) verify a mini-app link's params.
 * Throws `Boom(403)` when `secret` is given and the signature is missing/invalid,
 * or when a signed `exp` timestamp is in the past. `exp` is only tamper-proof
 * when the link was signed with a `secret`.
 *
 * @param {string} link
 * @param {object} [opts]
 * @param {string} [opts.secret]
 * @param {() => number} [opts.now=Date.now]
 */
export const parseMiniAppParams = (link, { secret, now = Date.now, audience, nonceStore } = {}) => {
    let u;
    try {
        u = new URL(link);
    }
    catch {
        throw new Boom(`miniApp.url is not a valid URL: ${link}`, { statusCode: 400 });
    }
    const out = {};
    for (const [k, v] of u.searchParams.entries()) {
        if (k !== 'sig') {
            out[k] = v;
        }
    }
    if (secret) {
        const sig = u.searchParams.get('sig') || '';
        const expect = createHmac('sha256', secret).update(canonicalPayload(u.searchParams)).digest('hex');
        const ok = sig.length === expect.length && (() => { try { return timingSafeEqual(Buffer.from(sig), Buffer.from(expect)); } catch { return false; } })();
        if (!ok) {
            throw new Boom('miniApp.params: invalid signature', { statusCode: 403 });
        }
    }
    if (out.exp !== undefined) {
        const exp = Number(out.exp);
        if (!Number.isFinite(exp) || Math.floor(now() / 1000) > exp) {
            throw new Boom('miniApp.params: link expired', { statusCode: 403 });
        }
    }
    // Audience binding: the link was minted for one opener; reject anyone else.
    if (audience != null && audience !== '') {
        if (String(out.aud ?? '') !== String(audience)) {
            throw new Boom('miniApp.params: audience mismatch', { statusCode: 403 });
        }
    }
    // One-time nonce: reject unknown / already-used / expired tokens (replay guard).
    if (nonceStore) {
        if (!out.nonce || !nonceStore.consume(out.nonce)) {
            throw new Boom('miniApp.params: nonce invalid or already used', { statusCode: 403 });
        }
    }
    return out;
};

/**
 * JAP@Add --- server-side convenience: verify a request that arrived from a
 * mini-app opener. Accepts a full URL, a raw query string (`'uid=1&sig=…'`, with
 * or without a leading `?`), or a params object (e.g. Express `req.query`).
 * Returns the clean params (minus `sig`) or throws `Boom(403)` like
 * `parseMiniAppParams`.
 */
export const verifyMiniAppRequest = (input, opts = {}) => {
    if (typeof input === 'string') {
        const s = input.trim();
        const link = /^https?:\/\//i.test(s) ? s : `https://mini.app/?${s.replace(/^[?&]+/, '')}`;
        return parseMiniAppParams(link, opts);
    }
    if (input && typeof input === 'object') {
        const u = new URL('https://mini.app/');
        for (const [k, v] of Object.entries(input)) {
            if (v != null) u.searchParams.set(k, Array.isArray(v) ? String(v[0]) : String(v));
        }
        return parseMiniAppParams(u.toString(), opts);
    }
    throw new Boom('verifyMiniAppRequest: expected a URL, query string, or params object', { statusCode: 400 });
};

/**
 * JAP@Add --- read a mini-app / WhatsApp Flow submission coming back IN chat
 * (an `interactiveResponseMessage.nativeFlowResponseMessage`). Accepts a full
 * WAMessage, its `.message`, or the inner message object. Returns
 * `{ name, version, params, flowToken, body }` or `null` when the message isn't
 * a flow response. `params` is always an object (invalid JSON → `{}`).
 */
export const parseMiniAppResponse = (message) => {
    const inner = message?.message ?? message;
    const interactive = inner?.interactiveResponseMessage
        ?? inner?.viewOnceMessage?.message?.interactiveResponseMessage
        ?? inner?.ephemeralMessage?.message?.interactiveResponseMessage;
    const native = interactive?.nativeFlowResponseMessage;
    if (!native) {
        return null;
    }
    let params = {};
    try {
        params = native.paramsJson ? JSON.parse(native.paramsJson) : {};
    }
    catch {
        params = {};
    }
    if (!params || typeof params !== 'object') {
        params = {};
    }
    return {
        name: native.name || undefined,
        version: native.version,
        params,
        flowToken: params.flow_token,
        body: interactive?.body?.text
    };
};


/**
 * JAP@Add --- build a WhatsApp Flows `data_exchange` action payload
 * (`{ version, action, data, token? }`) for the `flow.actionPayload` shortcut.
 */
export const buildFlowDataExchange = (action, data = {}, { version = '3.0', token } = {}) => {
    if (!action || typeof action !== 'string') {
        throw new Boom('flow action is required (e.g. navigate, data_exchange)', { statusCode: 400 });
    }
    return { version, action, data, ...(token ? { token } : {}) };
};

/**
 * JAP@Add --- build a WhatsApp Flows `navigate` action payload targeting a
 * specific screen: `{ version, action:'navigate', data: { screen, ...data } }`.
 * The screen name goes INSIDE `data` (where the Flows runtime expects it), so
 * this is the correct shape to drop straight into `flow.actionPayload`.
 */
export const buildFlowNavigate = (screen, data = {}, { version = '3.0', token } = {}) => {
    if (!screen || typeof screen !== 'string') {
        throw new Boom('flow navigate: a target screen name is required', { statusCode: 400 });
    }
    return buildFlowDataExchange('navigate', { screen, ...data }, { version, token });
};
