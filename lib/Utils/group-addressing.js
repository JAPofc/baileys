/**
 * lib/Utils/group-addressing.js — deciding how to address a group message.
 *
 * `addressing_mode` on the outgoing stanza must match how the group actually addresses its
 * participants. The metadata carries `addressingMode`, but an app-supplied
 * `cachedGroupMetadata` is free to be older than the field itself — and defaulting a
 * field-less object to `'lid'` silently addresses a PN group the wrong way.
 *
 * Part of @japofc/baileys.
 */
/** What we fall back to when nothing at all can be inferred. */
export const DEFAULT_GROUP_ADDRESSING_MODE = 'lid';

/**
 * Work out a group's addressing mode, and say how confident that is.
 *
 * ```js
 * resolveGroupAddressingMode(metadata)
 * // → { mode: 'pn' | 'lid', source: 'metadata' | 'participants' | 'default', confident: boolean }
 * ```
 *
 * Order: the explicit field, then the participant jids themselves (a group whose members are
 * `@s.whatsapp.net` is a PN group, whatever a stale cache forgot to say), then the default.
 */
export const resolveGroupAddressingMode = (metadata) => {
    const declared = metadata?.addressingMode;
    if (declared === 'pn' || declared === 'lid') {
        return { mode: declared, source: 'metadata', confident: true };
    }
    const participants = Array.isArray(metadata?.participants) ? metadata.participants : [];
    let lid = 0;
    let pn = 0;
    for (const participant of participants) {
        const id = typeof participant === 'string' ? participant : participant?.id;
        if (typeof id !== 'string') {
            continue;
        }
        if (id.endsWith('@lid')) {
            lid++;
        }
        else if (id.endsWith('@s.whatsapp.net')) {
            pn++;
        }
    }
    if (lid || pn) {
        return { mode: lid >= pn ? 'lid' : 'pn', source: 'participants', confident: true };
    }
    return { mode: DEFAULT_GROUP_ADDRESSING_MODE, source: 'default', confident: false };
};

/**
 * Is this cached metadata usable for building a group stanza?
 * Returns `{ usable, reason }` — `reason` names the missing piece, so the caller can log
 * *why* it is about to re-fetch instead of silently doing it (or silently not doing it).
 */
export const isUsableGroupMetadata = (metadata, { requireAddressingMode = false } = {}) => {
    if (!metadata || typeof metadata !== 'object') {
        return { usable: false, reason: 'no metadata' };
    }
    if (!Array.isArray(metadata.participants)) {
        return { usable: false, reason: 'no participant list' };
    }
    if (!metadata.participants.length) {
        return { usable: false, reason: 'empty participant list' };
    }
    if (requireAddressingMode && metadata.addressingMode !== 'pn' && metadata.addressingMode !== 'lid') {
        return { usable: false, reason: 'no addressingMode (cache predates LID)' };
    }
    return { usable: true, reason: null };
};
