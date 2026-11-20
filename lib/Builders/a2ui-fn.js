/**
 * lib/Builders/a2ui-fn.js — functional facade over the A2UI/Bloks builder and the AI rich
 * response layer.
 *
 * `A2UI` (imperative, id-returning) and `AIRich` (chainable) are the full APIs. These are the
 * small declarative pieces people actually reach for: build a node, nest it, send it. Every
 * helper returns a plain descriptor, and `bloksWidget()` turns a tree of them into the exact
 * flat component list A2UI puts on the wire — so the two styles mix freely.
 *
 * Part of @japofc/baileys.
 */
import { randomUUID } from 'crypto';
import { Boom } from '@hapi/boom';
import { proto } from '../../WAProto/index.js';
import { A2UI, sendA2UIWidget } from './A2UI.js';
import { readRichMessage } from '../Utils/rich-reader.js';
import { wrapToBotForwardedMessage } from '../Utils/rich-message-utils.js';
import { verifyBotSignature, readSignedRichResponse, verifyRichResponseSignature } from '../Utils/bot-signature.js';

/** Rich-response message type constants (mirrors the proto enum, spelled out for callers). */
export const AI_RICH_RESPONSE_TYPE_UNKNOWN = proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_UNKNOWN;
export const AI_RICH_RESPONSE_TYPE_STANDARD = proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD;
/** Every rich sub-message type WhatsApp understands, by name. */
export const AI_RICH_SUBMESSAGE_TYPE = { ...proto.AIRichResponseSubMessageType };
/** Default A2UI catalog + version used by `bloksWidget()`. */
export const A2UI_DEFAULT_CATALOG = 'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json';
export const A2UI_DEFAULT_VERSION = 'v0.9';

const node = (component, props) => ({ __a2ui: true, component, ...props });
const isNode = (value) => !!value && typeof value === 'object' && value.__a2ui === true;
const asChildren = (children) => (Array.isArray(children) ? children : children === undefined ? [] : [children]);

/** A text run. `variant` is the catalog's text style (`body`, `title`, `caption`, …). */
export const a2uiText = (text, { id, variant = 'body' } = {}) => node('Text', { id, text: String(text ?? ''), variant });
/** An image by URL. */
export const a2uiImage = (url, { id, variant, fit = 'cover' } = {}) => node('Image', { id, url, variant, fit });
/** A tappable button wrapping one child node. */
export const a2uiButton = (child, { id, variant = 'primary', action } = {}) => node('Button', { id, child, variant, action });
/** A vertical stack. */
export const a2uiColumn = (children, { id } = {}) => node('Column', { id, children: asChildren(children) });
/** A horizontal stack. */
export const a2uiRow = (children, { id } = {}) => node('Row', { id, children: asChildren(children) });
/** A card: one child with the catalog's card chrome around it. */
export const a2uiCard = (child, { id } = {}) => node('Card', { id, child: Array.isArray(child) ? a2uiColumn(child) : child });
/**
 * The outermost surface. Everything you want rendered goes in here; `bloksWidget()` and
 * `sendA2UI()` both accept either a surface or a bare node/array.
 */
export const a2uiSurface = (children, { id, surfaceId, catalogId = A2UI_DEFAULT_CATALOG, version = A2UI_DEFAULT_VERSION } = {}) => ({
    __a2ui: true,
    component: 'Surface',
    id,
    surfaceId,
    catalogId,
    version,
    children: asChildren(children)
});

const register = (builder, spec) => {
    if (!isNode(spec)) {
        throw new Boom(`bloksWidget: expected an a2ui node, got ${spec === null ? 'null' : typeof spec}`, { statusCode: 400 });
    }
    const { component, id } = spec;
    switch (component) {
        case 'Text':
            return builder.text(spec.text, { id, variant: spec.variant });
        case 'Image':
            return builder.image(spec.url, { id, variant: spec.variant, fit: spec.fit });
        case 'Button':
            return builder.button(register(builder, spec.child), { id, variant: spec.variant, action: spec.action });
        case 'Card':
            return builder.card(register(builder, spec.child), { id });
        case 'Column':
            return builder.column(spec.children.map(child => register(builder, child)), { id });
        case 'Row':
            return builder.row(spec.children.map(child => register(builder, child)), { id });
        case 'Surface':
            throw new Boom('bloksWidget: a Surface cannot be nested inside another node', { statusCode: 400 });
        default:
            throw new Boom(`bloksWidget: unknown component "${component}"`, { statusCode: 400, data: { component } });
    }
};

/**
 * Turn a surface (or any node/array of nodes) into the `interactiveMessage.bloksWidget`
 * payload — `{ uuid, data, type }` — without sending anything.
 */
