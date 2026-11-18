import { assertNodeErrorFree } from '../../WABinary/index.js';
import { toSetAtDate } from './usync-time.js';
export class USyncDisappearingModeProtocol {
    constructor() {
        this.name = 'disappearing_mode';
    }
    getQueryElement() {
        return {
            tag: 'disappearing_mode',
            attrs: {}
        };
    }
    getUserElement() {
        return null;
    }
    parser(node) {
        if (node.tag === 'disappearing_mode') {
            assertNodeErrorFree(node);
            // JAP@Fix (§2.133): an absent `duration` was NaN and an absent `t` meant 1970.
            const rawDuration = Number(node?.attrs?.duration);
            const duration = Number.isFinite(rawDuration) ? rawDuration : undefined;
            const setAt = toSetAtDate(node?.attrs?.t);
            return {
                duration,
                setAt
            };
        }
    }
}
