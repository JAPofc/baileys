export function binaryNodeToString(node: any, i?: number): any;
export function getBinaryNodeChildren(node: any, childTag: any): any;
export function getBinaryNodeChild(node: any, childTag: any): any;
export function getAllBinaryNodeChildren({ content }: {
    content: any;
}): any[];
export function getBinaryNodeChildBuffer(node: any, childTag: any): any;
export function getBinaryNodeChildString(node: any, childTag: any): any;
export function getBinaryNodeChildUInt(node: any, childTag: any, length: any): number | undefined;
export function assertNodeErrorFree(node: any): void;
export function reduceBinaryNodeToDictionary(node: any, tag: any): any;
export function getBinaryNodeMessages({ content }: {
    content: any;
}): any[];
export function getBizBinaryNode(message: any): {
    tag: string;
    attrs: {
        actual_actors: string;
        host_storage: string;
        privacy_mode_ts: string;
    };
    content: ({
        tag: string;
        attrs: {
            decision_id: any;
            source_type: string;
        };
        content: {
            tag: string;
            attrs: {
                value: string;
            };
        }[];
    } | {
        tag: string;
        attrs: {
            type: string;
            v: string;
        };
        content: {
            tag: string;
            attrs: {
                v: string;
                name: any;
            };
        }[];
    })[];
} | {
    tag: string;
    attrs: {
        actual_actors: string;
        host_storage: string;
        privacy_mode_ts: string;
    };
    content: ({
        tag: string;
        attrs: {
            decision_id: any;
            source_type: string;
        };
        content: {
            tag: string;
            attrs: {
                value: string;
            };
        }[];
    } | {
        tag: string;
        attrs: {
            v: string;
            type: string;
        };
    })[];
};

/** Deep search: every node in the tree with this tag. */
export declare const findAllBinaryNodes: (node: any, tag: string, out?: any[]) => any[];
/** First node matching a tag path from the root. */
export declare const getBinaryNodePath: (node: any, tags: string[]) => any;