export const bloksWidget = (tree, { type = 'im_a2ui', wrapped = true, uuid, surfaceId } = {}) => {
    const surface = isNode(tree) && tree.component === 'Surface' ? tree : a2uiSurface(tree);
    const builder = new A2UI({ catalogId: surface.catalogId, version: surface.version });
    const rootIds = surface.children.map(child => register(builder, child));
    if (!rootIds.length) {
        throw new Boom('bloksWidget: the surface has no children to render', { statusCode: 400 });
    }
    builder.root(rootIds);
    return builder.build({
        type,
        wrapped,
        ...(uuid ? { uuid } : {}),
        ...(surfaceId ?? surface.surfaceId ? { surfaceId: surfaceId ?? surface.surfaceId } : {})
    });
};

/**
 * An A2UI widget rendered as a full-screen embedded surface rather than an inline card —
 * the shape Meta's own clients use for multi-step flows.
 */
export const embeddedScreen = (tree, { title, screenId = 'MAIN', ...rest } = {}) => ({
    screenId,
    ...(title ? { title } : {}),
    widget: bloksWidget(tree, rest)
});

/**
 * Send an A2UI surface. Thin, friendlier wrapper over `sendA2UIWidget()`: takes the
 * declarative tree instead of a pre-built A2UI instance.
 */
export const sendA2UI = async (sock, jid, tree, options = {}) => {
    if (typeof sock?.relayMessage !== 'function') {
        throw new Boom('sendA2UI: a connected socket is required', { statusCode: 400 });
    }
    const surface = isNode(tree) && tree.component === 'Surface' ? tree : a2uiSurface(tree);
    const builder = new A2UI({ catalogId: surface.catalogId, version: surface.version });
    const rootIds = surface.children.map(child => register(builder, child));
    if (!rootIds.length) {
        throw new Boom('sendA2UI: the surface has no children to render', { statusCode: 400 });
    }
    builder.root(rootIds);
    return sendA2UIWidget(sock, jid, builder, options);
};

/**
 * A "chain of thought" block for an AIRich card: the collapsible reasoning strip Meta AI
 * shows above an answer. Returns the one-liner fragment, so it composes with `jap()`:
 * `jap(sock, { ...chainOfThoughtSection(['step 1', 'step 2']), markdown: answer })`.
 */
export const chainOfThoughtSection = (steps, { title = 'Thinking', collapsed = true } = {}) => {
    const list = (Array.isArray(steps) ? steps : [steps])
        .map(step => (typeof step === 'string' ? { text: step } : step))
        .filter(step => step && (step.text || step.title));
    if (!list.length) {
        throw new Boom('chainOfThoughtSection: at least one step is required', { statusCode: 400 });
    }
    return {
        thinking: { title, collapsed, steps: list },
        tasks: list.map(step => ({ title: step.title ?? step.text, status: step.status ?? 'done' }))
    };
};

/**
 * Decode a received rich-response/AIRich message into structured blocks.
 * Alias of `readRichMessage()` under the name the Meta-side modules use.
 */
export const decodeAIRich = (msg) => readRichMessage(msg);

/**
 * Forward a rich response you received to another chat, keeping the card intact.
 * Re-wraps it as a bot-forwarded message so the recipient's client renders it the same way.
 */
export const forwardRichResponse = async (sock, jid, msg, options = {}) => {
    // JAP@Fix (§2.204): this guarded on relayMessage and then called sendMessage. A socket
    // with one and not the other got the wrong answer in both directions: a send-capable
    // socket was rejected as "not connected", while a relay-only one passed the check and
    // died on `sock.sendMessage is not a function` several lines later.
    if (typeof sock?.sendMessage !== 'function') {
        throw new Boom('forwardRichResponse: a connected socket is required', { statusCode: 400 });
    }
    const message = msg?.message ?? msg;
    const rich = message?.botInvokeMessage?.message?.richResponseMessage
        ?? message?.botForwardedMessage?.message?.richResponseMessage
        ?? message?.richResponseMessage;
    if (!rich) {
        throw new Boom('forwardRichResponse: that message does not contain a rich response', { statusCode: 400 });
    }
    const content = wrapToBotForwardedMessage(rich);
    // ...and `options` was spread into the message CONTENT as well as passed as options, so
    // `{ quoted }` ended up as a bogus content field next to `forward` (§2.204).
    return sock.sendMessage(jid, { forward: { key: msg?.key, message: content } }, options);
};

/** Re-export of the signature checks, so the AI-rich surface is self-contained. */
export { verifyBotSignature, readSignedRichResponse, verifyRichResponseSignature };

/**
 * A free-form A2UI widget: give it the component list yourself when you need a component the
 * typed helpers do not cover yet. Validated against the same id rules as the builder.
 */
