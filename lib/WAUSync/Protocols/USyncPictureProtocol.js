import { assertNodeErrorFree } from '../../WABinary/index.js';
/**
 * JAP@Add (§2.134) — fetch profile pictures for many contacts in ONE usync round trip.
 *
 * `sock.profilePictureUrl()` is one IQ per contact; a 300-member group therefore costs 300
 * requests and is the quickest way to get rate-limited. The server will answer a `picture`
 * protocol inside a usync query for every user in the batch.
 *
 * @param {'image'|'preview'} [type='preview'] full picture or thumbnail
 */
export class USyncPictureProtocol {
    constructor(type = 'preview') {
        this.name = 'picture';
        this.type = type === 'image' ? 'image' : 'preview';
    }
    getQueryElement() {
        return {
            tag: 'picture',
            attrs: { type: this.type, query: 'url' }
        };
    }
    getUserElement(user) {
        // an id lets the server answer "unchanged" instead of re-sending the same picture
        return user?.pictureId ? { tag: 'picture', attrs: { id: String(user.pictureId) } } : null;
    }
    parser(node) {
        if (node.tag !== 'picture') {
            return null;
        }
        assertNodeErrorFree(node);
        const id = node.attrs?.id ?? null;
        const url = node.attrs?.url ?? null;
        const directPath = node.attrs?.direct_path ?? null;
        if (!id && !url && !directPath) {
            return null;
        }
        return {
            id,
            url,
            directPath,
            hash: node.attrs?.hash ?? null,
            type: node.attrs?.type ?? this.type
        };
    }
}
