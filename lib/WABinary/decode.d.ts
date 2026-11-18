export function decompressingIfRequired(buffer: any): Promise<any>;
/** JAP (§2.124): hard ceiling on nested-list recursion while decoding a binary node. */
export const MAX_BINARY_NODE_DEPTH: 512;
export function decodeDecompressedBinaryNode(buffer: any, opts: any, indexRef?: {
    index: number;
    depth?: number;
}): {
    tag: any;
    attrs: {};
    content: any;
};
export function decodeBinaryNode(buff: any): Promise<any>;
