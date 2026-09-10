/**
 * JAP@Add --- "Mini App" sender.
 *
 * Honest note: WhatsApp has NO html-message protocol, so a Mini App cannot run
 * raw HTML inside the chat. What this helper does instead is the closest native
 * equivalent: a rich interactive card (title + body + thumbnail preview) with a
 * CTA button that opens your web-app URL — inside WhatsApp's in-app webview when
 * the client supports it (`useWebview`), otherwise in the system browser.
 *
 * ```js
 * import { sendMiniApp } from '@j.ap/baileys'
 * await sendMiniApp(sock, jid, {
 *   title: 'My Mini App',
 *   body: 'Tap the button to open the app 👇',
 *   url: 'https://myapp.example.com',
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
/**
 * Build `sendMessage`-ready content for a Mini App card.
 * Thumbnail failures are non-fatal: the card is still built, just without the image.
 */
export const buildMiniAppContent = async ({ title, body, text, url, appUrl, buttonText, buttons = [], footer, thumbnail, useWebview = true, onThumbnailError, ...passthrough } = {}) => {
    const link = url || appUrl;
    if (!link || typeof link !== 'string') {
        throw new Boom('miniApp.url is required (your web-app URL)', { statusCode: 400 });
    }
    const mainText = body || text;
    if (!mainText || typeof mainText !== 'string') {
        throw new Boom('miniApp.body (or text) is required', { statusCode: 400 });
    }
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
    // NOTE: only attach `thumbnail` when we actually have one — the ad-reply
    // builder throws on a present-but-non-Buffer thumbnail value.
    const externalAdReply = {
        title: cardTitle,
        body: mainText.slice(0, 120),
        url: link,
        mediaType: 1,
        largeThumbnail: !!thumb
    };
    if (thumb) {
        externalAdReply.thumbnail = thumb;
    }
    return {
        text: mainText,
        footer: footer ?? cardTitle,
        nativeFlow: [
            { buttonText: buttonText || MINI_APP_DEFAULT_BUTTON_TEXT, url: link, useWebview },
            ...buttons
        ],
        externalAdReply,
        ...passthrough
    };
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
