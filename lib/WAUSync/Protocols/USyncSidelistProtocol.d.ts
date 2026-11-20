import type { BinaryNode } from '../../WABinary/index.js';
import type { USyncUser } from '../USyncUser.js';

export interface USyncSidelistResult {
    type: string | null;
}

/** JAP (§2.139): request the server-side `side_list` that USyncQuery already parses. */
export class USyncSidelistProtocol {
    constructor(useLidAddressing?: boolean);
    name: 'sidelist';
    useLidAddressing: boolean;
    getQueryElement(): BinaryNode;
    getUserElement(user: USyncUser): BinaryNode | null;
    parser(node: BinaryNode): USyncSidelistResult | null;
}
