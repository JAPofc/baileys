import { assertNodeErrorFree, getBinaryNodeChild, getBinaryNodeChildren } from '../../WABinary/index.js';
const textOf = (node) => {
    const content = node?.content;
    if (content === undefined || content === null) {
        return null;
    }
    if (typeof content === 'string') {
        return content;
    }
    if (Buffer.isBuffer(content) || content instanceof Uint8Array) {
        return Buffer.from(content).toString('utf-8');
    }
    return null;
};
const boolAttr = (value) => (value === undefined ? null : value === 'true' || value === true);
/**
 * JAP@Add (§2.134) — business details (verified name, hours, address, catalogue flags) for a
 * whole batch of contacts in one usync query, instead of one `getBusinessProfile()` IQ each.
 */
export class USyncBusinessProtocol {
    constructor(profileVersion = '116') {
        this.name = 'business';
        this.profileVersion = String(profileVersion);
    }
    getQueryElement() {
        return {
            tag: 'business',
            attrs: {},
            content: [
                { tag: 'verified_name', attrs: {} },
                { tag: 'profile', attrs: { v: this.profileVersion } }
            ]
        };
    }
    getUserElement(user) {
        const content = [];
        if (user?.verifiedNameSerial) {
            content.push({ tag: 'verified_name', attrs: { serial: String(user.verifiedNameSerial) } });
        }
        if (user?.businessProfileTag) {
            content.push({ tag: 'profile', attrs: { tag: String(user.businessProfileTag) } });
        }
        return content.length ? { tag: 'business', attrs: {}, content } : null;
    }
    parser(node) {
        if (node.tag !== 'business') {
            return null;
        }
        assertNodeErrorFree(node);
        const verifiedName = getBinaryNodeChild(node, 'verified_name');
        const profile = getBinaryNodeChild(node, 'profile');
        const hoursNode = profile ? getBinaryNodeChild(profile, 'business_hours') : undefined;
        const addressNode = profile ? getBinaryNodeChild(profile, 'address') : undefined;
        return {
            verifiedName: textOf(verifiedName),
            verifiedLevel: verifiedName?.attrs?.verified_level ?? null,
            profileTag: profile?.attrs?.tag ?? null,
            address: textOf(addressNode) ?? profile?.attrs?.address ?? null,
            businessHours: hoursNode
                ? {
                    timezone: hoursNode.attrs?.timezone ?? null,
                    config: getBinaryNodeChildren(hoursNode, 'business_hours_config').map(({ attrs }) => ({
                        dayOfWeek: attrs?.day_of_week ?? null,
                        openTime: attrs?.open_time ?? null,
                        closeTime: attrs?.close_time ?? null,
                        mode: attrs?.mode ?? null
                    }))
                }
                : null,
            catalogExists: boolAttr(profile?.attrs?.catalog_exists),
            cartEnabled: boolAttr(profile?.attrs?.cart_enabled),
            pnJid: node.attrs?.pn_jid ?? null
        };
    }
}
