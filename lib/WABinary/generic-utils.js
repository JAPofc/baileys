import { Boom } from '@hapi/boom';
import { randomBytes } from 'crypto';
import { proto } from '../../WAProto/index.js';
// some extra useful utilities
const indexCache = new WeakMap();
export const getBinaryNodeChildren = (node, childTag) => {
    if (!node || !Array.isArray(node.content))
        return [];
    let index = indexCache.get(node);
    // Build the index once per node
    if (!index) {
        index = new Map();
        for (const child of node.content) {
            let arr = index.get(child.tag);
            if (!arr)
                index.set(child.tag, (arr = []));
            arr.push(child);
        }
        indexCache.set(node, index);
    }
    // Return first matching child
    return index.get(childTag) || [];
};
export const getBinaryNodeChild = (node, childTag) => {
    return getBinaryNodeChildren(node, childTag)[0];
};
export const getAllBinaryNodeChildren = ({ content }) => {
    if (Array.isArray(content)) {
        return content;
    }
    return [];
};
export const getBinaryNodeChildBuffer = (node, childTag) => {
    const child = getBinaryNodeChild(node, childTag)?.content;
    if (Buffer.isBuffer(child) || child instanceof Uint8Array) {
        return child;
    }
};
export const getBinaryNodeChildString = (node, childTag) => {
    const child = getBinaryNodeChild(node, childTag)?.content;
    if (Buffer.isBuffer(child) || child instanceof Uint8Array) {
        return Buffer.from(child).toString('utf-8');
    }
    else if (typeof child === 'string') {
        return child;
    }
};
export const getBinaryNodeChildUInt = (node, childTag, length) => {
    const buff = getBinaryNodeChildBuffer(node, childTag);
    if (buff) {
        return bufferToUInt(buff, length);
    }
};
export const assertNodeErrorFree = (node) => {
    const errNode = getBinaryNodeChild(node, 'error');
    if (errNode) {
        throw new Boom(errNode.attrs.text || 'Unknown error', { data: +errNode.attrs.code });
    }
};
export const reduceBinaryNodeToDictionary = (node, tag) => {
    const nodes = getBinaryNodeChildren(node, tag);
    const dict = nodes.reduce((dict, { attrs }) => {
        if (typeof attrs.name === 'string') {
            dict[attrs.name] = attrs.value || attrs.config_value;
        }
        else {
            dict[attrs.config_code] = attrs.value || attrs.config_value;
        }
        return dict;
    }, {});
    return dict;
};
export const getBinaryNodeMessages = ({ content }) => {
    const msgs = [];
    if (Array.isArray(content)) {
        for (const item of content) {
            if (item.tag === 'message') {
                msgs.push(proto.WebMessageInfo.decode(item.content).toJSON());
            }
        }
    }
    return msgs;
};
function bufferToUInt(e, t) {
    let a = 0;
    for (let i = 0; i < t; i++) {
        a = 256 * a + e[i];
    }
    return a;
}
const tabs = (n) => '\t'.repeat(n);
export function binaryNodeToString(node, i = 0) {
    if (!node) {
        return node;
    }
    if (typeof node === 'string') {
        return tabs(i) + node;
    }
    if (node instanceof Uint8Array) {
        return tabs(i) + Buffer.from(node).toString('hex');
    }
    if (Array.isArray(node)) {
        return node.map(x => tabs(i + 1) + binaryNodeToString(x, i + 1)).join('\n');
    }
    const children = binaryNodeToString(node.content, i + 1);
    const tag = `<${node.tag} ${Object.entries(node.attrs || {})
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}='${v}'`)
        .join(' ')}`;
    const content = children ? `>\n${children}\n${tabs(i)}</${node.tag}>` : '/>';
    return tag + content;
}
/**
 * JAP@Changes 30-01-26
 * ---
 * Produce the binary node (WABinary-like JSON shape) required for the specific
 * interactive button / list type.
 * compatible with observed official client traffic.
 *
 * NOTE: Returning different "v" (version) and "name" values influences how
 * WhatsApp renders & validates flows. The constants here are empirically derived.
 *
 * @param {object} message Normalized message content (after Baileys normalization).
 * @returns {object} A node with shape { tag, attrs, [content] } to inject into additionalNodes.
 */
const FLOWS_MAP = {
    // Original flow types
    mpm: true,
    // JAP@Fix (bug 44): the "catalog" nativeFlow shortcut generates a button
    // named 'catalog_message' (see prepareNativeFlowButtons in messages.js),
    // never 'cta_catalog' — the old key here never matched anything, so
    // catalog_message always fell through to the generic mixed-flow node
    // instead of getting its dedicated native_flow node.
    catalog_message: true,
    send_location: true,
    call_permission_request: true,
    wa_payment_transaction_details: true,
    automated_greeting_message_view_catalog: true,
    // Jap extended button types
    card_message: true,
    order_status: true,
    track_order: true,
    reorder: true,
    cancel_order: true,
    clear_chat: true,
    navigateToScreen: true,
    payment_status: true,
    payment_method: true,
    flow_action: true,
    voice_call: true,
    video_call_button: true,
    otp_button: true,
    authentication_button: true,
    cta_reminder: true,
    cta_cancel_reminder: true,
    // JAP@Fix 27-08-26: the real native_flow name for a WhatsApp Flows launch
    // button is 'flow' (matches Button.addFlow()'s button.name after the fix
    // in MessageBuilder.js). 'flow_action' was never a valid native_flow name --
    // it's the name of a *field inside* buttonParamsJson -- so it never actually
    // routed anything real; kept as a harmless alias in case any external caller
    // is still constructing a raw button object with the old (wrong) name.
    flow: true,
    // JAP@Fix (bug 68): removed duplicate `flow_action: true` key — already declared
    // above (Jap extended button types block); this was a leftover copy-paste dupe,
    // harmless (same value) but confusing on re-read.
    // JAP@Fix (single_select never renders alone) --- single_select must NEVER get
    // its own dedicated native_flow node here. WhatsApp only renders a single_select
    // button through the generic <native_flow v='9' name='mixed'> node — the same one
    // used when it's combined with other buttons. Giving it a dedicated
    // <native_flow v='2' name='single_select'> node (like the other FLOWS_MAP entries)
    // silently fails to render client-side, whether single_select is alone or is simply
    // the first button in the array. Removed from this map on purpose so it always
    // falls through to the `flowMsg` mixed-flow branch below.
};
const DECISION_SOURCE_CONTENT = [
    {
        tag: 'decision_source',
        attrs: { value: 'df' }
    }
];
const LIST_TYPE_CONTENT = {
    tag: 'list',
    attrs: { v: '2', type: 'product_list' }
};
const NATIVE_FLOW_ATTRIBUTE = { type: 'native_flow', v: '1' };
const MIXED_NATIVE_FLOW = {
    tag: 'interactive',
    attrs: NATIVE_FLOW_ATTRIBUTE,
    content: [
        {
            tag: 'native_flow',
            attrs: { v: '9', name: 'mixed' }
        }
    ]
};
export const getBizBinaryNode = (message) => {
    const flowMsg = message.interactiveMessage?.nativeFlowMessage;
    const carouselMsg = message.interactiveMessage?.carouselMessage;
    const firstButtonName = flowMsg?.buttons?.[0]?.name;
    const qualityContent = {
        tag: 'quality_control',
        attrs: {
            decision_id: randomBytes(20).toString('hex'),
            source_type: 'third_party'
        },
        content: DECISION_SOURCE_CONTENT
    };
    const bizAttributes = {
        actual_actors: '2',
        host_storage: '2',
        privacy_mode_ts: `${Date.now() / 1_000 | 0}`
    };
    const ORDER_RESPONSE_ALIAS = {
        review_and_pay: 'order_details',
        review_order: 'order_status',
        payment_info: 'payment_info',
        payment_status: 'payment_status',
        payment_method: 'payment_method',
        order_details: 'order_details',
        order_status: 'order_status',
        track_order: 'track_order',
        reorder: 'reorder',
        cancel_order: 'cancel_order',
    };
    if (firstButtonName && ORDER_RESPONSE_ALIAS[firstButtonName]) {
        bizAttributes.native_flow_name = ORDER_RESPONSE_ALIAS[firstButtonName];
        return {
            tag: 'biz',
            attrs: bizAttributes,
            content: [qualityContent]
        };
    }
    if (firstButtonName && FLOWS_MAP[firstButtonName]) {
        return {
            tag: 'biz',
            attrs: bizAttributes,
            content: [
                {
                    tag: 'interactive',
                    attrs: NATIVE_FLOW_ATTRIBUTE,
                    content: [
                        {
                            tag: 'native_flow',
                            attrs: { v: '2', name: firstButtonName }
                        }
                    ]
                },
                qualityContent
            ]
        };
    }
    if (flowMsg || carouselMsg || message.buttonsMessage || message.templateMessage) {
        return {
            tag: 'biz',
            attrs: bizAttributes,
            content: [
                MIXED_NATIVE_FLOW,
                qualityContent
            ]
        };
    }
    if (message.listMessage) {
        return {
            tag: 'biz',
            attrs: bizAttributes,
            content: [
                LIST_TYPE_CONTENT,
                qualityContent
            ]
        };
    }
    return {
        tag: 'biz',
        attrs: bizAttributes,
        content: [qualityContent]
    };
};


// JAP@Upgrade (core): deep node search — walk the whole tree, not just
// direct children. Invaluable when WhatsApp nests payloads another level
// deep in a server update.
export const findAllBinaryNodes = (node, tag, out = []) => {
	if (!node || typeof node !== 'object') {
		return out;
	}
	if (node.tag === tag) {
		out.push(node);
	}
	if (Array.isArray(node.content)) {
		for (const child of node.content) {
			findAllBinaryNodes(child, tag, out);
		}
	}
	return out;
};

/** First node matching a tag PATH from the root: getBinaryNodePath(iq, ['sync', 'collection', 'patch']). */
export const getBinaryNodePath = (node, tags) => {
	let current = node;
	for (const tag of tags || []) {
		if (!current) {
			return undefined;
		}
		current = getBinaryNodeChild(current, tag);
	}
	return current;
};

/**
 * JAP@Core 29-09-26 — ten core node-parsing helpers.
 * ---
 * These round out the WABinary reader surface. Every WA IQ/notification/receipt
 * stanza is a tree of { tag, attrs, content } nodes, and parsing them by hand
 * (optional-chaining into attrs, coercing string attrs to int/bool, counting
 * repeated children) is the single most repeated chore in socket code. All of
 * these are pure, null-safe, and reuse the cached getBinaryNodeChildren index.
 */

/** Safe read of a node's OWN attribute, with an optional fallback. */
export const getBinaryNodeAttr = (node, attr, fallback = undefined) => {
    const v = node?.attrs?.[attr];
    return v === undefined ? fallback : v;
};

/** Attribute of the FIRST child matching a tag (undefined if child/attr absent). */
export const getBinaryNodeChildAttr = (node, childTag, attr) => {
    return getBinaryNodeChild(node, childTag)?.attrs?.[attr];
};

/**
 * Integer from a child: from `attr` when given, otherwise from the child's own
 * string/Buffer content. Returns undefined when missing, and the numeric
 * `fallback` (default undefined) when present-but-unparseable.
 */
export const getBinaryNodeChildInt = (node, childTag, attr = undefined, fallback = undefined) => {
    let raw;
    if (attr) {
        raw = getBinaryNodeChildAttr(node, childTag, attr);
    } else {
        raw = getBinaryNodeChildString(node, childTag);
    }
    // absent (missing child / missing attr / empty) → undefined, so callers can
    // tell "not present" apart from "present but not a number".
    if (raw === undefined || raw === null || raw === '') {
        return undefined;
    }
    const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
    return Number.isNaN(n) ? fallback : n;
};

/** Boolean from a child: 'true'/'1'/'yes'/'on' → true; missing → undefined. */
export const getBinaryNodeChildBool = (node, childTag, attr = undefined) => {
    const raw = attr
        ? getBinaryNodeChildAttr(node, childTag, attr)
        : getBinaryNodeChildString(node, childTag);
    if (raw === undefined || raw === null || raw === '') {
        return undefined;
    }
    const s = String(raw).trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'yes' || s === 'on';
};

/** Does the node have at least one child with this tag? */
export const hasBinaryNodeChild = (node, childTag) => getBinaryNodeChildren(node, childTag).length > 0;

/** How many children carry this tag. */
export const countBinaryNodeChildren = (node, childTag) => getBinaryNodeChildren(node, childTag).length;

/** The `attrs` object of every child matching a tag (children without attrs → {}). */
export const getBinaryNodeChildrenAttrs = (node, childTag) => getBinaryNodeChildren(node, childTag).map(c => c?.attrs || {});

/** Children of a node kept by a predicate (safe when content is not an array). */
export const filterBinaryNodeChildren = (node, predicate) => {
    if (!node || !Array.isArray(node.content)) {
        return [];
    }
    return node.content.filter((child, i) => predicate(child, i));
};

/** Coerce a node's OWN content (Buffer / Uint8Array / string) to a UTF-8 string. */
export const getBinaryNodeContentString = (node) => {
    const content = node?.content;
    if (Buffer.isBuffer(content) || content instanceof Uint8Array) {
        return Buffer.from(content).toString('utf-8');
    }
    if (typeof content === 'string') {
        return content;
    }
    return undefined;
};

/**
 * NON-throwing counterpart of assertNodeErrorFree. Returns { code, text } when
 * the stanza carries an <error> child (or is itself an error stanza), else
 * undefined — so callers can branch on failures instead of try/catch.
 */
export const getBinaryNodeErrorStatus = (node) => {
    const errNode = getBinaryNodeChild(node, 'error');
    if (errNode) {
        const code = +(errNode.attrs?.code);
        return {
            code: Number.isNaN(code) ? undefined : code,
            text: errNode.attrs?.text || 'Unknown error'
        };
    }
    if (node?.attrs?.type === 'error' && node?.attrs?.code !== undefined) {
        const code = +node.attrs.code;
        return {
            code: Number.isNaN(code) ? undefined : code,
            text: node.attrs.text || 'Unknown error'
        };
    }
    return undefined;
};

/**
 * JAP@Core 29-09-26 (v2.4.6) — binary-node BUILDER helpers.
 * ---
 * The write-side complement to the reader helpers above. Constructing WA IQ /
 * query stanzas by hand is verbose and easy to get subtly wrong: attribute
 * values MUST be strings (a stray number/boolean throws deep in the encoder),
 * undefined attrs must be dropped, and empty content should be omitted. These
 * pure constructors do all of that, so callers write intent, not boilerplate.
 */

/** Normalize an attrs object: drop null/undefined and stringify the rest (WA attrs are strings). */
export const normalizeBinaryNodeAttrs = (attrs) => {
    const out = {};
    if (attrs && typeof attrs === 'object') {
        for (const [k, v] of Object.entries(attrs)) {
            if (v === undefined || v === null) continue;
            out[k] = typeof v === 'string' ? v : typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v);
        }
    }
    return out;
};

/** Construct a BinaryNode `{ tag, attrs, content }`: attrs normalized, empty array content omitted. */
export const binaryNode = (tag, attrs = {}, content = undefined) => {
    if (typeof tag !== 'string' || !tag) {
        throw new TypeError('binaryNode(tag): tag must be a non-empty string');
    }
    const node = { tag, attrs: normalizeBinaryNodeAttrs(attrs) };
    if (content !== undefined && content !== null) {
        if (Array.isArray(content)) {
            const kids = content.filter(c => c !== undefined && c !== null && c !== false);
            if (kids.length) node.content = kids;
        } else {
            node.content = content; // string | Buffer | Uint8Array
        }
    }
    return node;
};

/** Leaf node carrying only attributes (no content). */
export const attrNode = (tag, attrs = {}) => binaryNode(tag, attrs);

/** Node whose content is a string (null/undefined text becomes ''). */
export const textNode = (tag, text, attrs = {}) => binaryNode(tag, attrs, text == null ? '' : String(text));

/** Node whose content is an array of child nodes (falsy children dropped). */
export const childrenNode = (tag, children = [], attrs = {}) => binaryNode(tag, attrs, Array.isArray(children) ? children : [children]);

/** Non-mutating: return a copy of `node` with one attribute set (null/undefined removes it). */
export const withBinaryNodeAttr = (node, attr, value) => {
    const attrs = { ...(node?.attrs || {}) };
    if (value === undefined || value === null) {
        delete attrs[attr];
    } else {
        attrs[attr] = typeof value === 'string' ? value : typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
    }
    return { ...node, tag: node?.tag, attrs };
};

/** Non-mutating: return a copy of `node` with `children` appended to its content (falsy dropped). */
export const appendBinaryNodeChildren = (node, children) => {
    const existing = Array.isArray(node?.content) ? node.content : [];
    const add = (Array.isArray(children) ? children : [children]).filter(c => c !== undefined && c !== null && c !== false);
    return { ...node, content: [...existing, ...add] };
};
