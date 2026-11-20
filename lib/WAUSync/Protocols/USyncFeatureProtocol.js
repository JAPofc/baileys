import { assertNodeErrorFree } from '../../WABinary/index.js';
/** JAP@Add (§2.139) — device capability flags WhatsApp Web knows how to ask usync about. */
export const USYNC_FEATURES = [
    'document',
    'encrypt',
    'encrypt_blist',
    'encrypt_contact',
    'encrypt_group_gen2',
    'encrypt_image',
    'encrypt_location',
    'encrypt_url',
    'encrypt_v2',
    'voip',
    'voip_legacy',
    'multi_agent',
    'bot_eligible'
];
const camel = (name) => name.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
/**
 * JAP@Add (§2.139) — ask which capabilities a contact's device supports, so a bot can tell
 * whether a recipient can actually receive what it is about to send instead of finding out
 * from a delivery failure.
 */
export class USyncFeatureProtocol {
    constructor(features) {
        this.name = 'feature';
        this.features = Array.isArray(features) && features.length ? [...features] : [...USYNC_FEATURES];
    }
    getQueryElement() {
        return {
            tag: 'feature',
            attrs: {},
            content: this.features.map(feature => ({ tag: feature, attrs: {} }))
        };
    }
    getUserElement() {
        return null;
    }
    parser(node) {
        if (node.tag !== 'feature') {
            return null;
        }
        // a <feature> carrying an <error/> is reported through the query's `errors` array
        assertNodeErrorFree(node);
        const features = {};
        for (const child of Array.isArray(node.content) ? node.content : []) {
            const value = child?.attrs?.value;
            if (value === undefined) {
                continue;
            }
            // the wire sends "true"/"false" strings; callers want a boolean they can branch on
            features[camel(child.tag)] = value === 'true' ? true : value === 'false' ? false : value;
        }
        return features;
    }
}
