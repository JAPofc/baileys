/**
 * lib/Utils/content-extras.js — the small content builders: stickers with metadata,
 * music cards, social previews, comments, event invites, message associations, and the
 * section fragments rich cards are assembled from.
 *
 * Everything here is pure: it returns `sendMessage()`-ready content or a card fragment, so
 * it can be unit-tested, cached, and built in a worker.
 *
 * Part of @japofc/baileys.
 */
import { Boom } from '@hapi/boom';
import { proto } from '../../WAProto/index.js';

/** Hosts WhatsApp will render a music card for. */
export const MUSIC_ALLOWED_HOSTS = [
    'open.spotify.com',
    'music.apple.com',
    'music.youtube.com',
    'youtu.be',
    'www.youtube.com',
    'soundcloud.com',
    'music.amazon.com'
];
/** Sticker annotation kinds WhatsApp understands on a status/media. */
export const STICKER_TYPES = { LINK: 'link', LOCATION: 'location', MUSIC: 'music', CHANNEL: 'channel', MESSAGE: 'message' };
/** `MessageAssociation.AssociationType`, re-exported by name. */
export const MESSAGE_ASSOCIATION_TYPES = { ...proto.MessageAssociation.AssociationType };

const trimmed = (value, field, fn) => {
    const text = String(value ?? '').trim();
    if (!text) {
        throw new Boom(`${fn}: "${field}" is required`, { statusCode: 400 });
    }
    return text;
};

const assertUrl = (value, fn, { hosts } = {}) => {
    let parsed;
    try {
        parsed = new URL(String(value));
    }
    catch {
        throw new Boom(`${fn}: "${value}" is not a URL`, { statusCode: 400, data: { url: value } });
    }
    if (!/^https?:$/.test(parsed.protocol)) {
        throw new Boom(`${fn}: only http(s) URLs are allowed, got "${parsed.protocol}"`, { statusCode: 400 });
    }
    if (hosts && !hosts.includes(parsed.hostname)) {
        throw new Boom(`${fn}: "${parsed.hostname}" is not one of the supported hosts (${hosts.join(', ')})`, {
            statusCode: 400,
            data: { host: parsed.hostname, hosts }
        });
    }
    return parsed.toString();
};

// ── stickers ───────────────────────────────────────────────────────────────────
/** A link sticker placed on a status/photo. */
export const linkSticker = (url, { label, position } = {}) => ({
    type: STICKER_TYPES.LINK,
    url: assertUrl(url, 'linkSticker'),
    ...(label ? { label: String(label) } : {}),
    ...(position ? { position } : {})
});

/** A location sticker. */
export const locationSticker = ({ latitude, longitude, name, address, position } = {}) => {
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
        throw new Boom('locationSticker: "latitude" must be between -90 and 90', { statusCode: 400, data: { latitude } });
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        throw new Boom('locationSticker: "longitude" must be between -180 and 180', { statusCode: 400, data: { longitude } });
    }
    return {
        type: STICKER_TYPES.LOCATION,
        latitude,
        longitude,
        ...(name ? { name: String(name) } : {}),
        ...(address ? { address: String(address) } : {}),
        ...(position ? { position } : {})
    };
};

/** A music sticker (what is playing behind a status). */
export const musicSticker = ({ title, artist, url, artworkUrl, startMs = 0, position } = {}) => ({
    type: STICKER_TYPES.MUSIC,
    title: trimmed(title, 'title', 'musicSticker'),
    ...(artist ? { artist: String(artist) } : {}),
    ...(url ? { url: assertUrl(url, 'musicSticker', { hosts: MUSIC_ALLOWED_HOSTS }) } : {}),
    ...(artworkUrl ? { artworkUrl: assertUrl(artworkUrl, 'musicSticker') } : {}),
    startMs,
    ...(position ? { position } : {})
});

