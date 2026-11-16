import { assertNodeErrorFree, getBinaryNodeChild } from '../../WABinary/index.js';
/**
 * JAP@Fix (§2.56 / v2.4.7): `+attrs.id` turned a missing or non-numeric attribute into
 * `NaN`, which was then pushed into the device list and used to build jids
 * (`user:NaN@server`). Unusable values are dropped/undefined instead.
 */
const toIntOrUndefined = (value) => {
    if (value === undefined || value === null || value === '') {
        return undefined;
    }
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
};
export class USyncDeviceProtocol {
    constructor() {
        this.name = 'devices';
    }
    getQueryElement() {
        return {
            tag: 'devices',
            attrs: {
                version: '2'
            }
        };
    }
    getUserElement(user) {
        // JAP@Fix (bug 51): Implement device phashing for sync
        // Include phash (participant hash) if devices exist to enable proper sync
        if (user?.devices?.deviceList && user.devices.deviceList.length > 0) {
            return {
                tag: 'devices',
                attrs: {
                    phash: user.devices.phash || '',
                    ts: user.devices.keyIndex?.timestamp?.toString() || '',
                    expectedTs: user.devices.keyIndex?.expectedTimestamp?.toString() || ''
                }
            };
        }
        return null;
    }
    parser(node) {
        const deviceList = [];
        let keyIndex = undefined;
        if (node.tag === 'devices') {
            assertNodeErrorFree(node);
            const deviceListNode = getBinaryNodeChild(node, 'device-list');
            const keyIndexNode = getBinaryNodeChild(node, 'key-index-list');
            if (Array.isArray(deviceListNode?.content)) {
                for (const { tag, attrs } of deviceListNode.content) {
                    if (tag !== 'device') {
                        continue;
                    }
                    const id = toIntOrUndefined(attrs?.id);
                    if (id === undefined) {
                        // a device we cannot address is worse than no device at all
                        continue;
                    }
                    deviceList.push({
                        id,
                        keyIndex: toIntOrUndefined(attrs?.['key-index']),
                        isHosted: attrs?.['is_hosted'] === 'true'
                    });
                }
            }
            if (keyIndexNode?.tag === 'key-index-list') {
                keyIndex = {
                    timestamp: toIntOrUndefined(keyIndexNode.attrs['ts']),
                    signedKeyIndex: keyIndexNode?.content,
                    expectedTimestamp: toIntOrUndefined(keyIndexNode.attrs['expected_ts'])
                };
            }
        }
        return {
            deviceList,
            keyIndex
        };
    }
}
