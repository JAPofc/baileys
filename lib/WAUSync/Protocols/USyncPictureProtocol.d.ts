import type { BinaryNode } from '../../WABinary/index.js';
import type { USyncUser } from '../USyncUser.js';

export interface USyncPictureResult {
    id: string | null;
    url: string | null;
    directPath: string | null;
    hash: string | null;
    type: string;
}

/** JAP (§2.134): profile pictures for a whole batch of users in one usync query. */
export class USyncPictureProtocol {
    constructor(type?: 'image' | 'preview');
    name: 'picture';
    type: 'image' | 'preview';
    getQueryElement(): BinaryNode;
    getUserElement(user: USyncUser): BinaryNode | null;
    parser(node: BinaryNode): USyncPictureResult | null;
}