/** A channel mention sticker. */
export const channelSticker = (newsletterJid, { name, position } = {}) => {
    const jid = String(newsletterJid ?? '');
    if (!jid.endsWith('@newsletter')) {
        throw new Boom(`channelSticker: expected a @newsletter jid, got "${jid || 'nothing'}"`, { statusCode: 400 });
    }
    return {
        type: STICKER_TYPES.CHANNEL,
        newsletterJid: jid,
        ...(name ? { name: String(name) } : {}),
        ...(position ? { position } : {})
    };
};

/** A sticker that quotes another message. */
export const messageSticker = (key, { preview, position } = {}) => {
    if (!key?.id) {
        throw new Boom('messageSticker: a message key with an id is required', { statusCode: 400 });
    }
    return {
        type: STICKER_TYPES.MESSAGE,
        key,
        ...(preview ? { preview: String(preview) } : {}),
        ...(position ? { position } : {})
    };
};

/**
 * Normalise a mixed list of stickers: validates each one, clamps positions into 0..1, and
 * drops exact duplicates. Throws on an entry it cannot classify, naming the index.
 */
export const normalizeStickers = (stickers) => {
    const list = (Array.isArray(stickers) ? stickers : [stickers]).filter(Boolean);
    const seen = new Set();
    const out = [];
    list.forEach((sticker, index) => {
        if (!sticker?.type || !Object.values(STICKER_TYPES).includes(sticker.type)) {
            throw new Boom(`normalizeStickers: entry #${index} has no known type (use linkSticker/locationSticker/…)`, {
                statusCode: 400,
                data: { index, type: sticker?.type }
            });
        }
        const position = sticker.position
            ? {
                x: Math.min(1, Math.max(0, Number(sticker.position.x ?? 0.5))),
                y: Math.min(1, Math.max(0, Number(sticker.position.y ?? 0.5))),
                ...(sticker.position.scale !== undefined ? { scale: Number(sticker.position.scale) } : {}),
                ...(sticker.position.rotation !== undefined ? { rotation: Number(sticker.position.rotation) } : {})
            }
            : undefined;
        const normalized = { ...sticker, ...(position ? { position } : {}) };
        const fingerprint = JSON.stringify(normalized);
        if (seen.has(fingerprint)) {
            return;
        }
        seen.add(fingerprint);
        out.push(normalized);
    });
    return out;
};

/** Read the stickers back off a message (annotations + the sticker message itself). */
export const readStickers = (message) => {
    const content = message?.message ?? message;
    if (!content) {
        return [];
    }
    const found = [];
    if (content.stickerMessage) {
        found.push({ type: 'sticker', sticker: content.stickerMessage });
    }
    const annotations = content.messageContextInfo?.stickerAnnotations
        ?? content.stickerAnnotations
        ?? content.imageMessage?.annotations
        ?? content.videoMessage?.annotations
        ?? [];
    for (const annotation of annotations) {
        found.push(annotation?.type ? annotation : { type: 'unknown', annotation });
    }
    return found;
};

// ── music / social ─────────────────────────────────────────────────────────────
/** A music card (`{ music }` content for `sendMessage`). */
export const buildMusicMessage = ({ title, artist, songUri, artworkUri, durationMs, previewUri, countryBlocklist = [] } = {}) => ({
    music: {
        title: trimmed(title, 'title', 'buildMusicMessage'),
        ...(artist ? { artist: String(artist) } : {}),
        ...(songUri ? { songUri: assertUrl(songUri, 'buildMusicMessage', { hosts: MUSIC_ALLOWED_HOSTS }) } : {}),
        ...(artworkUri ? { artworkUri: assertUrl(artworkUri, 'buildMusicMessage') } : {}),
        ...(previewUri ? { previewUri: assertUrl(previewUri, 'buildMusicMessage') } : {}),
        ...(durationMs !== undefined ? { durationMs } : {}),
        ...(countryBlocklist.length ? { countryBlocklist } : {})
    }
});