export const a2uiWidget = (components, { uuid, type = 'im_a2ui', wrapped = true, surfaceId, catalogId = A2UI_DEFAULT_CATALOG, version = A2UI_DEFAULT_VERSION } = {}) => {
    const list = Array.isArray(components) ? components : [components];
    if (!list.length) {
        throw new Boom('a2uiWidget: at least one component is required', { statusCode: 400 });
    }
    const ids = new Set();
    for (const component of list) {
        if (!component?.id || !component?.component) {
            throw new Boom('a2uiWidget: every component needs an "id" and a "component"', {
                statusCode: 400,
                data: { component }
            });
        }
        if (ids.has(component.id)) {
            throw new Boom(`a2uiWidget: duplicate component id "${component.id}"`, { statusCode: 400 });
        }
        ids.add(component.id);
    }
    const root = list.find(component => component.id === 'root')
        ?? { id: 'root', component: 'Column', children: list.map(component => component.id) };
    const components_ = list.some(component => component.id === 'root') ? list : [root, ...list];
    const id = uuid || randomUUID();
    const data = wrapped
        ? { version, createSurface: { surfaceId: surfaceId ?? `starcore-widget=${id}`, catalogId, components: components_ } }
        : { components: components_ };
    return { uuid: id, data: JSON.stringify(data), type };
};

/** Read a bloks widget payload back into its component list. */
export const decodeBloksWidget = (widget) => {
    const payload = widget?.bloksWidget ?? widget?.interactiveMessage?.bloksWidget ?? widget;
    const raw = typeof payload === 'string' ? payload : payload?.data;
    if (typeof raw !== 'string') {
        return null;
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        return null;
    }
    const surface = parsed?.createSurface;
    const components = surface?.components ?? parsed?.components ?? [];
    return {
        uuid: payload?.uuid,
        type: payload?.type,
        version: parsed?.version,
        surfaceId: surface?.surfaceId,
        catalogId: surface?.catalogId,
        components,
        byId: Object.fromEntries(components.filter(component => component?.id).map(component => [component.id, component])),
        text: components.filter(component => component?.component === 'Text').map(component => component.text).filter(Boolean)
    };
};

/** Send a pre-built bloks widget payload (what `bloksWidget()`/`a2uiWidget()` return). */
export const sendBloksWidget = async (sock, jid, widget, { body, footer, header, quoted, ...rest } = {}) => {
    if (typeof sock?.relayMessage !== 'function') {
        throw new Boom('sendBloksWidget: a connected socket is required', { statusCode: 400 });
    }
    if (!widget?.data || !widget?.uuid) {
        throw new Boom('sendBloksWidget: pass a payload from bloksWidget() / a2uiWidget()', { statusCode: 400 });
    }
    const interactiveMessage = {
        ...(header ? { header } : {}),
        ...(body ? { body: { text: body } } : {}),
        ...(footer ? { footer: { text: footer } } : {}),
        bloksWidget: widget
    };
    return sock.sendMessage(jid, { interactiveMessage, ...rest }, { quoted, ...rest });
};

/** A named section inside a bloks surface — a titled group of components. */
export const bloksSection = (title, children, { id, collapsed = false } = {}) => {
    const list = (Array.isArray(children) ? children : [children]).filter(Boolean);
    if (!list.length) {
        throw new Boom('bloksSection: a section needs at least one child', { statusCode: 400 });
    }
    const heading = String(title ?? '').trim();
    return a2uiColumn(heading ? [a2uiText(heading, { variant: 'title' }), ...list] : list, { id: id ?? (collapsed ? undefined : id) });
};

