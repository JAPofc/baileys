import type { BinaryNode } from '../../WABinary/index.js';

/** JAP (§2.139): device capability flags usync can be asked about. */
export const USYNC_FEATURES: string[];

/** Feature name (camelCased) to its value; booleans where the wire sent "true"/"false". */
export type USyncFeatureResult = Record<string, boolean | string>;

/** JAP (§2.139): which capabilities each contact's device supports. */
export class USyncFeatureProtocol {
    constructor(features?: string[]);
    name: 'feature';
    features: string[];
    getQueryElement(): BinaryNode;
    getUserElement(): null;
    parser(node: BinaryNode): USyncFeatureResult | null;
}