/** Read a music card back out of a received message. */
export const readMusicMessage = (message) => {
    const content = message?.message ?? message;
    const music = content?.music ?? content?.musicMessage ?? content?.extendedTextMessage?.musicContent;
    if (!music) {
        return null;
    }
    return {
        title: music.title ?? null,
        artist: music.artist ?? null,
        songUri: music.songUri ?? null,
        artworkUri: music.artworkUri ?? null,
        durationMs: music.durationMs ?? null,
        host: music.songUri ? new URL(music.songUri).hostname : null
    };
};

/** A social link preview (the card above a shared post). */
export const buildSocialPreview = ({ url, title, description, thumbnail, author, platform, publishedAt } = {}) => ({
    socialPreview: {
        url: assertUrl(url, 'buildSocialPreview'),
        ...(title ? { title: String(title) } : {}),
        ...(description ? { description: String(description) } : {}),
        ...(thumbnail ? { thumbnail } : {}),
        ...(author ? { author: String(author) } : {}),
        platform: platform ?? new URL(String(url)).hostname.replace(/^www\./, ''),
        ...(publishedAt ? { publishedAt: publishedAt instanceof Date ? publishedAt.getTime() : Number(publishedAt) } : {})
    }
});

/** Read a social preview back (also recognises a plain externalAdReply card). */
export const readSocialPreview = (message) => {
    const content = message?.message ?? message;
    const preview = content?.socialPreview
        ?? content?.extendedTextMessage?.contextInfo?.externalAdReply;
    if (!preview) {
        return null;
    }
    return {
        url: preview.url ?? preview.sourceUrl ?? null,
        title: preview.title ?? null,
        description: preview.description ?? preview.body ?? null,
        author: preview.author ?? preview.sourceId ?? null,
        platform: preview.platform ?? (preview.sourceUrl ? new URL(preview.sourceUrl).hostname.replace(/^www\./, '') : null),
        thumbnail: preview.thumbnail ?? preview.thumbnailUrl ?? preview.jpegThumbnail ?? null
    };
};

// ── comments, events, associations ─────────────────────────────────────────────
/** A comment on a channel/status post (`commentMessage`). */
export const makeCommentMessage = (targetKey, text) => {
    const body = trimmed(text, 'text', 'makeCommentMessage');
    if (!targetKey?.id) {
        throw new Boom('makeCommentMessage: the target message key (with an id) is required', { statusCode: 400 });
    }
    return {
        commentMessage: {
            message: { extendedTextMessage: { text: body } },
            targetMessageKey: targetKey
        }
    };
};

/** A comment thread fragment for a rich card. */
export const commentSection = (comments, { title = 'Comments', total } = {}) => {
    const list = (Array.isArray(comments) ? comments : [comments])
        .filter(Boolean)
        .map(comment => (typeof comment === 'string' ? { text: comment } : comment))
        .filter(comment => comment.text);
    if (!list.length) {
        throw new Boom('commentSection: at least one comment is required', { statusCode: 400 });
    }
    return {
        comments: {
            title,
            total: total ?? list.length,
            items: list.map(comment => ({
                text: String(comment.text),
                ...(comment.author ? { author: String(comment.author) } : {}),
                ...(comment.timestamp ? { timestamp: Number(comment.timestamp) } : {})
            }))
        }
    };
};

/** An event invitation message (`eventInviteMessage`). */
export const makeEventInviteMessage = ({ eventId, eventTitle, startTime, endTime, caption, callLink, jpegThumbnail, isCanceled = false } = {}) => {
    const title = trimmed(eventTitle, 'eventTitle', 'makeEventInviteMessage');
    const start = startTime instanceof Date ? Math.floor(startTime.getTime() / 1000) : Number(startTime ?? 0) || undefined;
    const end = endTime instanceof Date ? Math.floor(endTime.getTime() / 1000) : Number(endTime ?? 0) || undefined;
    if (start && end && end < start) {
        throw new Boom('makeEventInviteMessage: "endTime" is before "startTime"', { statusCode: 400, data: { start, end } });
    }
    return {
        eventInviteMessage: {
            ...(eventId ? { eventId: String(eventId) } : {}),
            eventTitle: title,
            ...(start ? { startTime: start } : {}),
            ...(end ? { endTime: end } : {}),
            ...(caption ? { caption: String(caption) } : {}),
            ...(callLink ? { callLink: String(callLink) } : {}),
            ...(jpegThumbnail ? { jpegThumbnail } : {}),
            isCanceled: !!isCanceled
        }
    };
};

