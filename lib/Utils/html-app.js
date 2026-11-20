/**
 * lib/Utils/html-app.js — HTML apps, documents and artifacts.
 *
 * WhatsApp can render a self-contained HTML bundle two ways: as a *document* the recipient
 * opens (works on every account, no hosting), and as a *mini-app / webview* card (needs a
 * URL the client can reach). This module covers both, validates the bundle before it leaves
 * the process, and can stitch in a multiplayer session preamble so two recipients opening the
 * same artifact share a session id.
 *
 * Part of @japofc/baileys.
 */
import { Boom } from '@hapi/boom';
import { createHash, randomBytes } from 'crypto';
import { buildMiniAppContent } from './mini-app.js';
import { mintId } from './provenance.js';

/** The mime type WhatsApp expects for an HTML bundle. */
export const HTML_MIME_TYPE = 'text/html';
/** Practical ceiling for an inline bundle (clients choke well before this). */
export const HTML_APP_MAX_BYTES = 2 * 1024 * 1024;
/** Warn above this: big bundles are slow to open on low-end phones. */
export const HTML_APP_WARN_BYTES = 512 * 1024;
/** Default file name when the caller does not pick one. */
export const HTML_APP_DEFAULT_FILENAME = 'app.html';
/** The global the multiplayer preamble defines. */
export const HTML_APP_MULTIPLAYER_GLOBAL = '__JAP_MULTIPLAYER__';

const asHtmlString = (html, fn) => {
    const text = Buffer.isBuffer(html) || html instanceof Uint8Array
        ? Buffer.from(html).toString('utf8')
        : typeof html === 'string'
            ? html
            : null;
    if (text === null) {
        throw new Boom(`${fn}: pass the HTML as a string or a Buffer`, { statusCode: 400 });
    }
    if (!text.trim()) {
        throw new Boom(`${fn}: the HTML is empty`, { statusCode: 400 });
    }
    return text;
};

/**
 * Check an HTML bundle before sending it.
 *
 * ```js
 * checkHtmlApp(html)
 * // → { ok, bytes, errors: [], warnings: ['no <title>…'], hasScript, externalRefs: [...] }
 * ```
 * Errors mean "this will not render"; warnings mean "this will render badly".
 */
