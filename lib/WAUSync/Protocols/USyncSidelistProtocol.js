import { assertNodeErrorFree } from '../../WABinary/index.js';
/**
 * JAP@Add (§2.139) — the side list: contacts the server returns alongside the ones you
 * asked about. `USyncQuery` already parses the `side_list` node (bug 52); this protocol is
 * what actually asks for it, and lets a user be dropped from it.
 *
 * @param {boolean} [useLidAddressing=true] send `addressing_mode="lid"` (needed for LID contacts)
 */
export class USyncSidelistProtocol {
    constructor(useLidAddressing = true) {
        this.name = 'sidelist';
        this.useLidAddressing = useLidAddressing !== false;
    }
    getQueryElement() {
        return {
            tag: 'sidelist',
            attrs: this.useLidAddressing ? { addressing_mode: 'lid' } : {}
        };
    }
    getUserElement(user) {
        return user?.sidelistDelete ? { tag: 'sidelist', attrs: { type: 'delete' } } : null;
    }
    parser(node) {
        // the server answers with either spelling depending on build
        if (node.tag !== 'sidelist' && node.tag !== 'side_list') {
            return null;
        }
        assertNodeErrorFree(node);
        return { type: node.attrs?.type ?? null };
    }
}