/** One tab of an embedded, tabbed surface. */
export const embeddedTab = (label, tree, { id, selected = false, ...rest } = {}) => {
    const title = String(label ?? '').trim();
    if (!title) {
        throw new Boom('embeddedTab: a label is required', { statusCode: 400 });
    }
    return {
        id: id || `tab_${title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        label: title,
        selected: !!selected,
        widget: bloksWidget(tree, rest)
    };
};

/** A whole tabbed embedded screen (exactly one tab may be selected). */
export const embeddedTabbedContent = (tabs, { screenId = 'MAIN', title } = {}) => {
    const list = (Array.isArray(tabs) ? tabs : [tabs]).filter(Boolean);
    if (!list.length) {
        throw new Boom('embeddedTabbedContent: at least one tab is required', { statusCode: 400 });
    }
    const selected = list.filter(tab => tab.selected);
    if (selected.length > 1) {
        throw new Boom('embeddedTabbedContent: only one tab can be selected', {
            statusCode: 400,
            data: { selected: selected.map(tab => tab.id) }
        });
    }
    return {
        screenId,
        ...(title ? { title } : {}),
        tabs: list.map((tab, index) => ({ ...tab, selected: selected.length ? tab.selected : index === 0 }))
    };
};

/** The collapsible "thinking…" strip on its own (without the task mirror). */
export const thinkingSection = (steps, { title = 'Thinking', collapsed = true } = {}) => {
    const { thinking } = chainOfThoughtSection(steps, { title, collapsed });
    return { thinking };
};

/** One step of a planner: what the assistant intends to do, and where it got to. */
export const plannerStep = (title, { status = 'pending', detail, tool, durationMs } = {}) => {
    const text = String(title ?? '').trim();
    const allowed = ['pending', 'running', 'done', 'failed', 'skipped'];
    if (!text) {
        throw new Boom('plannerStep: a title is required', { statusCode: 400 });
    }
    if (!allowed.includes(status)) {
        throw new Boom(`plannerStep: unknown status "${status}"`, { statusCode: 400, data: { status, allowed } });
    }
    return {
        title: text,
        status,
        ...(detail ? { detail } : {}),
        ...(tool ? { tool } : {}),
        ...(durationMs !== undefined ? { durationMs } : {})
    };
};

/** A search planner block: the query, the steps taken, and the sources found. */
export const searchPlannerSection = (query, steps, { sources, title = 'Searching' } = {}) => {
    const text = String(query ?? '').trim();
    if (!text) {
        throw new Boom('searchPlannerSection: a query is required', { statusCode: 400 });
    }
    const list = (Array.isArray(steps) ? steps : [steps])
        .filter(Boolean)
        .map(step => (typeof step === 'string' ? plannerStep(step) : step));
    if (!list.length) {
        throw new Boom('searchPlannerSection: at least one step is required', { statusCode: 400 });
    }
    return {
        searchPlanner: {
            title,
            query: text,
            steps: list,
            ...(sources?.length
                ? {
                    sources: sources.map(source => (typeof source === 'string'
                        ? { url: source }
                        : { url: source.url, ...(source.title ? { title: source.title } : {}) }))
                }
                : {})
        }
    };
};

/** Several candidate answers the user can flip between ("response 1 of 3"). */
export const multipleResponseSection = (responses, { selected = 0, label = 'Response' } = {}) => {
    const list = (Array.isArray(responses) ? responses : [responses])
        .filter(Boolean)
        .map(response => (typeof response === 'string' ? { text: response } : response));
    if (list.length < 2) {
        throw new Boom('multipleResponseSection: at least two responses are required', { statusCode: 400 });
    }
    if (!Number.isInteger(selected) || selected < 0 || selected >= list.length) {
        throw new Boom(`multipleResponseSection: "selected" must be between 0 and ${list.length - 1}`, {
            statusCode: 400,
            data: { selected }
        });
    }
    return {
        multipleResponse: {
            label,
            selected,
            total: list.length,
            responses: list.map((response, index) => ({ ...response, index, label: `${label} ${index + 1}` }))
        }
    };
};

/**
 * A fused comparison card: two (or more) options compared across the same rows — the
 * "which phone should I buy" layout.
 */
export const fusedComparisonSection = (options, rows, { title, recommend } = {}) => {
    const columns = (Array.isArray(options) ? options : [])
        .map(option => (typeof option === 'string' ? { title: option } : option))
        .filter(option => option?.title);
    if (columns.length < 2) {
        throw new Boom('fusedComparisonSection: at least two options are required', { statusCode: 400 });
    }
    const lines = (Array.isArray(rows) ? rows : []).filter(row => row?.label);
    if (!lines.length) {
        throw new Boom('fusedComparisonSection: at least one comparison row is required', { statusCode: 400 });
    }
    for (const row of lines) {
        const values = Array.isArray(row.values) ? row.values : [];
        if (values.length !== columns.length) {
            throw new Boom(`fusedComparisonSection: row "${row.label}" has ${values.length} values for ${columns.length} options`, {
                statusCode: 400,
                data: { row: row.label }
            });
        }
    }
    if (recommend !== undefined && (!Number.isInteger(recommend) || recommend < 0 || recommend >= columns.length)) {
        throw new Boom(`fusedComparisonSection: "recommend" must be an option index (0..${columns.length - 1})`, {
            statusCode: 400,
            data: { recommend }
        });
    }
    return {
        fusedComparison: {
            ...(title ? { title } : {}),
            options: columns.map((option, index) => ({ ...option, index, recommended: index === recommend })),
            rows: lines.map(row => ({ label: row.label, values: row.values })),
            ...(recommend !== undefined ? { recommend } : {})
        }
    };
};
