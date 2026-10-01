/**
 * lib/Builders/A2UI.js — A2UI (Bloks) widget builder + sender
 *
 * Part of @japofc/baileys. Builds the flat `components` array A2UI/Bloks
 * expects (id-referencing tree: Column/Row hold `children`, Card/Button hold
 * `child`, Modal holds `trigger`/`content`) and sends it as an
 * `interactiveMessage.bloksWidget` via the same `getBizBinaryNode()` path
 * Button/ButtonV2 use, so the wire-level <biz>/<native_flow> node always
 * matches the actual button names sent — no more hand-rolled duplicate of
 * that logic living outside the library.
 *
 * See MessageBuilder.js's `Button.setBloksWidget()` for the declarative
 * (nested-tree) alternative to this imperative (id-returning-factory) API;
 * both produce the same wire format and can be mixed freely.
 */
"use strict";

import crypto from "crypto";
import { generateWAMessageFromContent, prepareWAMessageMedia } from "../Utils/messages.js";
import { getBizBinaryNode } from "../WABinary/index.js";

class A2UI {
	constructor({ catalogId = "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json", version = "v0.9" } = {}) {
		this._version = version;
		this._catalogId = catalogId;
		this._components = new Map();
		this._counter = 0;
		this._rootChildren = [];
	}
	// JAP@Fix (§2.35 / v2.4.7): the auto-id was a bare counter, so a caller-supplied id that
	// happened to look like a generated one (`text_0`) made the very next auto-id collide and
	// #reg() threw `Component id "text_0" already used` on a perfectly valid widget. Skip ids
	// that are already taken instead of handing back a known-duplicate.
	#nextId(prefix) {
		let id;
		do {
			id = `${prefix}_${(this._counter++).toString(36)}`;
		} while (this._components.has(id) || id === 'root');
		return id;
	}
	#reg(id, component, extra = {}) {
		id ??= this.#nextId(component.toLowerCase());
		if (id === "root") throw new Error(`Component id "root" is reserved for the implicit root wrapper`);
		if (this._components.has(id)) throw new Error(`Component id "${id}" already used`);
		this._components.set(id, { id, component, ...extra });
		return id;
	}
	text(text, { id, variant = "body" } = {}) {
		return this.#reg(id, "Text", { text, variant });
	}
	image(url, { id, variant, fit = "cover" } = {}) {
		return this.#reg(id, "Image", { url, ...(variant ? { variant } : {}), fit });
	}
	video(url, { id } = {}) {
		return this.#reg(id, "Video", { url });
	}
	checkbox(label, { id, value = false } = {}) {
		return this.#reg(id, "CheckBox", { label, value });
	}
	textField(label, { id, variant = "text" } = {}) {
		return this.#reg(id, "TextField", { label, variant });
	}
	button(childId, { id, variant = "primary", action } = {}) {
		if (!childId) throw new TypeError("button(childId) requires the id of a child component (e.g. from .text())");
		return this.#reg(id, "Button", { child: childId, variant, ...(action ? { action } : {}) });
	}
	card(childId, { id } = {}) {
		return this.#reg(id, "Card", { child: childId });
	}
	// trigger: id of the component that opens the modal (e.g. a Button); content: id of the
	// component shown inside it. Both are ids of already-registered SIBLING components, not
	// nested children — that's how the wire format expects Modal to reference them.
	modal(triggerId, contentId, { id } = {}) {
		if (!triggerId) throw new TypeError("modal(triggerId, contentId) requires the id of the trigger component");
		if (!contentId) throw new TypeError("modal(triggerId, contentId) requires the id of the content component");
		return this.#reg(id, "Modal", { trigger: triggerId, content: contentId });
	}
	// Escape hatch for any catalog component without a dedicated method yet (Divider, Slider,
	// Switch, List, etc). props is merged as-is into the registered node.
	raw(component, props = {}, { id } = {}) {
		if (typeof component !== "string" || !component) throw new TypeError("raw(component, props) requires a non-empty component type string");
		return this.#reg(id, component, props);
	}
	column(children = [], { id } = {}) {
		if (!children.length) throw new TypeError("column(children) requires at least one child id");
		return this.#reg(id, "Column", { children });
	}
	row(children = [], { id } = {}) {
		if (!children.length) throw new TypeError("row(children) requires at least one child id");
		return this.#reg(id, "Row", { children });
	}
	divider({ id } = {}) {
		return this.#reg(id, "Divider", {});
	}
	// JAP@Add --- second-wave catalog components (all register via #reg, so
	// build()-time ref validation + root()/build()/send() keep working unchanged)
	slider({ id, value = 0, min = 0, max = 100, step = 1, label } = {}) {
		return this.#reg(id, "Slider", { value, min, max, step, ...(label !== undefined ? { label } : {}) });
	}
	switch(label, { id, value = false } = {}) {
		return this.#reg(id, "Switch", { label, value });
	}
	list(children = [], { id } = {}) {
		if (!children.length) throw new TypeError("list(children) requires at least one child id");
		return this.#reg(id, "List", { children });
	}
	progressBar(value, { id, min = 0, max = 100, variant = "linear" } = {}) {
		if (typeof value !== "number") throw new TypeError("progressBar(value) requires a number");
		return this.#reg(id, "ProgressBar", { value, min, max, variant });
	}
	avatar(url, { id, variant = "circle", size = 40 } = {}) {
		if (!url) throw new TypeError("avatar(url) requires an image url");
		return this.#reg(id, "Avatar", { url, variant, size });
	}
	badge(childId, { id, label } = {}) {
		if (!childId) throw new TypeError("badge(childId) requires the id of a child component");
		return this.#reg(id, "Badge", { child: childId, ...(label !== undefined ? { label } : {}) });
	}
	spacer({ id, height = 16 } = {}) {
		return this.#reg(id, "Spacer", { height });
	}
	tabs(children = [], { id, activeTab = 0 } = {}) {
		if (!children.length) throw new TypeError("tabs(children) requires at least one child id");
		return this.#reg(id, "Tabs", { children, activeTab });
	}
	choicePicker(label, options, { id, variant = "mutuallyExclusive", value, displayStyle = "checkbox", filterable = false } = {}) {
		if (!Array.isArray(options) || !options.length) {
			throw new TypeError("choicePicker(label, options) requires a non-empty options array of {label, value}");
		}
		return this.#reg(id, "ChoicePicker", {
			label,
			variant,
			...(value !== undefined ? { value } : {}),
			options,
			displayStyle,
			filterable
		});
	}
	root(children) {
		if (!Array.isArray(children) || !children.length) {
			throw new TypeError("root(children) requires a non-empty array of top-level component ids");
		}
		this._rootChildren = children;
		return this;
	}
	// JAP@Add 29-08-26 --- Product/list carousel card. This is a DIFFERENT wire
	// payload shape from the Column/Row component-tree the rest of this class
	// builds (type: 'list_card', flat items array) — not a catalog component, so
	// it doesn't go through #reg()/root(). Call this instead of root()+build();
	// build() returns the list_card payload directly when this was set.
	listCard({ title, items, fallbackText, uuid = crypto.randomUUID() } = {}) {
		if (!title) throw new TypeError("listCard requires a title");
		if (!Array.isArray(items) || !items.length) {
			throw new TypeError("listCard requires a non-empty items array");
		}
		// JAP@Fix (§2.36 / v2.4.7) part 1: listCard() short-circuits build(), so mixing it with
		// root()/component factories silently threw the whole component tree away. Refuse the
		// ambiguous combination rather than dropping half the widget without a word.
		if (this._rootChildren.length || this._components.size) {
			throw new Error("listCard() builds a standalone list_card payload and cannot be combined with component factories/root() -- use a separate A2UI instance");
		}
		this._listCardPayload = {
			uuid,
			data: JSON.stringify({
				type: "list_card",
				title,
				fallback_text: fallbackText ?? "",
				items: items.map((it) => ({
					asset_id: it.assetId ?? crypto.randomUUID().replace(/-/g, "").slice(0, 17),
					asset_type: it.assetType ?? "PRODUCT_ITEM",
					title: it.title,
					trailing_label: it.price ?? it.trailingLabel ?? "",
					trailing_emphasis: it.emphasis ?? "strong"
				}))
			}),
			type: "im_a2ui",
			fallback: fallbackText ?? ""
		};
		return this;
	}
	// JAP@Add 30-08-26 --- send(): terminal method so A2UI can be used as a one-liner like
	// the other builders (Button/ButtonV2/AIRich `.send()`), instead of always needing the
	// separate `sendA2UIWidget()` call. Thin wrapper only — root([...ids])/listCard() must
	// still be called first, same as before build(); this doesn't change the id-returning
	// factory API (child methods still return ids, not `this`, since sibling nodes need to
	// reference each other by id when wiring children/trigger/content).
	async send(client, jid, opts = {}) {
		return sendA2UIWidget(client, jid, { ...opts, a2ui: this });
	}
	// JAP@Add 30-08-26 --- validates that every structural id-reference (child/children on
	// Button/Card/Column/Row, trigger/content on Modal) points at a component that was
	// actually registered. Without this, a typo'd id just gets written into the wire payload
	// as-is and the failure only surfaces as a broken/blank widget on the WA client, with no
	// error on this end. Only covers the dedicated methods' known reference keys — raw()'s
	// free-form props aren't inspected, since there's no way to know which of those are id
	// references vs plain data.
	/** @returns {boolean} Whether `id` was registered on this instance. */
	has(id) {
		return this._components.has(id);
	}

	/** @returns {Record<string, any>|undefined} A copy of the registered component node. */
	get(id) {
		const node = this._components.get(id);
		return node ? { ...node } : undefined;
	}

	/** @returns {string[]} Every registered component id, in registration order. */
	ids() {
		return [...this._components.keys()];
	}

	/** @returns {number} How many components are registered (excluding the implicit root). */
	count() {
		return this._components.size;
	}

	/** Unregister one component. @returns {boolean} Whether it existed. */
	remove(id) {
		return this._components.delete(id);
	}

	/** Drop every component, the root selection and any listCard payload. */
	clear() {
		this._components.clear();
		this._rootChildren = [];
		this._listCardPayload = undefined;
		return this;
	}

	/** Override the catalog url used in `createSurface.catalogId`. */
	setCatalogId(catalogId) {
		if (typeof catalogId !== "string" || !catalogId) throw new TypeError("setCatalogId(catalogId) requires a non-empty string");
		this._catalogId = catalogId;
		return this;
	}

	/** Override the A2UI spec version stamped on the payload. */
	setVersion(version) {
		if (typeof version !== "string" || !version) throw new TypeError("setVersion(version) requires a non-empty string");
		this._version = version;
		return this;
	}

	/**
	 * Registered components that nothing references and that aren't in root() -- they are
	 * encoded into the payload but never rendered, which is almost always a wiring mistake.
	 * @returns {string[]}
	 */
	findOrphans() {
		const referenced = new Set(this._rootChildren);
		for (const c of this._components.values()) {
			for (const key of ["child", "trigger", "content"]) {
				if (c[key] !== undefined) referenced.add(c[key]);
			}
			if (Array.isArray(c.children)) c.children.forEach((childId) => referenced.add(childId));
		}
		return [...this._components.keys()].filter((id) => !referenced.has(id));
	}

	/**
	 * Collect every structural problem without throwing on the first one.
	 * @returns {string[]} Empty when the widget is safe to build.
	 */
	validate() {
		const problems = [];
		if (this._listCardPayload) return problems;
		if (!this._rootChildren.length) {
			problems.push("Call root([...ids]) before build()");
			return problems;
		}
		const root = { id: "root", component: "Column", children: this._rootChildren };
		try {
			this.#validateRefs([root, ...this._components.values()]);
		} catch (error) {
			problems.push(error.message);
		}
		for (const id of this.findOrphans()) {
			problems.push(`A2UI: component "${id}" is registered but never referenced by root() or any parent -- it will not render`);
		}
		return problems;
	}

	/** Throw on the first structural problem. @returns {this} */
	assertValid() {
		const [problem] = this.validate();
		if (problem) throw new Error(problem);
		return this;
	}

	#validateRefs(components) {
		const validIds = new Set(components.map((c) => c.id));
		for (const c of components) {
			for (const key of ["child", "trigger", "content"]) {
				if (c[key] !== undefined && !validIds.has(c[key])) {
					throw new Error(`A2UI: component "${c.id}" (${c.component}) references unknown id "${c[key]}" via "${key}"`);
				}
			}
			if (Array.isArray(c.children)) {
				for (const childId of c.children) {
					if (!validIds.has(childId)) {
						throw new Error(`A2UI: component "${c.id}" (${c.component}) references unknown id "${childId}" in "children"`);
					}
				}
			}
		}
	}
	build({ uuid = crypto.randomUUID(), surfaceId, type = "im_a2ui", wrapped = true, validate = true } = {}) {
		// JAP@Fix (§2.36 / v2.4.7) part 2: the listCard branch returned its frozen payload and
		// ignored build()'s `type`, so sendA2UIWidget(..., { type: 'custom' }) silently shipped
		// the hardcoded 'im_a2ui' for list cards while honouring it for every other widget.
		if (this._listCardPayload) {
			return { ...this._listCardPayload, type };
		}
		if (!this._rootChildren.length) throw new Error("Call root([...ids]) before build()");
		if (validate) this.assertValid();
		const root = { id: "root", component: "Column", children: this._rootChildren };
		const components = [root, ...this._components.values()];
		this.#validateRefs(components);
		const data = wrapped
			? {
					version: this._version,
					createSurface: {
						surfaceId: surfaceId ?? `starcore-widget=${uuid}`,
						catalogId: this._catalogId,
						components
					}
				}
			: { components };
		return {
			uuid,
			data: JSON.stringify(data),
			type
		};
	}
}

