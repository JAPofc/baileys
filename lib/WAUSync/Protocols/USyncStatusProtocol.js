import { assertNodeErrorFree } from '../../WABinary/index.js';
import { toSetAtDate } from './usync-time.js';
export class USyncStatusProtocol {
    constructor() {
        this.name = 'status';
    }
    getQueryElement() {
        return {
            tag: 'status',
            attrs: {}
        };
    }
    getUserElement() {
        return null;
    }
    parser(node) {
        if (node.tag === 'status') {
            assertNodeErrorFree(node);
            let status = node?.content?.toString() ?? null;
            // JAP@Fix (§2.133): `+(t || 0) * 1000` dated a status the server sent no
            // timestamp for to 1 Jan 1970, and a non-numeric `t` produced an Invalid Date
            // whose .toISOString() throws in the caller. Missing means missing.
            const setAt = toSetAtDate(node?.attrs?.t);
            if (!status) {
                if (node.attrs?.code && +node.attrs.code === 401) {
                    status = '';
                }
                else {
                    status = null;
                }
            }
            else if (typeof status === 'string' && status.length === 0) {
                status = null;
            }
            return {
                status,
                setAt
            };
        }
    }
}