/** A calendar-event fragment for a rich card (human-readable, with a duration). */
export const calendarEvent = (title, { start, end, location, description, allDay = false } = {}) => {
    const name = trimmed(title, 'title', 'calendarEvent');
    const startMs = start instanceof Date ? start.getTime() : Number(start ?? Date.now());
    const endMs = end === undefined ? undefined : end instanceof Date ? end.getTime() : Number(end);
    if (!Number.isFinite(startMs)) {
        throw new Boom('calendarEvent: "start" must be a Date or a timestamp', { statusCode: 400, data: { start } });
    }
    if (endMs !== undefined && (!Number.isFinite(endMs) || endMs < startMs)) {
        throw new Boom('calendarEvent: "end" must be after "start"', { statusCode: 400, data: { start, end } });
    }
    return {
        calendarEvent: {
            title: name,
            start: startMs,
            ...(endMs !== undefined ? { end: endMs, durationMs: endMs - startMs } : {}),
            allDay: !!allDay,
            ...(location ? { location: String(location) } : {}),
            ...(description ? { description: String(description) } : {})
        }
    };
};

/** A `messageContextInfo.messageAssociation` (album child, poll option, status reshare…). */
export const makeMessageAssociation = (parentKey, { type = MESSAGE_ASSOCIATION_TYPES.MEDIA_ALBUM, messageIndex } = {}) => {
    if (!parentKey?.id) {
        throw new Boom('makeMessageAssociation: the parent message key (with an id) is required', { statusCode: 400 });
    }
    if (!Object.values(MESSAGE_ASSOCIATION_TYPES).includes(type)) {
        throw new Boom(`makeMessageAssociation: unknown association type ${type}`, {
            statusCode: 400,
            data: { type, allowed: MESSAGE_ASSOCIATION_TYPES }
        });
    }
    return {
        messageContextInfo: {
            messageAssociation: {
                associationType: type,
                parentMessageKey: parentKey,
                ...(messageIndex !== undefined ? { messageIndex } : {})
            }
        }
    };
};

// ── card sections ──────────────────────────────────────────────────────────────
/** One place on a map card. */
export const placeItem = ({ name, latitude, longitude, address, rating, url, distanceMeters } = {}) => {
    const place = trimmed(name, 'name', 'placeItem');
    const location = locationSticker({ latitude, longitude });
    if (rating !== undefined && (!Number.isFinite(rating) || rating < 0 || rating > 5)) {
        throw new Boom('placeItem: "rating" must be between 0 and 5', { statusCode: 400, data: { rating } });
    }
    return {
        name: place,
        latitude: location.latitude,
        longitude: location.longitude,
        ...(address ? { address: String(address) } : {}),
        ...(rating !== undefined ? { rating } : {}),
        ...(url ? { url: assertUrl(url, 'placeItem') } : {}),
        ...(distanceMeters !== undefined ? { distanceMeters } : {})
    };
};

/** A map card: several places, optionally centred somewhere. */
export const mapSection = (places, { title = 'Places', center, zoom } = {}) => {
    const list = (Array.isArray(places) ? places : [places]).filter(Boolean).map(place => (place.name && place.latitude !== undefined ? place : placeItem(place)));
    if (!list.length) {
        throw new Boom('mapSection: at least one place is required', { statusCode: 400 });
    }
    return {
        map: {
            title,
            places: list,
            ...(center ? { center: { latitude: center.latitude, longitude: center.longitude } } : {}),
            ...(zoom !== undefined ? { zoom } : {})
        }
    };
};