export const checkHtmlApp = (html, { maxBytes = HTML_APP_MAX_BYTES, warnBytes = HTML_APP_WARN_BYTES, allowExternal = true } = {}) => {
    const text = asHtmlString(html, 'checkHtmlApp');
    const bytes = Buffer.byteLength(text, 'utf8');
    const errors = [];
    const warnings = [];
    if (bytes > maxBytes) {
        errors.push(`bundle is ${bytes} bytes, over the ${maxBytes} byte limit`);
    }
    else if (bytes > warnBytes) {
        warnings.push(`bundle is ${bytes} bytes — slow to open on low-end devices`);
    }
    if (!/<html[\s>]/i.test(text)) {
        warnings.push('no <html> element — the client wraps loose markup, which can look off');
    }
    if (!/<title[\s>]/i.test(text)) {
        warnings.push('no <title> — the app shows its file name instead');
    }
    if (!/<meta[^>]+viewport/i.test(text)) {
        warnings.push('no viewport meta — the layout will not scale on phones');
    }
    // JAP@Fix (§2.201): the old pattern required quotes and an explicit http(s) scheme, so
    // `<script src=https://evil/x.js>` and `<script src="//evil/x.js">` both slipped past --
    // and with `allowExternal: false` that turned a security gate into a false reassurance.
    // Match quoted, single-quoted and bare attribute values, plus protocol-relative URLs.
    const externalRefs = [
        ...text.matchAll(/(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s">]+))/gi)
    ]
        .map(match => (match[1] ?? match[2] ?? match[3] ?? '').trim())
        .filter(url => /^(?:https?:)?\/\//i.test(url));
    if (externalRefs.length && !allowExternal) {
        errors.push(`${externalRefs.length} external reference(s) but allowExternal is false`);
    }
    else if (externalRefs.length) {
        warnings.push(`${externalRefs.length} external reference(s) — they fail when the client is offline`);
    }
    return {
        ok: errors.length === 0,
        bytes,
        errors,
        warnings,
        hasScript: /<script[\s>]/i.test(text),
        externalRefs: [...new Set(externalRefs)],
        sha256: createHash('sha256').update(text, 'utf8').digest('hex')
    };
};

/**
 * Turn any file-ish payload into the shape the media pipeline wants, with the metadata an
 * artifact card needs (name, mime, size, checksum).
 */
export const prepareFileArtifact = (input, { fileName, mimetype, caption } = {}) => {
    const data = Buffer.isBuffer(input) ? input
        : input instanceof Uint8Array ? Buffer.from(input)
            : typeof input === 'string' ? Buffer.from(input, 'utf8')
                : input?.data ? Buffer.from(input.data)
                    : null;
    if (!data?.length) {
        throw new Boom('prepareFileArtifact: pass a Buffer, a string, or { data }', { statusCode: 400 });
    }
    const name = fileName ?? input?.fileName ?? HTML_APP_DEFAULT_FILENAME;
    const mime = mimetype ?? input?.mimetype ?? (name.endsWith('.html') || name.endsWith('.htm') ? HTML_MIME_TYPE : 'application/octet-stream');
    return {
        fileName: name,
        mimetype: mime,
        fileLength: data.length,
        sha256: createHash('sha256').update(data).digest('hex'),
        ...(caption ? { caption } : {}),
        document: data
    };
};

/**
 * The script the multiplayer preamble injects: a frozen session descriptor every copy of the
 * artifact can read, so two people opening the same bundle agree on the session id.
 */
export const htmlMultiplayerPrelude = ({ sessionId, participants = [], host, maxPlayers, startedAt = Date.now() } = {}) => {
    const id = String(sessionId || mintId('MPAP'));
    const people = (Array.isArray(participants) ? participants : [participants]).filter(Boolean).map(String);
    if (maxPlayers !== undefined && (!Number.isInteger(maxPlayers) || maxPlayers < 2)) {
        throw new Boom('htmlMultiplayerPrelude: "maxPlayers" must be an integer >= 2', {
            statusCode: 400,
            data: { maxPlayers }
        });
    }
    if (maxPlayers !== undefined && people.length > maxPlayers) {
        throw new Boom(`htmlMultiplayerPrelude: ${people.length} participants exceeds maxPlayers ${maxPlayers}`, {
            statusCode: 400
        });
    }
    const session = {
        sessionId: id,
        participants: people,
        ...(host ? { host } : {}),
        ...(maxPlayers !== undefined ? { maxPlayers } : {}),
        startedAt
    };
    const json = JSON.stringify(session).replace(/</g, '\\u003c');
    return {
        sessionId: id,
        session,
        script: `<script>window.${HTML_APP_MULTIPLAYER_GLOBAL}=Object.freeze(${json});` +
            `window.dispatchEvent(new CustomEvent("jap:multiplayer",{detail:window.${HTML_APP_MULTIPLAYER_GLOBAL}}));</script>`
    };
};

/**
 * Inject the multiplayer preamble into a bundle (right after `<head>`, or at the top when
 * there is no head). Idempotent: injecting twice replaces the previous preamble.
 */
export const withHtmlMultiplayer = (html, options = {}) => {
    const text = asHtmlString(html, 'withHtmlMultiplayer');
    const prelude = htmlMultiplayerPrelude(options);
    const stripped = text.replace(new RegExp(`<script>window\\.${HTML_APP_MULTIPLAYER_GLOBAL}[\\s\\S]*?<\\/script>`), '');
    const headAt = stripped.search(/<head[^>]*>/i);
    const injected = headAt === -1
        ? prelude.script + stripped
        : stripped.slice(0, stripped.indexOf('>', headAt) + 1) + prelude.script + stripped.slice(stripped.indexOf('>', headAt) + 1);
    return { ...prelude, html: injected };
};

/**
 * Send an HTML bundle as a document — works on any account, no hosting required.
 *
 * ```js
 * await sendHtmlDocument(sock, jid, html, { fileName: 'invoice.html', caption: 'Your invoice' })
 * ```
 */
export const sendHtmlDocument = async (sock, jid, html, { fileName = HTML_APP_DEFAULT_FILENAME, caption, validate = true, ...options } = {}) => {
    if (typeof sock?.sendMessage !== 'function') {
        throw new Boom('sendHtmlDocument: a connected socket is required', { statusCode: 400 });
    }
    const text = asHtmlString(html, 'sendHtmlDocument');
    if (validate) {
        const report = checkHtmlApp(text);
        if (!report.ok) {
            throw new Boom(`sendHtmlDocument: ${report.errors.join('; ')}`, { statusCode: 400, data: report });
        }
    }
    const artifact = prepareFileArtifact(text, { fileName, mimetype: HTML_MIME_TYPE, caption });
    return sock.sendMessage(jid, {
        document: artifact.document,
        mimetype: HTML_MIME_TYPE,
        fileName: artifact.fileName,
        ...(caption ? { caption } : {})
    }, options);
};

/**
 * Send a file as an artifact card: the document plus a title/description line, so a generated
 * report or bundle arrives looking like an attachment card instead of a bare file.
 */
export const sendHtmlArtifact = async (sock, jid, input, { title, description, fileName, mimetype, ...options } = {}) => {
    if (typeof sock?.sendMessage !== 'function') {
        throw new Boom('sendHtmlArtifact: a connected socket is required', { statusCode: 400 });
    }
    const artifact = prepareFileArtifact(input, { fileName, mimetype });
    const caption = [title, description].filter(Boolean).join('\n');
    return sock.sendMessage(jid, {
        document: artifact.document,
        mimetype: artifact.mimetype,
        fileName: artifact.fileName,
        ...(caption ? { caption } : {})
    }, options);
};

/**
 * Send an HTML app as an openable card.
 *
 * With a `url` (where you host the bundle) it goes out as a webview/mini-app card. Without
 * one there is nothing for the client to open, so — rather than shipping a card that does
 * nothing — it falls back to {@link sendHtmlDocument} and tells you it did
 * (`{ mode: 'document' }`); pass `fallback: false` to make that an error instead.
 */
export const sendHtmlApp = async (sock, jid, html, { url, title, body, footer, buttonText, thumbnail, fallback = true, validate = true, fileName = HTML_APP_DEFAULT_FILENAME, ...options } = {}) => {
    if (typeof sock?.sendMessage !== 'function') {
        throw new Boom('sendHtmlApp: a connected socket is required', { statusCode: 400 });
    }
    const text = html === undefined || html === null ? null : asHtmlString(html, 'sendHtmlApp');
    if (text && validate) {
        const report = checkHtmlApp(text);
        if (!report.ok) {
            throw new Boom(`sendHtmlApp: ${report.errors.join('; ')}`, { statusCode: 400, data: report });
        }
    }
    if (!url) {
        if (!text) {
            throw new Boom('sendHtmlApp: pass either a hosted "url" or the HTML to send', { statusCode: 400 });
        }
        if (!fallback) {
            throw new Boom('sendHtmlApp: no "url" to open — host the bundle, or allow the document fallback', {
                statusCode: 400
            });
        }
        const message = await sendHtmlDocument(sock, jid, text, { fileName, caption: title, validate: false, ...options });
        return { mode: 'document', message };
    }
    const content = await buildMiniAppContent({
        url,
        title,
        body: body ?? title,
        footer,
        buttonText,
        thumbnail,
        useWebview: true
    });
    const message = await sock.sendMessage(jid, content, options);
    return { mode: 'webview', message };
};

/** A titled block of HTML for a rich card (the HTML is escaped-safe, never executed here). */
export const htmlSection = (title, html, { id, collapsed = false } = {}) => {
    const text = asHtmlString(html, 'htmlSection');
    const report = checkHtmlApp(text, { maxBytes: HTML_APP_MAX_BYTES });
    if (!report.ok) {
        throw new Boom(`htmlSection: ${report.errors.join('; ')}`, { statusCode: 400, data: report });
    }
    return {
        htmlSection: {
            ...(id ? { id } : {}),
            title: String(title ?? '').trim() || 'HTML',
            collapsed: !!collapsed,
            html: text,
            bytes: report.bytes,
            sha256: report.sha256
        }
    };
};

/** An inline media reference for an HTML app: a data URI the bundle can use directly. */
export const htmlMedia = (data, { mimetype = 'image/png', name } = {}) => {
    const buffer = Buffer.isBuffer(data) ? data : data instanceof Uint8Array ? Buffer.from(data) : null;
    if (!buffer?.length) {
        throw new Boom('htmlMedia: pass the media as a Buffer', { statusCode: 400 });
    }
    if (!/^[-\w.]+\/[-\w.+]+$/.test(mimetype)) {
        throw new Boom(`htmlMedia: "${mimetype}" is not a mime type`, { statusCode: 400, data: { mimetype } });
    }
    const dataUri = `data:${mimetype};base64,${buffer.toString('base64')}`;
    return {
        ...(name ? { name } : {}),
        mimetype,
        bytes: buffer.length,
        dataUri,
        img: `<img src="${dataUri}"${name ? ` alt="${String(name).replace(/"/g, '&quot;')}"` : ''}>`
    };
};