/**
 * Build + send an A2UI/Bloks widget as an interactiveMessage.
 * @param {import('../../WAProto/index.js').WASocket} client Active Baileys socket.
 * @param {string} jid Destination chat/group jid.
 */
async function sendA2UIWidget(client, jid, {
	a2ui,
	bodyText = "",
	footer = "",
	buttons = [],
	contextInfo = {},
	expiration,
	quoted,
	type = "im_a2ui",
	wrapped = true,
	singleScreen = false,
	// JAP@Add 30-08-26 --- optional header media, mirroring Button/ButtonV2's toCard()
	// pattern (prepareWAMessageMedia + client.waUploadToServer). { title, subtitle, image
	// | video | document: path/buffer/{url} } — media is mutually exclusive, image wins if
	// more than one is passed. Falls back to a title/subtitle-only header (no attachment)
	// when no media is given, same shape as before this change.
	header
} = {}) {
	if (!client) throw new Error("Socket is required");
	if (!(a2ui instanceof A2UI)) throw new TypeError("a2ui must be an A2UI instance");

	const nativeFlowMessage = buttons && buttons.length
		? {
				buttons: buttons.map((b) => ({
					name: b.name ?? "cta_url",
					buttonParamsJson: typeof b.params === "string" ? b.params : JSON.stringify(b.params ?? {}),
				})),
				messageParamsJson: "{}",
				messageVersion: 1
			}
		: { messageParamsJson: "" };

	const headerMediaData = header?.image
		? { image: header.image }
		: header?.video
			? { video: header.video }
			: header?.document
				? { document: header.document }
				: null;

	const headerBlock = {
		...(header?.title !== undefined ? { title: header.title } : {}),
		...(header?.subtitle !== undefined ? { subtitle: header.subtitle } : {}),
		hasMediaAttachment: !!headerMediaData,
		...(headerMediaData
			? await prepareWAMessageMedia(headerMediaData, { upload: client.waUploadToServer }).catch((e) => {
					if (String(e).includes("Invalid media type")) return headerMediaData;
					throw e;
				})
			: {})
	};

	const interactiveMessage = singleScreen
		? {
				nativeFlowMessage,
				bloksWidget: a2ui.build({ type, wrapped }),
				...(expiration || Object.keys(contextInfo).length ? { contextInfo: { ...(expiration ? { expiration } : {}), ...contextInfo } } : {})
			}
		: {
				header: headerBlock,
				body: { text: bodyText },
				...(footer ? { footer: { text: footer } } : {}),
				nativeFlowMessage,
				bloksWidget: a2ui.build({ type, wrapped }),
				...(expiration || Object.keys(contextInfo).length ? { contextInfo: { ...(expiration ? { expiration } : {}), ...contextInfo } } : {})
			};

	const msg = generateWAMessageFromContent(jid, {
		messageContextInfo: { messageSecret: crypto.randomBytes(32) },
		interactiveMessage
	}, { quoted });

	await client.relayMessage(msg.key.remoteJid, msg.message, {
		messageId: msg.key.id,
		additionalNodes: [getBizBinaryNode(msg.message)]
	});
	return msg;
}

export { A2UI, sendA2UIWidget };