/** A sports fixture/score card. */
export const sportsSection = ({ league, home, away, status = 'scheduled', startTime, venue } = {}) => {
    const allowed = ['scheduled', 'live', 'finished', 'postponed'];
    if (!allowed.includes(status)) {
        throw new Boom(`sportsSection: unknown status "${status}"`, { statusCode: 400, data: { status, allowed } });
    }
    const team = (side, which) => {
        const value = typeof side === 'string' ? { name: side } : side;
        const name = trimmed(value?.name, `${which}.name`, 'sportsSection');
        return { name, ...(value.score !== undefined ? { score: Number(value.score) } : {}), ...(value.logo ? { logo: value.logo } : {}) };
    };
    return {
        sports: {
            ...(league ? { league: String(league) } : {}),
            home: team(home, 'home'),
            away: team(away, 'away'),
            status,
            ...(startTime ? { startTime: startTime instanceof Date ? startTime.getTime() : Number(startTime) } : {}),
            ...(venue ? { venue: String(venue) } : {})
        }
    };
};

/** A reminder fragment (what, when, how often). */
export const reminderSection = (text, when, { repeat, id } = {}) => {
    const body = trimmed(text, 'text', 'reminderSection');
    const at = when instanceof Date ? when.getTime() : Number(when);
    const allowed = ['none', 'daily', 'weekly', 'monthly', 'yearly'];
    if (!Number.isFinite(at)) {
        throw new Boom('reminderSection: "when" must be a Date or a timestamp', { statusCode: 400, data: { when } });
    }
    if (repeat !== undefined && !allowed.includes(repeat)) {
        throw new Boom(`reminderSection: unknown repeat "${repeat}"`, { statusCode: 400, data: { repeat, allowed } });
    }
    return {
        reminder: {
            id: id || `rem_${at.toString(36)}`,
            text: body,
            at,
            repeat: repeat ?? 'none',
            overdue: at < Date.now()
        }
    };
};

/** A task list fragment with a progress count. */
export const taskSection = (tasks, { title = 'Tasks' } = {}) => {
    const allowed = ['pending', 'running', 'done', 'failed', 'skipped'];
    const list = (Array.isArray(tasks) ? tasks : [tasks])
        .filter(Boolean)
        .map(task => (typeof task === 'string' ? { title: task } : task))
        .map((task, index) => {
            const name = trimmed(task.title ?? task.text, `tasks[${index}].title`, 'taskSection');
            const status = task.status ?? 'pending';
            if (!allowed.includes(status)) {
                throw new Boom(`taskSection: tasks[${index}] has unknown status "${status}"`, {
                    statusCode: 400,
                    data: { status, allowed }
                });
            }
            return { title: name, status, ...(task.detail ? { detail: String(task.detail) } : {}) };
        });
    if (!list.length) {
        throw new Boom('taskSection: at least one task is required', { statusCode: 400 });
    }
    const done = list.filter(task => task.status === 'done').length;
    return { tasks: { title, items: list, done, total: list.length, complete: done === list.length } };
};

/** The "how this answer was produced" footer (sources, model, disclaimers). */
export const transparencySection = ({ sources = [], model, disclaimer, generatedAt = Date.now() } = {}) => {
    const list = (Array.isArray(sources) ? sources : [sources])
        .filter(Boolean)
        .map(source => (typeof source === 'string' ? { url: assertUrl(source, 'transparencySection') } : {
            url: assertUrl(source.url, 'transparencySection'),
            ...(source.title ? { title: String(source.title) } : {}),
            ...(source.quote ? { quote: String(source.quote) } : {})
        }));
    if (!list.length && !model && !disclaimer) {
        throw new Boom('transparencySection: give it sources, a model, or a disclaimer', { statusCode: 400 });
    }
    return {
        transparency: {
            ...(list.length ? { sources: list } : {}),
            ...(model ? { model: String(model) } : {}),
            ...(disclaimer ? { disclaimer: String(disclaimer) } : {}),
            generatedAt
        }
    };
};
