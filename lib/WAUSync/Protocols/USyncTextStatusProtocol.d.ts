import type { BinaryNode } from '../../WABinary/index.js';

export interface USyncTextStatusResult {
    text: string | null;
    emoji: string | null;
    /** undefined when the server sent no usable timestamp. */
    setAt: Date | undefined;
    expiresAt: Date | null;
}

/** JAP (§2.139): the short text status (with emoji) shown next to a contact's name. */
export class USyncTextStatusProtocol {
    name: 'text_status';
    getQueryElement(): BinaryNode;
    getUserElement(): null;
    parser(node: BinaryNode): USyncTextStatusResult | null;
}
