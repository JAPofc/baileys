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

/** Safe read of a node's own attribute, with an optional fallback. */
export declare const getBinaryNodeAttr: (node: any, attr: string, fallback?: any) => any;
/** Attribute of the first child matching a tag. */
export declare const getBinaryNodeChildAttr: (node: any, childTag: string, attr: string) => string | undefined;
/** Integer from a child attr (if given) or from the child's content. */
export declare const getBinaryNodeChildInt: (node: any, childTag: string, attr?: string, fallback?: number) => number | undefined;
/** Boolean from a child ('true'/'1'/'yes'/'on'); undefined when missing. */
export declare const getBinaryNodeChildBool: (node: any, childTag: string, attr?: string) => boolean | undefined;
/** Does the node have at least one child with this tag? */
export declare const hasBinaryNodeChild: (node: any, childTag: string) => boolean;
/** How many children carry this tag. */
export declare const countBinaryNodeChildren: (node: any, childTag: string) => number;
/** The attrs object of every child matching a tag. */
export declare const getBinaryNodeChildrenAttrs: (node: any, childTag: string) => { [key: string]: any }[];
/** Children of a node kept by a predicate. */
export declare const filterBinaryNodeChildren: (node: any, predicate: (child: any, index: number) => boolean) => any[];
/** Coerce a node's own content (Buffer/Uint8Array/string) to a UTF-8 string. */
export declare const getBinaryNodeContentString: (node: any) => string | undefined;
/** Non-throwing counterpart of assertNodeErrorFree: { code, text } or undefined. */
export declare const getBinaryNodeErrorStatus: (node: any) => { code: number | undefined; text: string } | undefined;

/** Normalize an attrs object: drop null/undefined and stringify the rest. */
export declare const normalizeBinaryNodeAttrs: (attrs: any) => { [key: string]: string };
/** Construct a BinaryNode { tag, attrs, content }: attrs normalized, empty array content omitted. */
export declare const binaryNode: (tag: string, attrs?: { [key: string]: any }, content?: any) => { tag: string; attrs: { [key: string]: string }; content?: any };
/** Leaf node carrying only attributes. */
export declare const attrNode: (tag: string, attrs?: { [key: string]: any }) => { tag: string; attrs: { [key: string]: string } };
/** Node whose content is a string. */
export declare const textNode: (tag: string, text: any, attrs?: { [key: string]: any }) => { tag: string; attrs: { [key: string]: string }; content?: string };
/** Node whose content is an array of child nodes (falsy dropped). */
export declare const childrenNode: (tag: string, children?: any[] | any, attrs?: { [key: string]: any }) => { tag: string; attrs: { [key: string]: string }; content?: any[] };
/** Non-mutating: copy of node with one attribute set (null/undefined removes it). */
export declare const withBinaryNodeAttr: (node: any, attr: string, value: any) => any;
/** Non-mutating: copy of node with children appended to its content. */
export declare const appendBinaryNodeChildren: (node: any, children: any[] | any) => any;
