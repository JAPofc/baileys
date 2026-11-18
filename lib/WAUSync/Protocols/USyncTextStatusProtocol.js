import { assertNodeErrorFree, getBinaryNodeChild } from '../../WABinary/index.js';
import { toSetAtDate } from './usync-time.js';
/**
 * JAP@Add (§2.139) — the "text status" (the short note with an emoji that sits next to a
 * contact's name), which is a different thing from the About text `USyncStatusProtocol`
 * returns. Carries its own timestamp and an optional expiry.
 */
export class USyncTextStatusProtocol {
    constructor() {
        this.name = 'text_status';
    }
    getQueryElement() {
        return { tag: 'text_status', attrs: {} };
    }
    getUserElement() {
        return null;
    }
    parser(node) {
        if (node.tag !== 'text_status') {
            return null;
        }
        assertNodeErrorFree(node);
        const setAt = toSetAtDate(node.attrs?.last_update_time);
        const duration = Number(node.attrs?.ephemeral_duration_sec);
        const emojiNode = getBinaryNodeChild(node, 'emoji');
        // the emoji arrives as node content on some builds and as an attribute on others
        const emojiContent = emojiNode?.content;
        return {
            text: node.attrs?.text ?? null,
            emoji: emojiNode?.attrs?.content
                ?? (emojiContent ? Buffer.from(emojiContent).toString('utf-8') : null),
            setAt,
            // an expiry is only meaningful when we know when the status was actually set
            expiresAt: setAt && Number.isFinite(duration) && duration > 0
                ? new Date(setAt.getTime() + duration * 1000)
                : null
        };
    }
}
