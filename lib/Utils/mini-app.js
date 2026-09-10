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
 * import { sendMiniApp } from '@j.ap/baileys'
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
export const MINI_APP_DEFAULT_BUTTON_TEXT = '🚀 Open App';
const MAX_THUMBNAIL_BYTES = 512 * 1024;
const resolveThumbnail = async (thumbnail) => {
    if (!thumbnail) {
        return undefined;
    }
    if (Buffer.isBuffer(thumbnail)) {
        return thumbnail;
    }
    if (typeof thumbnail === 'string') {
        let res;
        try {
            res = await fetch(thumbnail);
        }
        catch (err) {
            throw new Boom(`miniApp.thumbnail: failed to fetch ${thumbnail} (${err?.message || err})`, { statusCode: 400 });
        }
        if (!res.ok) {
            throw new Boom(`miniApp.thumbnail: fetch failed with HTTP ${res.status}`, { statusCode: 400 });
        }
        const buf = Buffer.from(await res.arrayBuffer());
        if (!buf.length || buf.length > MAX_THUMBNAIL_BYTES) {
            throw new Boom(`miniApp.thumbnail: must be 1–${MAX_THUMBNAIL_BYTES} bytes`, { statusCode: 400 });
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
export const buildMiniAppContent = async ({ title, body, text, url, appUrl, flow, params, buttonText, buttons = [], footer, thumbnail, useWebview = true, onThumbnailError, ...passthrough } = {}) => {
    const link = url || appUrl;
    const flowCfg = normalizeFlowConfig(flow);
    if ((!link || typeof link !== 'string') && !flowCfg) {
        throw new Boom('miniApp needs either `url` (webview app) or `flow` (WhatsApp Flow) — or both', { statusCode: 400 });
    }
    const mainText = body || text;
    if (!mainText || typeof mainText !== 'string') {
        throw new Boom('miniApp.body (or text) is required', { statusCode: 400 });
    }
    const finalUrl = link ? appendUrlParams(link, params) : undefined;
    let thumb;
    try {
        thumb = await resolveThumbnail(thumbnail);
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
    const nativeFlow = [
        ...(finalUrl ? [{ buttonText: buttonText || MINI_APP_DEFAULT_BUTTON_TEXT, url: finalUrl, useWebview }] : []),
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
