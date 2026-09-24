import { BaseBuilder, Toolkit, extractIE, waitAllPromises, getSharp, getFfmpeg, botMetadataSignature, botMetadataCertificate, crypto, generateWAMessageFromContent, prepareWAMessageMedia, generateMessageIDV2 } from './shared.js';
class AIRich extends BaseBuilder {
	#client;
	static #warnedExperimental = new Set(); // one warning per experimental method per process

	constructor(client) {
		if (!client) {
			throw new Error('Socket is required');
		}

		super();
		this.#client = client;
		this._logger = client?.logger ?? null; // used by the experimental-API warning below
		this._contextInfo = {};
		this._submessages = [];
		this._sections = [];
		this._richResponseSources = [];
		// JAP@Fix (bug 42 / inline image fallback): WA rejects rendering AIRichResponseInlineImageMetadata
		// for third-party bots regardless of URL (confirmed empirically — Meta/WA CDN url with valid
		// mediaKey still doesn't render, so it's a trust-chain gate, not a domain/encoding issue).
		// Track every addInlineImage() call here so send() can fall back to a normal imageMessage.
		this._inlineImages = [];

		// JAP@Add 24-08-26 --- JAPofc original v4.7 additions (setResponseId/setBotResponseId
		// below), rewritten to fit this fork's conventions. build() used to always mint a fresh
		// crypto.randomUUID() for both unifiedResponse.response_id and botMetadata.botResponseId on
		// every call, with no way to reuse one — so a `sendEdit()`-style flow (rebuild the same
		// message with updated content, same response_id, so WA patches it in place instead of
		// showing a new message) was never actually possible despite being in the gist example.
		// null here means "not pinned yet" — build() falls back to a fresh randomUUID() same as before
		// when neither setResponseId() nor setBotResponseId() has been called.
		this._responseId = null;
		this._botResponseId = null;

		// JAP@Add --- set by send()/sendEdit() after every relay so a follow-up sendEdit(), called
		// with no args, knows which jid/message id to patch in place (JAPofc v4.7 API).
		this._lastMessageKey = null;

		// JAP@Add (v4.9.1) --- { id, insertAt } support for every add*()/set*() call, without
		// touching each method's own body/signature. Every add*() call ends up pushing 0-N items
		// onto _submessages and 0-N onto _sections (some push to both, some to just one — e.g.
		// addSuggest only touches _submessages, addSection only touches _sections). A Proxy wraps
		// every add*/set* call: it snapshots array lengths before calling the real method, lets the
		// method push onto the tail as it always has, then — if the caller passed { insertAt } —
		// peels those freshly-pushed items back off the tail and re-splices them right after the
		// last item that belongs to the block named by insertAt. Blocks are tracked by *object
		// reference*, not saved numeric index, so earlier insertions shifting the array around never
		// invalidates a later insertAt lookup (indexOf on the reference always finds the live position).
		//
		// JAP@Note (bug 71, behavior — not fixed, documented) --- insertAt always inserts right after
		// the ANCHOR's block, not after "whatever was most recently inserted there". Chaining (each new
		// item gets its own id, and the next call's insertAt points at THAT id — exactly what the
		// addText/addSuggest streaming-reveal example does) produces the expected order. But calling
		// insertAt at the SAME static anchor id repeatedly, without giving each new item its own id to
		// chain onto, inserts every one of them right after the original anchor — so the order comes out
		// reversed relative to call order (confirmed by test: id:'x' then 3x insertAt:'x' with no id of
		// their own on the new items produces [x, third, second, first], not [x, first, second, third]).
		// Left as-is rather than "fixed": making insertAt self-advance (re-pointing the anchor's block at
		// whatever was just inserted) would silently change what an id resolves to for any OTHER caller
		// still holding that id for a later replace()/delete()/insertAt() — a subtler, harder-to-diagnose
		// bug than the surprising-but-deterministic order this produces. Chain with fresh ids instead.
		this._blocks = new Map(); // id -> { subItems: object[], secItems: object[] }
		// JAP@Add --- keep a reference to the Proxy so internal helpers (e.g.
		// streamText) can route their own add*() calls through the id/replace
		// bookkeeping exactly like external callers do. `this.addText(...)`
		// inside a method sees the RAW instance (methods are applied to
		// `target`), so without `_self` an internal { replace } would be
		// silently ignored.
		const proxied = new Proxy(this, {
			get(target, prop, receiver) {
				const orig = Reflect.get(target, prop, receiver);
				if (typeof orig !== 'function') return orig;

				// JAP@Fix 23-08-26 (part 2) --- the add*/set* filter below only wrapped methods whose
				// name starts with "add"/"set". Everything else (send(), build(), ...) fell through to
				// `return orig` unwrapped, so calling e.g. `richInstance.send(...)` still invoked the
				// real method with `this` = the Proxy (`receiver`), hitting the exact same
				// "Cannot read private member #client..." brand-check error the add*/set* fix was for —
				// just one level up, in send()/build() themselves. Every function property now gets
				// bound to `target` (the real instance) at minimum; add*/set* additionally get the
				// insertAt/id bookkeeping below.
				if (!/^(add|set)/.test(String(prop))) {
					return (...args) => {
						const result = orig.apply(target, args);
						return result === target ? receiver : result;
					};
				}

				return (...args) => {
					// JAP@Add (stable/experimental separation): primitives whose wire
					// shapes come from captured traffic rather than a public schema are
					// listed in AIRich.EXPERIMENTAL_METHODS. First use of each logs a
					// one-time warning so bots know that surface may break silently
					// after a WhatsApp update; AIRich.isExperimental(name) exposes the
					// same classification programmatically.
					const propName = String(prop);
					if (AIRich.EXPERIMENTAL_METHODS.has(propName) && !AIRich.#warnedExperimental.has(propName)) {
						AIRich.#warnedExperimental.add(propName);
						target._logger?.warn?.({ method: propName }, `AIRich.${propName}() is an EXPERIMENTAL primitive (reverse-engineered wire shape) — it may stop rendering after a WhatsApp client update`);
					}
					const opts = args.find((a) => a && typeof a === 'object' && !Array.isArray(a) && !Buffer.isBuffer(a) && ('id' in a || 'insertAt' in a || 'replace' in a));
					const id = opts?.id;
					const insertAt = opts?.insertAt;
					const replace = opts?.replace;

					// JAP@Fix (bug 70) --- `id` reuse across two different add*/set* calls was silently
					// accepted: target._blocks.set(id, ...) below just clobbers the previous registration,
					// so the FIRST block with that id becomes an untracked ghost — still in _sections/
					// _submessages (still renders), but no longer reachable via hasId/peek/delete/replace/
					// insertAt (the id now only resolves to the second block). Confirmed by direct test:
					// addText('first',{id:'dup'}); addText('second',{id:'dup'}) left both in the message
					// but getIds() only ever had one 'dup', pointing at 'second'. Fail fast instead — same
					// as re-registering the same id you're actively `replace`-ing (that's a legitimate
					// "update this block, keep its id" call, not a collision).
					if (id && target._blocks.has(id) && replace !== id) {
						throw new Error(`add*/set*: id "${id}" is already registered — each id must be unique (pass { replace: "${id}" } to update that block instead, or use a different id)`);
					}

					const subBefore = target._submessages.length;
					const secBefore = target._sections.length;

					// JAP@Fix 23-08-26 --- was orig.apply(receiver, args): calling the real method bound to
					// the Proxy itself (`receiver`) makes any `this.#client` access inside throw
					// "Cannot read private member #client from an object whose class did not declare it",
					// because a Proxy is never the branded instance a private field was declared on —
					// this hit every add*() that touches #client via Toolkit.resolveMedia(this.#client, ...)
					// (addProduct/addPost/addReels/addSource, and would eventually hit addImage/addVideo
					// too once JIT/engine specifics changed). Binding to `target` (the real instance) instead
					// fixes it for good; `target._submessages`/`target._sections` below are unaffected since
					// they're plain properties, and `result === target ? receiver : result` still converts a
					// `this`-return back to the Proxy so chaining (`.addX().addY()`) keeps working.
					const result = orig.apply(target, args);


					const subItems = target._submessages.splice(subBefore);
					const secItems = target._sections.splice(secBefore);

					if (insertAt) {
						const anchor = target._blocks.get(insertAt);
						if (!anchor) throw new Error(`insertAt: no block registered with id "${insertAt}" (register it by passing { id: "${insertAt}" } on an earlier add*() call)`);

						const lastSub = anchor.subItems[anchor.subItems.length - 1];
						const subIdx = lastSub ? target._submessages.indexOf(lastSub) + 1 : target._submessages.length;
						target._submessages.splice(subIdx, 0, ...subItems);

						const lastSec = anchor.secItems[anchor.secItems.length - 1];
						const secIdx = lastSec ? target._sections.indexOf(lastSec) + 1 : target._sections.length;
						target._sections.splice(secIdx, 0, ...secItems);
					} else if (replace) {
						// replace: delete the old block's items at their current positions,
						// then insert new items at the same positions
						const old = target._blocks.get(replace);
						if (!old) throw new Error(`replace: no block registered with id "${replace}" (register it first with { id: "${replace}" })`);

						let subIdx = old.subItems.length > 0 ? target._submessages.indexOf(old.subItems[0]) : target._submessages.length;
						if (subIdx === -1) subIdx = target._submessages.length;
						for (const item of old.subItems) {
							const i = target._submessages.indexOf(item);
							if (i !== -1) target._submessages.splice(i, 1);
						}
						target._submessages.splice(subIdx, 0, ...subItems);

						let secIdx = old.secItems.length > 0 ? target._sections.indexOf(old.secItems[0]) : target._sections.length;
						if (secIdx === -1) secIdx = target._sections.length;
						for (const item of old.secItems) {
							const i = target._sections.indexOf(item);
							if (i !== -1) target._sections.splice(i, 1);
						}
						target._sections.splice(secIdx, 0, ...secItems);

						target._blocks.delete(replace);
						if (id) target._blocks.set(id, { subItems, secItems });
						else target._blocks.set(replace, { subItems, secItems });
					} else {
						target._submessages.push(...subItems);
						target._sections.push(...secItems);
					}

					if (id) target._blocks.set(id, { subItems, secItems });

					return result === target ? receiver : result;
				};
			},
		});
		this._self = proxied;
		return proxied;
	}

	/** Flatten every primitive pushed into `_sections` so far into one array — lets you build a
	 * card set in one AIRich instance and re-embed it into another via addSection(AIRich.newLayout(...)). */
	get items() {
		return this._sections.flatMap((s) => {
			const vm = s?.view_model;
			if (!vm) return [];
			return vm.primitives ?? (vm.primitive !== undefined ? [vm.primitive] : []);
		});
	}

	/** Push a raw pre-built submessage block (escape hatch for shapes not covered by the add*() helpers). */
	addSubmessage(submessage) {
		const items = Array.isArray(submessage) ? submessage : [submessage];

		for (const item of items) {
			if (typeof item !== 'object' || item === null || Array.isArray(item)) {
				throw new TypeError('Submessage must be a plain object or array of plain objects');
			}

			this._submessages.push(item);
		}

		return this;
	}

	/** Push a raw pre-built section wrapper around one or more submessages. */
	addSection(section) {
		const items = Array.isArray(section) ? section : [section];

		for (const item of items) {
			if (typeof item !== 'object' || item === null || Array.isArray(item)) {
				throw new TypeError('Section must be a plain object or array of plain objects');
			}

			this._sections.push(item);
		}

		return this;
	}

	/** Add a text block. `[label](url)` becomes a hyperlink, `[](url)` a numbered citation, `[expr]<img-url>` a rendered latex expression — toggle each via the options. */
	addText(text, { hyperlink = true, citation = true, latex = true } = {}) {
		if (typeof text != 'string') {
			throw new TypeError('Text must be a string');
		}

		const { text: extractedText, inline_entities } = extractIE(text, {
			hyperlink,
			citation,
			latex,
		});

		this._submessages.push({
			messageType: 2,
			messageText: extractedText,
		});

		this._sections.push(
			AIRich.newLayout('Single', {
				text: extractedText,
				...(inline_entities.length && {
					inline_entities,
				}),
				__typename: 'GenAIMarkdownTextUXPrimitive',
			})
		);

		return this;
	}

	/** Add a syntax-highlighted code block. @param {string} language e.g. 'javascript', 'python'. */
	addCode(language, code) {
		if (typeof language !== 'string' || typeof code !== 'string') {
			throw new TypeError('Language and code must be a string');
		}

		const meta = AIRich.tokenizer(code, language);

		this._submessages.push({
			messageType: 5,
			codeMetadata: {
				codeLanguage: language,
				codeBlocks: meta.codeBlock,
			},
		});

		this._sections.push(
			AIRich.newLayout('Single', {
				language,
				code_blocks: meta.unified_codeBlock,
				__typename: 'GenAICodeUXPrimitive',
			})
		);

		return this;
	}

	/** Add a table. @param {string[][]} table Row-major grid, first row treated as the header. */
	addTable(table, { hyperlink = true, citation = true, latex = true } = {}) {
		if (!Array.isArray(table)) {
			throw new TypeError('Table must be an array');
		}

		const meta = AIRich.toTableMetadata(table, { hyperlink, citation, latex });

		this._submessages.push({
			messageType: 4,
			tableMetadata: {
				title: meta.title,
				rows: meta.rows,
			},
		});

		this._sections.push(
			AIRich.newLayout('Single', {
				rows: meta.unified_rows,
				__typename: 'GenATableUXPrimitive',
			})
		);

		return this;
	}

	/** Add a "Sources" strip. @param {string[]|string[][]} sources Flat list of urls, or `[title, url]` pairs. */

	/** Build rich-response citation/link submessages using the same shape as Baileys' `links` content shortcut. */
	addLinks(links = []) {
		if (!Array.isArray(links)) throw new TypeError('links must be an array');
		links.forEach((linkField, index) => {
			if (!linkField || typeof linkField !== 'object') throw new TypeError('Each link must be an object');
			const prefix = 'SS_' + index;
			const url = linkField.url || '';
			const text = String(linkField.text ?? '');
			const sources = Array.isArray(linkField.sources) ? linkField.sources.map((sourceField) => ({
				source_type: 'THIRD_PARTY',
				source_display_name: sourceField?.displayName || sourceField?.title || 'Source',
				source_subtitle: sourceField?.subtitle || '',
				source_url: sourceField?.url || url,
			})) : [];
			const entity = {
				key: prefix,
				metadata: {
					reference_id: index + 1,
					reference_url: url,
					reference_title: linkField.title || 'Source',
					reference_display_name: linkField.displayName || linkField.title || 'Source',
					sources,
					__typename: 'GenAISearchCitationItem',
				},
			};
			const section = AIRich.newLayout('Single', {
				text: `${text} {{${prefix}}}${url}{{/${prefix}}}`,
				inline_entities: [entity],
				__typename: 'GenAIMarkdownTextUXPrimitive',
			});
			this._sections.push(section);
			this._submessages.push({
				messageType: 2,
				messageText: `${text} {{${prefix}}}¹{{/${prefix}}} `,
				inlineEntities: [entity],
			});
		});
		return this;
	}

	/** Add a raw rich-response content-items carousel, matching Baileys' `items` field. */
	addContentItems(items = []) {
		if (!Array.isArray(items)) throw new TypeError('items must be an array');
		this._submessages.push({
			messageType: 9,
			contentItemsMetadata: { itemsMetadata: items, contentType: 1 },
		});
		this._sections.push(AIRich.newLayout('Single', {
			items,
			content_type: 1,
			__typename: 'GenAIContentItemsUXPrimitive',
		}));
		return this;
	}

	/** Add Baileys-compatible inline-video marker. WhatsApp's current rich-response helper carries this as a text marker. */
	addInlineVideo() {
		this._submessages.push({ messageType: 2, messageText: 'INLINE_VIDEO' });
		this._sections.push(AIRich.newLayout('Single', {
			text: 'INLINE_VIDEO',
			__typename: 'GenAIMarkdownTextUXPrimitive',
		}));
		return this;
	}

	addSource(sources = [], { resolveUrl = false } = {}) {
		// Accept 3 formats:
		// 1. Array of objects: [{ icon, url, title, subtitle }] — from v4.7 example
		// 2. Array of string arrays: [['iconUrl', 'url', 'text']]
		// 3. Single string array (shorthand for format 2): ['iconUrl', 'url', 'text']
		const isObjArray = Array.isArray(sources) && sources.every((item) => item && typeof item === 'object' && !Array.isArray(item));
		const isStrArrayArray = Array.isArray(sources) && sources.every((item) => Array.isArray(item) && item.every((v) => typeof v === 'string'));
		const isFlatStrArray = Array.isArray(sources) && sources.every((item) => typeof item === 'string');

		if (!isObjArray && !isStrArrayArray && !isFlatStrArray) {
			throw new TypeError('addSource(): pass an array of objects { icon, url, title, subtitle } or string arrays [iconUrl, url, text]');
		}

		let normalized;
		if (isObjArray) {
			normalized = sources.map((item) => ({
				icon: item.icon ?? item.iconUrl ?? item.favicon ?? '',
				url: item.url ?? '',
				text: item.title ?? item.displayName ?? item.text ?? '',
				subtitle: item.subtitle ?? 'AI',
			}));
		} else {
			const arr = isFlatStrArray ? [sources] : sources;
			normalized = arr.map(([icon = '', url = '', text = '']) => ({ icon, url, text, subtitle: 'AI' }));
		}

		const source = normalized.map(({ icon, url, text, subtitle }) => ({
			source_type: 'THIRD_PARTY',
			source_display_name: text,
			source_subtitle: subtitle,
			source_url: url,
			favicon: {
				url: Toolkit.resolveMedia(this.#client, icon, 'image', { resolveUrl }),
				mime_type: 'image/jpeg',
				width: 16,
				height: 16,
			},
		}));

		this._sections.push(
			AIRich.newLayout('Single', {
				sources: source,
				__typename: 'GenAISearchResultPrimitive',
			})
		);

		return this;
	}

	/** Add a horizontally-scrollable reel of image/video items. */
	addReels(reelsItems = [], { resolveUrl = false } = {}) {
		if (
			!(
				(reelsItems && typeof reelsItems === 'object' && !Array.isArray(reelsItems)) ||
				(Array.isArray(reelsItems) && reelsItems.every((item) => item && typeof item === 'object' && !Array.isArray(item)))
			)
		) {
			throw new TypeError('Reels items must be an object or an array of objects');
		}

		if (!Array.isArray(reelsItems)) {
			reelsItems = [reelsItems];
		}

		const reels = reelsItems.map((item) => ({
			...item,
			_avatar: Toolkit.resolveMedia(this.#client, item.profileIconUrl ?? item.profile_url ?? item.profile ?? '', 'image', { resolveUrl }),
			_thumbnail: Toolkit.resolveMedia(this.#client, item.thumbnailUrl ?? item.thumbnail ?? '', 'image', { resolveUrl }),
		}));

		this._submessages.push({
			messageType: 9,
			contentItemsMetadata: {
				contentType: 1,
				itemsMetadata: reels.map((item) => ({
					reelItem: {
						title: item.username ?? '',
						profileIconUrl: item._avatar,
						thumbnailUrl: item._thumbnail,
						videoUrl: item.videoUrl ?? item.url ?? '',
					},
				})),
			},
		});

		reels.forEach((item, idx) => {
			this._richResponseSources.push({
				provider: 'Evernight AI',
				thumbnailCDNURL: item._thumbnail,
				sourceProviderURL: item.videoUrl ?? item.url ?? '',
				sourceQuery: '',
				faviconCDNURL: item._avatar,
				citationNumber: idx + 1,
				sourceTitle: item.username ?? '',
			});
		});

		this._sections.push(
			AIRich.newLayout(
				'HScroll',
				reels.map((item) => ({
					reels_url: item.videoUrl ?? item.url ?? '',
					thumbnail_url: item._thumbnail,
					creator: item.username ?? item.title ?? '',
					avatar_url: item._avatar,
					reels_title: item.reels_title ?? item.title ?? '',
					likes_count: item.likes_count ?? item.like ?? 0,
					shares_count: item.shares_count ?? item.share ?? 0,
					view_count: item.view_count ?? item.view ?? 0,
					reel_source: item.reel_source ?? item.source ?? 'IG',
					is_verified: !!(item.is_verified || item.verified),
					__typename: 'GenAIReelPrimitive',
				}))
			)
		);

		return this;
	}

	/** Add a full-width image (or grid of images if `imageUrl` is an array). */
	/**
	 * @param {{ resolveUrl?: boolean, instant?: boolean|'only' }} [options]
	 * `instant: true` — sends BOTH: the GRID_IMAGE card (still shows WA's "can't verify"
	 *   forwarded-download prompt, unavoidable per-design of botForwardedMessage) AND a plain
	 *   (non-forwarded) imageMessage via send()'s inline-image fallback queue (`_inlineImages`,
	 *   shared with addInlineImage()) that renders instantly with no prompt. Two images, by design.
	 * `instant: 'only'` — JAP@Add (v4.9.2): skips building the GRID_IMAGE card entirely (no
	 *   submessage, no GenAIImaginePrimitive section) and queues ONLY the plain imageMessage.
	 *   One image, no prompt, nothing to download — use this when you don't need the rich card,
	 *   just the picture to show up immediately.
	 */
	addImage(imageUrl, { resolveUrl = false, instant = false } = {}) {
		if (!(typeof imageUrl === 'string' || Buffer.isBuffer(imageUrl) || (Array.isArray(imageUrl) && imageUrl.every((v) => typeof v === 'string' || Buffer.isBuffer(v))))) {
			throw new TypeError('imageUrl must be string | buffer | array of string/buffer');
		}
		if (instant !== false && instant !== true && instant !== 'only') {
			throw new TypeError(`instant must be false, true, or 'only' — got ${JSON.stringify(instant)}`);
		}

		const list = Array.isArray(imageUrl)
			? imageUrl.map((v) => {
					const url = Toolkit.resolveMedia(this.#client, v, 'image', { resolveUrl });
					return {
						imagePreviewUrl: url,
						imageHighResUrl: url,
						sourceUrl: url,
					};
				})
			: (() => {
					const url = Toolkit.resolveMedia(this.#client, imageUrl, 'image', { resolveUrl });
					return [
						{
							imagePreviewUrl: url,
							imageHighResUrl: url,
							sourceUrl: url,
						},
					];
				})();

		const buildCard = instant !== 'only';

		if (buildCard) {
			this._submessages.push({
				messageType: 1,
				gridImageMetadata: {
					gridImageUrl: {
						imagePreviewUrl: list[0]?.imagePreviewUrl,
					},
					imageUrls: list,
				},
			});
		}

		list.forEach(({ imagePreviewUrl }) => {
			if (buildCard) {
				this._sections.push(
					AIRich.newLayout('Single', {
						media: {
							url: imagePreviewUrl,
							mime_type: 'image/png',
						},
						imagine_type: 'IMAGE',
						status: { status: 'READY' },
						__typename: 'GenAIImaginePrimitive',
					})
				);
			}

			if (instant) {
				this._inlineImages.push({ url: imagePreviewUrl, caption: undefined });
			}
		});

		return this;
	}

	// JAP@Fix 15-08-26 (bug 41) --- addImage() only builds GRID_IMAGE (messageType 1).
	// There was no helper for standalone INLINE_IMAGE (messageType 3): callers were manually
	// pushing addSubmessage() (correct proto shape) + addSection() (WRONG shape — reused the
	// GRID_IMAGE/GenAIImaginePrimitive section schema instead of GenAIInlineImageUXPrimitive),
	// which broke client-side unifiedResponse rendering even though the submessage itself was fine.
	// Mirrors RichSubMessageType.INLINE_IMAGE handling in rich-message-utils.js's toUnified().
	/** Add an image inline with the surrounding text flow (falls back to a plain imageMessage on send() if the client can't render inline images — see skipImageFallback). */
	addInlineImage(imageUrl, { text = '', alignment = 'center', tapLinkUrl = '', resolveUrl = false } = {}) {
		if (!(typeof imageUrl === 'string' || Buffer.isBuffer(imageUrl) || (imageUrl && typeof imageUrl === 'object'))) {
			throw new TypeError('imageUrl must be string | buffer | { imagePreviewUrl, imageHighResUrl, sourceUrl }');
		}

		const ALIGNMENT_ENUM = { leading: 0, trailing: 1, center: 2 };
		const ALIGNMENT_NAME = ['AI_RICH_RESPONSE_IMAGE_LAYOUT_LEADING_ALIGNED', 'AI_RICH_RESPONSE_IMAGE_LAYOUT_TRAILING_ALIGNED', 'AI_RICH_RESPONSE_IMAGE_LAYOUT_CENTER_ALIGNED'];
		const alignmentNum = typeof alignment === 'number' ? alignment : (ALIGNMENT_ENUM[String(alignment).toLowerCase()] ?? ALIGNMENT_ENUM.center);

		const url =
			imageUrl && typeof imageUrl === 'object'
				? {
						imagePreviewUrl: imageUrl.imagePreviewUrl || imageUrl.url,
						imageHighResUrl: imageUrl.imageHighResUrl || imageUrl.url,
						sourceUrl: imageUrl.sourceUrl || imageUrl.url,
					}
				: (() => {
						const resolved = Toolkit.resolveMedia(this.#client, imageUrl, 'image', { resolveUrl });
						return { imagePreviewUrl: resolved, imageHighResUrl: resolved, sourceUrl: resolved };
					})();

		this._submessages.push({
			messageType: 3,
			imageMetadata: {
				imageUrl: url,
				imageText: text,
				alignment: alignmentNum,
				tapLinkUrl,
			},
		});

		this._sections.push(
			AIRich.newLayout('Single', {
				image_url: {
					image_preview_url: url.imagePreviewUrl || '',
					image_high_res_url: url.imageHighResUrl || '',
					source_url: url.sourceUrl || '',
				},
				image_text: text,
				alignment: ALIGNMENT_NAME[alignmentNum],
				tap_link_url: tapLinkUrl,
				__typename: 'GenAIInlineImageUXPrimitive',
			})
		);

		// JAP@Fix (bug 42): stash for the imageMessage fallback in send()
		this._inlineImages.push({
			url: url.sourceUrl || url.imageHighResUrl || url.imagePreviewUrl,
			caption: text || undefined,
		});

		return this;
	}

	// JAP@Perf 15-08-26 --- autoFill defaults to false (arslan-baileys behavior): skips the
	// fetch-full-video + ffmpeg-frame-extraction + duration-parse round trip per video, which
	// was the main source of blurose's slower response time. Pass { autoFill: true } to opt
	// back into the complete/slow path (real thumbnail + duration + file_length).
	// JAP@Fix 23-08-26 --- addVideo() had no resolveUrl option at all (unlike addImage()), so the
	// video url always stayed a raw external link, which stock WA clients show a "download" state
	// for before rendering. Mirrors addImage()'s { resolveUrl } — when true, the url is uploaded to
	// WA's own media server first via Toolkit.toUrl() so it renders instantly like WA-native media.
	/** Add a video block. */
	addVideo(videoUrl, { autoFill = false, resolveUrl = false } = {}) {
		const isObjectVideo = (v) => v && typeof v === 'object' && v.url;

		const isValidPrimitive =
			typeof videoUrl === 'string' ||
			Buffer.isBuffer(videoUrl) ||
			isObjectVideo(videoUrl) ||
			(Array.isArray(videoUrl) && videoUrl.every((v) => typeof v === 'string' || Buffer.isBuffer(v) || isObjectVideo(v)));

		if (!isValidPrimitive) {
			throw new TypeError('videoUrl must be string | buffer | object | array');
		}

		const items = Array.isArray(videoUrl) ? videoUrl : [videoUrl];

		this._submessages.push({
			messageType: 2,
			messageText: '[ Video could not be loaded ]',
		});

		items.forEach((item) => {
			const isObject = isObjectVideo(item);

			const url = isObject
				? Toolkit.resolveMedia(this.#client, item.url ?? '', 'video', { resolveUrl })
				: Toolkit.resolveMedia(this.#client, item, 'video', { resolveUrl });

			const bufferPromise = autoFill ? Promise.resolve(url).then((u) => Toolkit.fetchBuffer(u)) : null;
			// JAP@Fix: these derived promises are created NOW but only awaited at
			// build() time — if the fetch rejects in between, Node treats it as an
			// unhandledRejection and kills the process. Mark each as "handled"
			// without swallowing the error (build()'s await still sees the reject).
			const armed = (p) => { if (p && typeof p.then === 'function') { p.catch(() => { }); } return p; };

			const file_length = isObject && item.file_length != null ? item.file_length : autoFill ? armed(bufferPromise.then((b) => b?.length ?? 0)) : 0;

			const duration =
				isObject && item.duration != null
					? item.duration
					: autoFill
						? armed(bufferPromise.then((b) =>
								Toolkit.getMp4Duration(b, {
									silent: true,
								})
							))
						: 0;

			const thumbnail =
				isObject && item.thumbnail
					? Toolkit.resolveMedia(this.#client, item.thumbnail, 'image', {
							result: 'base64',
							resize: true,
							width: 300,
							height: 300,
						})
					: autoFill
						? bufferPromise
							? armed(bufferPromise.then((b) =>
									Toolkit.getMp4Preview(b, {
										time: 0,
										result: 'base64',
									})
								))
							: null
						: null;

			this._sections.push(
				AIRich.newLayout('Single', {
					media: {
						url,
						mime_type: isObject ? (item.mime_type ?? 'video/mp4') : 'video/mp4',
						file_length,
						duration,
					},
					imagine_type: 'ANIMATE',
					status: { status: 'READY' },
					thumbnail: {
						raw_media: thumbnail,
					},
					__typename: 'GenAIImaginePrimitive',
				})
			);
		});

		return this;
	}

	/** Add an inline product card (or array of cards). Each item needs at least a `title`. */
	addProduct(data = {}, { resolveUrl = false } = {}) {
		if (!((data && typeof data === 'object' && !Array.isArray(data)) || (Array.isArray(data) && data.every((item) => item && typeof item === 'object' && !Array.isArray(item))))) {
			throw new TypeError('Product items must be an object or an array of objects');
		}

		const itemsToCheck = Array.isArray(data) ? data : [data];
		const missingTitleAt = itemsToCheck.findIndex((item) => !item.title);
		if (missingTitleAt !== -1) {
			throw new TypeError(`addProduct() item[${missingTitleAt}] is missing a required "title"`);
		}

		this._submessages.push({
			messageType: 2,
			messageText: '[ Product could not be loaded ]',
		});

		const items = Array.isArray(data) ? data : [data];

		const product = items.map((item) => ({
			title: item.title,
			brand: item.brand,
			price: item.price,
			sale_price: item.sale_price,
			product_url: item.product_url ?? item.url,
			image: {
				url: Toolkit.resolveMedia(this.#client, item.image_url ?? item.image, 'image', { resolveUrl }),
			},
			additional_images: [
				{
					url: Toolkit.resolveMedia(this.#client, item.icon_url ?? item.icon, 'image', { resolveUrl }),
				},
			],
			__typename: 'GenAIProductItemCardPrimitive',
		}));

		this._sections.push(AIRich.newLayout(Array.isArray(data) ? 'HScroll' : 'Single', Array.isArray(data) ? product : product[0]));

		return this;
	}

	/** Add an inline social-post style card (or array of cards). */
	addPost(data = {}, { resolveUrl = false } = {}) {
		if (!((data && typeof data === 'object' && !Array.isArray(data)) || (Array.isArray(data) && data.every((item) => item && typeof item === 'object' && !Array.isArray(item))))) {
			throw new TypeError('Post items must be an object or an array of objects');
		}

		const posts = Array.isArray(data) ? data : [data];

		this._submessages.push({
			messageType: 2,
			messageText: '[ Post could not be loaded ]',
		});

		const primitives = posts.map((p) => ({
			title: p.title ?? '',
			subtitle: p.subtitle ?? '',
			username: p.username ?? '',
			profile_picture_url: Toolkit.resolveMedia(this.#client, p.profile_picture_url ?? p.profile_url ?? p.profile ?? '', 'image', { resolveUrl }),
			is_verified: !!(p.is_verified || p.verified),
			thumbnail_url: Toolkit.resolveMedia(this.#client, p.thumbnail_url ?? p.thumbnail ?? '', 'image', { resolveUrl }),
			post_caption: p.post_caption ?? p.caption ?? '',
			likes_count: p.likes_count ?? p.like ?? 0,
			comments_count: p.comments_count ?? p.comment ?? 0,
			shares_count: p.shares_count ?? p.share ?? 0,
			post_url: p.post_url ?? p.url ?? '',
			post_deeplink: p.post_deeplink ?? p.deeplink ?? '',
			source_app: p.source_app || p.source || 'INSTAGRAM',
			footer_label: p.footer_label ?? p.footer ?? '',
			footer_icon: Toolkit.resolveMedia(this.#client, p.footer_icon ?? p.icon ?? '', 'image', { resolveUrl }),
			is_carousel: posts.length > 1,
			orientation: p.orientation ?? 'LANDSCAPE',
			post_type: p.post_type ?? 'VIDEO',
			__typename: 'GenAIPostPrimitive',
		}));

		this._sections.push(AIRich.newLayout('HScroll', primitives));

		return this;
	}

	// JAP@Add 24-08-26 --- JAPofc original v4.7 additions (setResponseId/setBotResponseId/
	// refreshResponseId/refreshBotResponseId), rewritten for this fork. Pins the two ids build()
	// generates (see constructor comment) so a rebuilt message can reuse the same response_id/
	// botResponseId — needed for editing an already-sent AIRich message in place.

	/** Pin `unifiedResponse.response_id` to a specific value instead of a fresh random one each build() — needed to re-send an edited version of an already-sent message in place. */
	setResponseId(id) {
		if (typeof id !== 'string' || !id) throw new TypeError('setResponseId(id) requires a non-empty string');
		this._responseId = id;
		return this;
	}

	/** Un-pin `unifiedResponse.response_id`, generating a fresh crypto.randomUUID() immediately (not deferred to the next build()). */
	refreshResponseId() {
		this._responseId = crypto.randomUUID();
		return this;
	}

	/** Pin `botMetadata.botResponseId` to a specific value instead of a fresh random one each build(). */
	setBotResponseId(id) {
		if (typeof id !== 'string' || !id) throw new TypeError('setBotResponseId(id) requires a non-empty string');
		this._botResponseId = id;
		return this;
	}

	/** Un-pin `botMetadata.botResponseId`, generating a fresh crypto.randomUUID() immediately. */
	refreshBotResponseId() {
		this._botResponseId = crypto.randomUUID();
		return this;
	}

	// JAP@Add 25-08-26 --- JAPofc original v4.7 additions (hasId/getIds/peek/delete).
	// That fork tracked every block in a unified `_nodes` array so query/delete-by-id was free;
	// this fork instead tracks blocks in the `_blocks` Map (id -> {subItems, secItems}, populated
	// by the constructor's Proxy on every add*/set* call that passes {id}) but never exposed a way
	// to query or undo one after the fact — you could insertAt an id but never inspect, check, or
	// remove it. These 4 read/delete that same Map, so no changes to the Proxy itself were needed.

	/** Check whether a block id was registered by an earlier `add*()`/`set*()` call passing `{id}`. */
	hasId(id) {
		return typeof id === 'string' && this._blocks.has(id);
	}

	/** List every block id registered so far, in no particular order. */
	getIds() {
		return [...this._blocks.keys()];
	}

	/** Inspect a registered block without modifying it. Returns `null` if `id` isn't registered. */
	peek(id) {
		const block = this._blocks.get(id);
		if (!block) return null;

		return { id, sections: [...block.secItems], submessages: [...block.subItems] };
	}

	/** Remove a previously-added block (by the `id` passed to its `add*()`/`set*()` call) from the message. Throws if `id` isn't registered. */
	delete(id) {
		const block = this._blocks.get(id);
		if (!block) throw new Error(`delete(id): no block registered with id "${id}"`);

		for (const item of block.subItems) {
			const idx = this._submessages.indexOf(item);
			if (idx !== -1) this._submessages.splice(idx, 1);
		}
		for (const item of block.secItems) {
			const idx = this._sections.indexOf(item);
			if (idx !== -1) this._sections.splice(idx, 1);
		}

		this._blocks.delete(id);
		return this;
	}

	/** Add a small metadata-style text line (`GenAIMetadataTextPrimitive`) — same visual style as the auto-appended footer/`addTip()`'s callout, but insertable anywhere and without `addTip()`'s icon prefix. */
	addMetadata(text) {
		if (typeof text !== 'string' || !text) throw new TypeError('addMetadata(text) requires a non-empty string');

		this._submessages.push({
			messageType: 2,
			messageText: text,
		});

		this._sections.push(
			AIRich.newLayout('Single', {
				text,
				__typename: 'GenAIMetadataTextPrimitive',
			})
		);

		return this;
	}

	/** Add a small "tip" callout banner. @param {string} text */
	addTip(text) {
		if (typeof text !== 'string' || !text) {
			throw new TypeError('addTip(text) requires a non-empty string');
		}

		this._submessages.push({
			messageType: 2,
			messageText: text,
		});

		this._sections.push(
			AIRich.newLayout('Single', {
				text,
				__typename: 'GenAIMetadataTextPrimitive',
			})
		);

		return this;
	}

	// JAP@Add 22-08-26 (v4.7) --- addHeading/addWidget/addFooterAction: 3 primitives
	// reverse-engineered from captured Meta-AI-in-WhatsApp traffic that this project's own crm/snip
	// tooling (see rich-message-utils.js) dumps for study. Not in any public Baileys schema, so
	// unknown enum values (kind/state on addWidget's ctas) are passed through as observed rather
	// than guessed at, and documented as experimental below.
	// JAP@Fix 25-08-26 --- removed addImageCard(): its GenAIImagePrimitive/preview_image+full_image
	// shape was mis-reverse-engineered (not a real WA schema) and crashed the client renderer on
	// arrival. addImage() already covers static image cards correctly — use that instead.

	/** Add a large heading-style text block (`FOATextPrimitive`) — visually distinct from `addText()`'s regular paragraph text. */
	addHeading(text) {
		if (typeof text !== 'string' || !text) {
			throw new TypeError('addHeading(text) requires a non-empty string');
		}

		this._submessages.push({
			messageType: 2,
			messageText: text,
		});

		this._sections.push(
			AIRich.newLayout('Single', {
				text,
				__typename: 'FOATextPrimitive',
			})
		);

		return this;
	}

	/**
	 * Add a "3P extension" widget card (`GenAI3PExtWidgetPrimitive`) — a small panel with a title and
	 * a row of tappable CTA chips. Per captured traffic these CTAs call back into a tool (`tool_call_id`)
	 * rather than opening a url; `kind`/`state` semantics beyond the observed `'OTHER'`/`'PENDING'`
	 * defaults aren't publicly documented, so treat this as experimental.
	 *
	 * JAP@Add (v4.8) --- accepts an `{ layout }` override so consecutive `addWidget()` calls can
	 * pick different renderings (e.g. one `HScroll` row, one `ActionRow` stack) instead of always
	 * inferring HScroll-for-array/Single-for-object from the shape of `data`. Also accepts either
	 * `ctas` (original key, matches the wire field) or `actions` (alias) on each item — whichever
	 * is present is used; `ctas` wins if both are somehow given.
	 * @param {Record<string, any>|Record<string, any>[]} data `{ title, ctas|actions: [{ label, tool_call_id?, kind?, state?, toast? }] }` (single or array).
	 * @param {{layout?: 'Single'|'HScroll'|'ActionRow'|string}} [options] `layout` overrides the default single/array inference.
	 */
	addWidget(data = {}, { layout } = {}) {
		const items = Array.isArray(data) ? data : [data];

		// JAP@Fix (bug 44) --- layout: 'Single' forces `widgets[0]` below (a "Single" layout's
		// view_model can only ever hold one `primitive`, never a `primitives` array — see
		// newLayout()). Previously an explicit { layout: 'Single' } combined with a multi-item
		// array silently dropped every item past the first with no error. Fail loud instead.
		if (layout === 'Single' && items.length > 1) {
			throw new TypeError(`addWidget(): layout "Single" can only hold one widget (got ${items.length}) — use "HScroll"/"ActionRow" (or omit layout) for multiple`);
		}

		items.forEach((item, i) => {
			// header.title or top-level title required
			const hasTitle = item?.title || item?.header?.title;
			if (!hasTitle) {
				throw new TypeError(`addWidget() item[${i}] is missing a required "title" (or "header.title")`);
			}
			const ctas = item.ctas ?? item.actions;
			if (!Array.isArray(ctas) || !ctas.length) {
				throw new TypeError(`addWidget() item[${i}] requires a non-empty "ctas" (or "actions") array`);
			}
		});

		this._submessages.push({
			messageType: 2,
			messageText: items.map((item) => item.header?.title ?? item.title).join(', '),
		});

		// JAP@Fix (bug 45) --- auto tool_call_id used to be `idx` scoped per-item (ctas.map's own
		// index), resetting to 0 for every widget item. Two items (or two separate addWidget()
		// calls) that both omit tool_call_id/id ended up minting the identical auto id ("00"),
		// so a CTA tap could route to the wrong widget's tool call. Track the counter on the
		// instance instead so every auto-generated id is unique for this AIRich's lifetime.
		this._widgetCtaCounter ??= 0;

		const widgets = items.map((item) => {
			const ctas = item.ctas ?? item.actions;
			// header accepts either a string title (legacy) or an object { title, subtitle }
			const headerTitle = item.header?.title ?? item.title;
			const headerSubtitle = item.header?.subtitle ?? item.subtitle ?? undefined;
			return {
				header: {
					title: headerTitle,
					...(headerSubtitle !== undefined && { subtitle: headerSubtitle }),
					__typename: 'GenAI3PExtWidgetStandardHeader',
				},
				body: {
					sections: item.sections ?? [],
					ctas: ctas.map((cta) => ({
						label: cta.label ?? '',
						state: cta.state ?? 'PENDING',
						kind: cta.kind ?? 'OTHER',
						tool_call_id: cta.tool_call_id ?? cta.id ?? String(this._widgetCtaCounter++).padStart(2, '0'),
						...(cta.toast !== false && {
							toast: { label: typeof cta.toast === 'string' ? cta.toast : headerTitle, __typename: 'GenAI3PExtWidgetToast' },
						}),
						__typename: 'GenAI3PExtWidgetCTA',
					})),
					__typename: item.body_typename ?? 'GenAI3PExtCalendarEventList',
				},
				__typename: 'GenAI3PExtWidgetPrimitive',
			};
		});

		const resolvedLayout = layout ?? (Array.isArray(data) ? 'HScroll' : 'Single');
		const asArray = resolvedLayout !== 'Single';

		this._sections.push(AIRich.newLayout(resolvedLayout, asArray ? widgets : widgets[0]));

		return this;
	}

	/**
	 * Add footer action link(s) (`GenAIFooterActionPrimitive`) — e.g. "Join our WhatsApp Group/Channel"
	 * chips shown below the response, separate from `setFooter()`'s plain text footer.
	 * @param {{text: string, url: string, type?: string}|{text: string, url: string, type?: string}[]} actions
	 */
	addFooterAction(actions) {
		const items = Array.isArray(actions) ? actions : [actions];

		items.forEach((item, i) => {
			if (!item?.text || !item?.url) {
				throw new TypeError(`addFooterAction() item[${i}] requires both "text" and "url"`);
			}
		});

		const primitives = items.map((item) => ({
			cta_text: item.text,
			cta_type: item.type ?? 'OPEN_URL',
			cta_url: item.url,
			__typename: 'GenAIFooterActionPrimitive',
		}));

		this._sections.push(AIRich.newLayout('HScroll', primitives));

		return this;
	}

	// JAP@Add (v4.8) --- 8 primitives from the 20-item reference test script that had no
	// add*() helper yet (Divider/Spacer/Task/ProgressStatus/ThinkingStatus/QuotaUpsell/FOABloks
	// have no dedicated AIRichResponseSubMessageType — WA carries them purely in the
	// unifiedResponse view-model JSON, so their submessage falls back to plain AI_RICH_RESPONSE_TEXT
	// like addTip/addHeading already do. Latex is the one exception: it has a real proto type
	// (AI_RICH_RESPONSE_LATEX = 8, confirmed in WAProto) with its own latexMetadata, so that one
	// gets a proper submessage instead of the text fallback.

	/** Add a plain horizontal divider line (`GenAIDividerPrimitive`, no content). */
	addDivider() {
		this._submessages.push({ messageType: 2, messageText: '---' });
		this._sections.push(AIRich.newLayout('Single', { __typename: 'GenAIDividerPrimitive' }));
		return this;
	}

	/** Add blank vertical spacing (`GenAISpacerPrimitive`). @param {number} [spacing=1] Spacing unit, per observed traffic. */
	addSpacer(spacing = 1) {
		if (typeof spacing !== 'number' || spacing < 0) {
			throw new TypeError('addSpacer(spacing) requires a non-negative number');
		}
		this._submessages.push({ messageType: 2, messageText: `spasi ${spacing}` });
		this._sections.push(AIRich.newLayout('Single', { spacing, __typename: 'GenAISpacerPrimitive' }));
		return this;
	}

	/**
	 * Add a rendered LaTeX expression (`GenAILatexUXPrimitive`), with a real `AI_RICH_RESPONSE_LATEX`
	 * submessage (unlike most primitives in this block, this one has a proper proto type).
	 * @param {string} expression LaTeX source, e.g. `'$$E = mc^2$$'`.
	 */
	addLatex(expression) {
		if (typeof expression !== 'string' || !expression) {
			throw new TypeError('addLatex(expression) requires a non-empty string');
		}
		this._submessages.push({
			messageType: 8,
			latexMetadata: { text: expression, expressions: [{ latexExpression: expression }] },
		});
		this._sections.push(AIRich.newLayout('Single', { latex_expression: expression, __typename: 'GenAILatexUXPrimitive' }));
		return this;
	}

	/**
	 * Add a task/checklist card (`GenAITaskPrimitive`).
	 * @param {{task_id?: string, title: string, subtitle?: string, status?: string}} data
	 */
	addTask(data = {}) {
		if (!data?.title) {
			throw new TypeError('addTask() requires a "title"');
		}
		this._submessages.push({ messageType: 2, messageText: `Tugas: ${data.title}` });
		this._sections.push(
			AIRich.newLayout('Single', {
				task_id: data.task_id ?? '',
				title: data.title,
				subtitle: data.subtitle ?? '',
				status: data.status ?? 'IN_PROGRESS',
				__typename: 'GenAITaskPrimitive',
			})
		);
		// Safety net: GenAITaskPrimitive is a custom AI-only component the stock WA client
		// doesn't render visibly. Append a plain text section so the task is still visible.
		// Set data.textFallback = false to skip.
		if (data.textFallback !== false) {
			const fallbackText = data.subtitle ? `${data.title} — ${data.subtitle}` : data.title;
			this._sections.push(AIRich.newLayout('Single', { text: `Tugas: ${fallbackText}`, __typename: 'FOATextPrimitive' }));
		}
		return this;
	}

	/**
	 * Add a "searching/working" progress banner (`GenAIBotProgressStatusPrimitive`) — a one-shot
	 * status chip (unlike `addSuggest`, this isn't tappable). Distinct from `addThinkingStatus()`'s
	 * icon/typename.
	 * @param {string} title
	 * @param {{icon?: string, is_in_progress?: boolean}} [options]
	 */
	addProgressStatus(title, { icon = 'SEARCH', is_in_progress = true, target_secondary_screen_id, target_secondary_screen_tab_id } = {}) {
		if (typeof title !== 'string' || !title) {
			throw new TypeError('addProgressStatus(title) requires a non-empty string');
		}
		this._submessages.push({ messageType: 2, messageText: title });
		const primitive = {
			title,
			icon,
			is_in_progress,
			meta_search_apps: [],
			__typename: 'GenAIBotProgressStatusPrimitive',
		};
		// NOTE: these two fields must be OMITTED when unset, not sent as `null` —
		// an explicit null here was reproducibly crashing the WA client renderer
		// on group-open/media-download. Only include when the caller actually passes one.
		if (target_secondary_screen_id != null) primitive.target_secondary_screen_id = target_secondary_screen_id;
		if (target_secondary_screen_tab_id != null) primitive.target_secondary_screen_tab_id = target_secondary_screen_tab_id;
		this._sections.push(AIRich.newLayout('Single', primitive));
		return this;
	}

	/** Add a "thinking" status banner (`GenAIBotThinkingStatusPrimitive`). See `addProgressStatus()`. */
	addThinkingStatus(title, { icon = 'THINKING', is_in_progress = true, target_secondary_screen_id, target_secondary_screen_tab_id, textFallback = true } = {}) {
		if (typeof title !== 'string' || !title) {
			throw new TypeError('addThinkingStatus(title) requires a non-empty string');
		}
		this._submessages.push({ messageType: 2, messageText: title });
		const primitive = {
			title,
			icon,
			is_in_progress,
			meta_search_apps: [],
			__typename: 'GenAIBotThinkingStatusPrimitive',
		};
		// Same crash-avoidance rule as addProgressStatus(): omit, never null.
		if (target_secondary_screen_id != null) primitive.target_secondary_screen_id = target_secondary_screen_id;
		if (target_secondary_screen_tab_id != null) primitive.target_secondary_screen_tab_id = target_secondary_screen_tab_id;
		this._sections.push(AIRich.newLayout('Single', primitive));
		// Safety net: stock WA client doesn't render this primitive's own view (it's meant
		// as a transient spinner in the official app), so the card shows blank when forwarded.
		// Append a plain text section so the title is still visible. Set { textFallback: false } to skip.
		if (textFallback) {
			this._sections.push(AIRich.newLayout('Single', { text: title, __typename: 'FOATextPrimitive' }));
		}
		return this;
	}

	/**
	 * Add a subscription-quota-limit upsell card (`GenAIMetaSubsQuotaUpsellPrimitive`).
	 * @param {{title: string, body?: string, body_line1?: string, body_line2?: string, buttons?: {label: string, action?: string, deeplink?: string}[]}} data
	 */
	addQuotaUpsell(data = {}) {
		if (!data?.title) {
			throw new TypeError('addQuotaUpsell() requires a "title"');
		}
		this._submessages.push({ messageType: 2, messageText: data.title });
		this._sections.push(
			AIRich.newLayout('Single', {
				title: data.title,
				body: data.body ?? '',
				body_line1: data.body_line1 ?? '',
				body_line2: data.body_line2 ?? '',
				buttons: (data.buttons ?? []).map((b) => ({
					label: b.label ?? '',
					action: b.action ?? 'OPEN_DEEPLINK',
					deeplink: b.deeplink ?? '',
				})),
				__typename: 'GenAIMetaSubsQuotaUpsellPrimitive',
			})
		);
		return this;
	}

	/**
	 * Add a raw Bloks payload (`FOABloksPrimitive`) — Meta's internal UI-description format.
	 * Escape hatch: field meaning beyond what's passed through is undocumented, so this is the
	 * most experimental primitive in this block; pass whatever your captured traffic shows.
	 * @param {{type: string, data: string, uuid?: string, initial_response?: any, versioning_id?: string}} data
	 */
	addBloks(data = {}) {
		if (!data?.type) {
			throw new TypeError('addBloks() requires a "type"');
		}
		this._submessages.push({ messageType: 2, messageText: 'Bloks' });
		const primitive = {
			type: data.type,
			data: data.data ?? '{}',
			uuid: data.uuid ?? '',
			versioning_id: data.versioning_id ?? '',
			__typename: 'FOABloksPrimitive',
		};
		// Omit initial_response entirely when unset — same null-field crash as addProgressStatus/addThinkingStatus.
		if (data.initial_response != null) primitive.initial_response = data.initial_response;
		this._sections.push(AIRich.newLayout('Single', primitive));
		// Safety net: FOABloksPrimitive needs a real, client-registered Bloks screen to render
		// anything — arbitrary/placeholder payloads show up blank. Append a plain text section
		// so the card isn't empty. Set data.textFallback = false to skip.
		if (data.textFallback !== false) {
			this._sections.push(AIRich.newLayout('Single', { text: `Bloks: ${data.type}`, __typename: 'FOATextPrimitive' }));
		}
		return this;
	}

	/** Add tappable follow-up suggestion chips below the message. @param {string|string[]} suggestion */
	addSuggest(suggestion, { scroll = true, layout } = {}) {
		if (!(typeof suggestion === 'string' || (Array.isArray(suggestion) && suggestion.every((v) => typeof v === 'string')))) {
			throw new TypeError('Suggestion must be a string or array of strings');
		}

		const suggest = Array.isArray(suggestion)
			? suggestion.map((text) => ({
					prompt_text: text,
					prompt_type: 'SUGGESTED_PROMPT',
					__typename: 'GenAIFollowUpSuggestionPillPrimitive',
				}))
			: [
					{
						prompt_text: suggestion,
						prompt_type: 'SUGGESTED_PROMPT',
						__typename: 'GenAIFollowUpSuggestionPillPrimitive',
					},
				];

		const type = layout ?? (suggest.length === 1 ? 'Single' : scroll ? 'HScroll' : 'ActionRow');

		this._sections.push(AIRich.newLayout(type, type === 'Single' ? suggest[0] : suggest, { __typename: 'GenAIUnifiedResponseSection' }));

		return this;
	}

	/** @returns {Promise<Record<string, any>>} The generated AI-rich message content (without wrapping/sending it). */
	async build({ forwarded = true, notification = false, includesUnifiedResponse = true, includesSubmessages = true, quoted, quotedParticipant, ...options } = {}) {
		const forward = forwarded
			? {
					forwardingScore: 1,
					isForwarded: true,
					forwardedAiBotMessageInfo: { botJid: '0@bot' },
					forwardOrigin: 4,
				}
			: {};

		const notif = notification
			? {
					sessionTransparencyMetadata: {
						disclaimerText: '~ Ahmad tumbuh kembang',
						hcaId: `hca_${Date.now()}`,
						sessionTransparencyType: 1,
					},
				}
			: {};

		const qObj = quoted
			? {
					stanzaId: quoted?.key?.id || quoted?.id,
					participant: quotedParticipant || quoted?.key?.participant || quoted?.key?.remoteJid,
					quotedType: 0,
					quotedMessage: typeof quoted === 'object' && quoted !== null ? (quoted.message ?? quoted) : undefined,
				}
			: {};

		const sections = this._footer
			? [
					...(await waitAllPromises(this._sections)),
					AIRich.newLayout('Single', {
						text: this._footer,
						__typename: 'GenAIMetadataTextPrimitive',
					}),
				]
			: [...(await waitAllPromises(this._sections))];

		// JAP@Merge 15-08-26 --- Neither blurose nor arslan sign the bot metadata with
		// verificationMetadata (proofs/certificateChain). Backported from this project's own
		// rich-message-utils.js botMetadataSignature/botMetadataCertificate helpers, plus a
		// botResponseId tying the signed metadata to unifiedResponse.response_id.
		// JAP@Fix 24-08-26 --- was `const responseId = crypto.randomUUID()` shared for BOTH
		// unifiedResponse.response_id and botMetadata.botResponseId, generated fresh every build()
		// with no override. Now each has its own id, pinned via setResponseId()/setBotResponseId()
		// if the caller set one (for sendEdit()-style in-place message updates), otherwise still
		// defaults to a fresh randomUUID() per build() exactly like before.
		const responseId = this._responseId ?? crypto.randomUUID();
		const botResponseId = this._botResponseId ?? crypto.randomUUID();

		return {
			messageContextInfo: {
				deviceListMetadata: {},
				deviceListMetadataVersion: 2,
				botMetadata: {
					messageDisclaimerText: this._title,
					richResponseSourcesMetadata: { sources: this._richResponseSources },
					botResponseId: botResponseId,
					verificationMetadata: {
						proofs: [
							{
								certificateChain: [botMetadataCertificate(), botMetadataCertificate(892)],
								version: 1,
								useCase: 1,
								signature: botMetadataSignature(),
							},
						],
					},
					...notif,
				},
			},
			...this._extraPayload,
			botForwardedMessage: {
				message: {
					richResponseMessage: {
						messageType: 1,
						submessages: includesSubmessages ? await waitAllPromises(this._submessages) : [],
						unifiedResponse: {
							data: includesUnifiedResponse ? Buffer.from(JSON.stringify({ response_id: responseId, sections })).toString('base64') : '',
						},
						contextInfo: {
							...forward,
							...qObj,
							...this._contextInfo,
						},
					},
				},
			},
		};
	}

	// JAP@Fix (bug 42 / inline image fallback) --- WA won't render AIRichResponseInlineImageMetadata
	// for bot-sent messages (confirmed: even a valid WA-CDN url with mediaKey stays blank), so any
	// image added via addInlineImage() is sent here as a normal imageMessage instead. Pass
	// { skipImageFallback: true } to opt out and send only the (image-less-looking) rich card.
	// JAP@Fix: don't spread relayMessage-shaped `options` into sendMessage()'s options param —
	// the two calls expect different option shapes, so the fallback now only forwards `quoted`
	// (the one option that clearly applies to both) instead of blindly spreading everything.
	/** Build and send this AI-rich message. @param {string} jid Destination chat/group jid. @param {boolean} [skipImageFallback] Skip auto-resending inline images as a plain imageMessage. */
	async send(jid, { forwarded, notification, includesUnifiedResponse, includesSubmessages, skipImageFallback = false, quoted, messageId, ...options } = {}) {
		const msg = await this.build({ forwarded, notification, includesUnifiedResponse, includesSubmessages, quoted, ...options });

		if (!skipImageFallback && this._inlineImages.length) {
			for (const { url, caption } of this._inlineImages) {
				try {
					await this.#client.sendMessage(jid, { image: { url }, caption }, quoted ? { quoted } : {});
				} catch (err) {
					// JAP@Fix: don't let a fallback image failure block the actual rich card from sending
					this.#client.logger?.warn?.({ err, url }, 'inline image fallback failed, continuing with rich card');
				}
			}
		}

		// JAP@Add --- pin our own messageId (instead of letting relayMessage mint one internally)
		// so we know exactly which id was sent, and stash it as _lastMessageKey. That's what lets
		// sendEdit() be called with no args afterwards and still know which message to patch.
		messageId = messageId || generateMessageIDV2();

		await this.#client.relayMessage(jid, msg, { messageId, ...options });

		this._lastMessageKey = { remoteJid: jid, fromMe: true, id: messageId };

		return { key: this._lastMessageKey, message: msg };
	}

	/**
	 * Build a `protocolMessage` (type EDIT) that patches an already-sent AIRich message in place.
	 * @param {string} targetJid Chat the original message lives in.
	 * @param {string} targetId `key.id` of the original message (the id `send()`/`sendEdit()` returned).
	 * @param {object} [opts] Pass `{ msg }` to reuse an already-built content object instead of rebuilding via build().
	 */
	async buildEdit(targetJid, targetId, { msg, messageId, ...options } = {}) {
		const editedMessage = msg || (await this.build({ ...options }));

		if (!editedMessage) {
			throw new Error('buildEdit: no message content to edit (build() returned nothing)');
		}

		return generateWAMessageFromContent(
			targetJid,
			{
				protocolMessage: {
					key: {
						remoteJid: targetJid,
						fromMe: true,
						id: targetId,
					},
					type: 14, // MESSAGE_EDIT
					editedMessage,
				},
			},
			{ messageId: messageId || generateMessageIDV2(), ...options }
		);
	}

	/**
	 * Rebuild this AIRich message's current content and patch it into an already-sent message in place
	 * (WA edits the bubble instead of showing a new one). With no args, edits the message from the last
	 * send()/sendEdit() call — that's the flow `.addX(...); await rich.sendEdit();` relies on.
	 * @param {string} [jid] Defaults to the jid from the last send()/sendEdit().
	 * @param {string} [id] Defaults to the message id from the last send()/sendEdit().
	 */
	async sendEdit(jid, id, { msg, messageId, additionalNodes = [], ...options } = {}) {
		jid = jid ?? this._lastMessageKey?.remoteJid;
		id = id ?? this._lastMessageKey?.id;

		if (!jid) {
			throw new Error('sendEdit: no jid — pass one explicitly, or call send() first');
		}

		if (!id) {
			throw new Error('sendEdit: no message id — pass one explicitly, or call send() first');
		}

		const msgEdit = await this.buildEdit(jid, id, {
			msg,
			messageId: messageId || generateMessageIDV2(),
			...options,
		});

		await this.#client.relayMessage(jid, msgEdit.message, {
			messageId: msgEdit.key.id,
			additionalNodes,
		});

		// JAP@Note --- deliberately NOT overwriting _lastMessageKey with msgEdit.key here: the
		// protocolMessage envelope has its own id, but the message the user actually sees (and the
		// one future sendEdit() calls need to keep patching) is still `id`/`jid` above.
		return msgEdit;
	}

	/**
	 * JAP@Add --- progressive text reveal: send once, then patch the same
	 * message in place via EDIT protocolMessages until the full text is out.
	 * This is the "AI typing" effect Meta AI itself uses — one chat bubble
	 * that grows, not a flood of messages.
	 *
	 * ```js
	 * await new AIRich(sock).streamText(jid, longAnswer, { chunkSize: 120, intervalMs: 900 })
	 * ```
	 *
	 * Accepts a plain string (split at word boundaries every ~`chunkSize`
	 * chars) or a pre-split array of chunks (appended in order). Other blocks
	 * already added to this builder render alongside the streamed text and
	 * stay put across every edit. While streaming, the bubble shows `cursor`
	 * after the partial text (pass `cursor: ''` to disable); the final edit
	 * removes it. Between edits it waits `intervalMs` (min 300 — WA relays
	 * rate-limit aggressive edit bursts).
	 *
	 * Resolves `{ key, text, edits }` — `key` is the visible message key
	 * (also stored, so a later `sendEdit()` with no args keeps patching the
	 * same bubble).
	 */
	async streamText(jid, text, { chunkSize = 120, intervalMs = 900, cursor = ' ▍', ...sendOpts } = {}) {
		if (!jid) throw new TypeError('streamText(jid, text) requires a jid');
		const chunks = Array.isArray(text) ? text.map(String) : AIRich.#splitStream(String(text ?? ''), chunkSize);
		if (!chunks.length || chunks.every((c) => !c)) throw new TypeError('streamText(jid, text) requires non-empty text');

		const self = this._self ?? this; // route add*() through the Proxy bookkeeping
		const blockId = `jap-stream-${crypto.randomUUID()}`;
		const waitMs = Math.max(300, Number(intervalMs) || 0);
		const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

		let revealed = '';
		let edits = 0;
		for (let i = 0; i < chunks.length; i += 1) {
			revealed += chunks[i];
			const isLast = i === chunks.length - 1;
			const shown = isLast ? revealed : revealed + (cursor || '');
			if (i === 0) {
				self.addText(shown, { id: blockId });
				await this.send(jid, sendOpts);
			} else {
				await delay(waitMs);
				self.addText(shown, { replace: blockId });
				await this.sendEdit();
				edits += 1;
			}
		}
		return { key: this._lastMessageKey, text: revealed, edits };
	}

	/** Split `text` into ~chunkSize-char pieces, preferring word boundaries so no chunk ends mid-word. */
	static #splitStream(text, chunkSize) {
		const size = Math.max(1, Number(chunkSize) || 120);
		const chunks = [];
		let i = 0;
		while (i < text.length) {
			if (text.length - i <= size) {
				chunks.push(text.slice(i));
				break;
			}
			let cut = i + size;
			const lastSpace = text.lastIndexOf(' ', cut);
			if (lastSpace > i) cut = lastSpace + 1; // keep the space with the earlier chunk
			chunks.push(text.slice(i, cut));
			i = cut;
		}
		return chunks;
	}

	/** Tokenize `code` into `{ type, value }` spans for syntax highlighting. Covers JS/TS/Python/Java and more; unsupported languages fall back to a single plain-text token. */
	static tokenizer(code, lang = 'javascript') {
		const keywordsMap = {
			javascript: new Set([
				'break',
				'case',
				'catch',
				'continue',
				'debugger',
				'delete',
				'do',
				'else',
				'finally',
				'for',
				'function',
				'if',
				'in',
				'instanceof',
				'new',
				'return',
				'switch',
				'this',
				'throw',
				'try',
				'typeof',
				'var',
				'void',
				'while',
				'with',
				'true',
				'false',
				'null',
				'undefined',
				'class',
				'const',
				'let',
				'super',
				'extends',
				'export',
				'import',
				'yield',
				'static',
				'constructor',
				'async',
				'await',
				'get',
				'set',
			]),

			typescript: new Set([
				'abstract',
				'any',
				'as',
				'asserts',
				'bigint',
				'boolean',
				'declare',
				'enum',
				'implements',
				'infer',
				'interface',
				'is',
				'keyof',
				'module',
				'namespace',
				'never',
				'readonly',
				'require',
				'number',
				'object',
				'override',
				'private',
				'protected',
				'public',
				'satisfies',
				'string',
				'symbol',
				'type',
				'unknown',
				'using',
				'from',
				'break',
				'case',
				'catch',
				'continue',
				'do',
				'else',
				'finally',
				'for',
				'function',
				'if',
				'new',
				'return',
				'switch',
				'this',
				'throw',
				'try',
				'var',
				'void',
				'while',
				'class',
				'const',
				'let',
				'extends',
				'import',
				'export',
				'async',
				'await',
			]),

			python: new Set([
				'False',
				'None',
				'True',
				'and',
				'as',
				'assert',
				'async',
				'await',
				'break',
				'class',
				'continue',
				'def',
				'del',
				'elif',
				'else',
				'except',
				'finally',
				'for',
				'from',
				'global',
				'if',
				'import',
				'in',
				'is',
				'lambda',
				'nonlocal',
				'not',
				'or',
				'pass',
				'raise',
				'return',
				'try',
				'while',
				'with',
				'yield',
			]),

			java: new Set([
				'abstract',
				'assert',
				'boolean',
				'break',
				'byte',
				'case',
				'catch',
				'char',
				'class',
				'const',
				'continue',
				'default',
				'do',
				'double',
				'else',
				'enum',
				'extends',
				'final',
				'finally',
				'float',
				'for',
				'goto',
				'if',
				'implements',
				'import',
				'instanceof',
				'int',
				'interface',
				'long',
				'native',
				'new',
				'package',
				'private',
				'protected',
				'public',
				'return',
				'short',
				'static',
				'strictfp',
				'super',
				'switch',
				'synchronized',
				'this',
				'throw',
				'throws',
				'transient',
				'try',
				'void',
				'volatile',
				'while',
			]),

			golang: new Set([
				'break',
				'case',
				'chan',
				'const',
				'continue',
				'default',
				'defer',
				'else',
				'fallthrough',
				'for',
				'func',
				'go',
				'goto',
				'if',
				'import',
				'interface',
				'map',
				'package',
				'range',
				'return',
				'select',
				'struct',
				'switch',
				'type',
				'var',
			]),

			c: new Set([
				'auto',
				'break',
				'case',
				'char',
				'const',
				'continue',
				'default',
				'do',
				'double',
				'else',
				'enum',
				'extern',
				'float',
				'for',
				'goto',
				'if',
				'int',
				'long',
				'register',
				'return',
				'short',
				'signed',
				'sizeof',
				'static',
				'struct',
				'switch',
				'typedef',
				'union',
				'unsigned',
				'void',
				'volatile',
				'while',
			]),

			cpp: new Set([
				'alignas',
				'alignof',
				'and',
				'auto',
				'bool',
				'break',
				'case',
				'catch',
				'class',
				'const',
				'constexpr',
				'continue',
				'delete',
				'do',
				'double',
				'else',
				'enum',
				'explicit',
				'export',
				'extern',
				'false',
				'float',
				'for',
				'friend',
				'if',
				'inline',
				'int',
				'long',
				'mutable',
				'namespace',
				'new',
				'noexcept',
				'nullptr',
				'operator',
				'private',
				'protected',
				'public',
				'return',
				'short',
				'signed',
				'sizeof',
				'static',
				'struct',
				'switch',
				'template',
				'this',
				'throw',
				'true',
				'try',
				'typedef',
				'typename',
				'union',
				'unsigned',
				'using',
				'virtual',
				'void',
				'while',
			]),

			php: new Set([
				'abstract',
				'and',
				'array',
				'as',
				'break',
				'callable',
				'case',
				'catch',
				'class',
				'clone',
				'const',
				'continue',
				'declare',
				'default',
				'do',
				'echo',
				'else',
				'elseif',
				'empty',
				'enddeclare',
				'endfor',
				'endforeach',
				'endif',
				'endswitch',
				'endwhile',
				'extends',
				'final',
				'finally',
				'fn',
				'for',
				'foreach',
				'function',
				'global',
				'goto',
				'if',
				'implements',
				'include',
				'include_once',
				'instanceof',
				'interface',
				'match',
				'namespace',
				'new',
				'null',
				'or',
				'private',
				'protected',
				'public',
				'require',
				'require_once',
				'return',
				'static',
				'switch',
				'throw',
				'trait',
				'try',
				'use',
				'var',
				'while',
				'yield',
			]),

			rust: new Set([
				'as',
				'break',
				'const',
				'continue',
				'crate',
				'else',
				'enum',
				'extern',
				'false',
				'fn',
				'for',
				'if',
				'impl',
				'in',
				'let',
				'loop',
				'match',
				'mod',
				'move',
				'mut',
				'pub',
				'ref',
				'return',
				'self',
				'Self',
				'static',
				'struct',
				'super',
				'trait',
				'true',
				'type',
				'unsafe',
				'use',
				'where',
				'while',
			]),

			html: new Set([
				'html',
				'head',
				'body',
				'div',
				'span',
				'p',
				'a',
				'img',
				'video',
				'audio',
				'script',
				'style',
				'link',
				'meta',
				'form',
				'input',
				'button',
				'table',
				'tr',
				'td',
				'th',
				'ul',
				'ol',
				'li',
				'section',
				'article',
				'header',
				'footer',
				'nav',
				'main',
			]),

			bash: new Set([
				'if',
				'then',
				'else',
				'elif',
				'fi',
				'for',
				'while',
				'do',
				'done',
				'case',
				'esac',
				'function',
				'in',
				'select',
				'until',
				'break',
				'continue',
				'return',
				'export',
				'readonly',
				'local',
				'declare',
			]),

			markdown: new Set(['#', '##', '###', '####', '#####', '######']),
		};

		if (!lang || lang === 'txt' || lang === 'text' || lang === 'plaintext') {
			return {
				codeBlock: [
					{
						codeContent: code,
						highlightType: 0,
					},
				],
				unified_codeBlock: [
					{
						content: code,
						type: 'DEFAULT',
					},
				],
			};
		}

		const TYPE_MAP = {
			0: 'DEFAULT',
			1: 'KEYWORD',
			2: 'METHOD',
			3: 'STR',
			4: 'NUMBER',
			5: 'COMMENT',
		};

		const keywords = keywordsMap[lang.toLowerCase()] || new Set();
		const tokens = [];

		let i = 0;

		const push = (content, type) => {
			if (!content) return;

			const last = tokens[tokens.length - 1];

			if (last && last.highlightType === type) {
				last.codeContent += content;
			} else {
				tokens.push({
					codeContent: content,
					highlightType: type,
				});
			}
		};

		const isIdentifier = (char) => {
			switch (lang.toLowerCase()) {
				case 'css':
					return /[a-zA-Z0-9_$-]/.test(char);

				case 'html':
					return /[a-zA-Z0-9_$:-]/.test(char);

				default:
					return /[a-zA-Z0-9_$]/.test(char);
			}
		};

		while (i < code.length) {
			const c = code[i];

			if (/\s/.test(c)) {
				let s = i;

				while (i < code.length && /\s/.test(code[i])) {
					i++;
				}

				push(code.slice(s, i), 0);
				continue;
			}

			if ((c === '/' && code[i + 1] === '/') || (c === '#' && ['python', 'bash'].includes(lang))) {
				let s = i;

				while (i < code.length && code[i] !== '\n') {
					i++;
				}

				push(code.slice(s, i), 5);
				continue;
			}

			if (c === '"' || c === "'" || c === '`') {
				let s = i;
				const q = c;

				i++;

				while (i < code.length) {
					if (code[i] === '\\' && i + 1 < code.length) {
						i += 2;
					} else if (code[i] === q) {
						i++;
						break;
					} else {
						i++;
					}
				}

				push(code.slice(s, i), 3);
				continue;
			}

			if (/[0-9]/.test(c)) {
				let s = i;

				while (i < code.length && /[0-9._]/.test(code[i])) {
					i++;
				}

				push(code.slice(s, i), 4);
				continue;
			}

			if (/[a-zA-Z_$]/.test(c)) {
				let s = i;

				while (i < code.length && isIdentifier(code[i])) {
					i++;
				}

				const word = code.slice(s, i);

				let type = 0;

				if (keywords.has(word)) {
					type = 1;
				} else if (lang === 'css') {
					let j = i;

					while (j < code.length && /\s/.test(code[j])) {
						j++;
					}

					if (code[j] === ':') {
						type = 1;
					}
				} else if (lang === 'html') {
					let p = s - 1;

					while (p >= 0 && /\s/.test(code[p])) {
						p--;
					}

					if (code[p] === '<' || (code[p] === '/' && code[p - 1] === '<')) {
						type = 1;
					}
				}

				if (type === 0) {
					let j = i;

					while (j < code.length && /\s/.test(code[j])) {
						j++;
					}

					if (code[j] === '(') {
						type = 2;
					}
				}

				push(word, type);
				continue;
			}

			push(c, 0);
			i++;
		}

		return {
			codeBlock: tokens,
			unified_codeBlock: tokens.map((t) => ({
				content: t.codeContent,
				type: TYPE_MAP[t.highlightType],
			})),
		};
	}

	/** Convert a raw `string[][]` grid into the table metadata shape addTable()/addText() produce internally. */
	static toTableMetadata(arr, { hyperlink = true, citation = true, latex = true } = {}) {
		if (!Array.isArray(arr) || !arr.every((row) => Array.isArray(row) && row.every((cell) => typeof cell === 'string'))) {
			throw new TypeError('Table must be a nested array of strings');
		}

		const [header, ...rows] = arr;

		const maxLen = Math.max(header.length, ...rows.map((r) => r.length));

		const normalize = (r) => [...r, ...Array(maxLen - r.length).fill('')];

		const unified_rows = [
			{
				is_header: true,
				cells: normalize(header),
			},
			...rows.map((r) => ({
				is_header: false,
				cells: normalize(r),
			})),
		].map((row) => {
			const markdown_cells = row.cells.map((cell) => {
				const extracted = extractIE(cell, { hyperlink, citation, latex });

				return {
					text: extracted.text,
					...(extracted.inline_entities.length ? { inline_entities: extracted.inline_entities } : {}),
				};
			});

			return {
				...row,
				...(markdown_cells.some((c) => c.inline_entities?.length) ? { markdown_cells } : {}),
			};
		});

		const rowsMeta = unified_rows.map((r) => ({
			items: r.cells,
			...(r.is_header ? { isHeading: true } : {}),
		}));

		return {
			title: '',
			rows: rowsMeta,
			unified_rows,
		};
	}

	/**
	 * Add an "AI is generating..." placeholder card (`GenAIImaginePrimitive` with status
	 * GENERATING) — distinct from addImage()/addVideo() which always send status READY.
	 * Use this to show a pending-generation state before the real media is ready.
	 * @param {{ imagine_type?: 'IMAGE'|'ANIMATE', estimated_completion_time?: number }} [options]
	 */
	addGenerating({ imagine_type = 'IMAGE', estimated_completion_time, textFallback = true } = {}) {
		this._submessages.push({ messageType: 2, messageText: '[ Processing... ]' });
		this._sections.push(
			AIRich.newLayout('Single', {
				media: { url: '', mime_type: imagine_type === 'ANIMATE' ? 'video/mp4' : 'image/png' },
				imagine_type,
				status: {
					status: 'GENERATING',
					estimated_completion_time: estimated_completion_time ?? Math.floor(Date.now() / 1000) + 30,
				},
				__typename: 'GenAIImaginePrimitive',
			})
		);
		// JAP@Fix 23-08-26 (v4.8) --- empty media.url + GENERATING status has no instant
		// visual renderer in the stock WA client; previously the card stayed blank until WA
		// timed out on its own and showed its built-in fallback ("I can't create that image right now...").
		// Same fix class as addTask/addBloks: append a FOATextPrimitive so there is an
		// instant fallback instead of waiting for WA's timeout. Set { textFallback: false } to skip.
		if (textFallback) {
			this._sections.push(AIRich.newLayout('Single', { text: '[ Processing... ]', __typename: 'FOATextPrimitive' }));
		}
		return this;
	}

	/**
	 * Send a support-ticket marker message (`messageContextInfo.supportPayload`) — a plain
	 * conversation message tagged as an AI/support-bot ticket, distinct from richResponseMessage.
	 * @param {import('../../WAProto/index.js').WASocket} client
	 * @param {string} jid
	 * @param {string} text
	 * @param {{ ticketId?: string, isAiMessage?: boolean, shouldShowSystemMessage?: boolean, version?: number }} [options]
	 */
	static async sendSupportPayload(client, jid, text, { ticketId = crypto.randomUUID(), isAiMessage = true, shouldShowSystemMessage = true, version = 1 } = {}) {
		if (!client) throw new Error('Socket is required');
		if (typeof text !== 'string' || !text) throw new TypeError('sendSupportPayload(client, jid, text) requires a non-empty string text');

		const msg = {
			conversation: text,
			messageContextInfo: {
				messageSecret: crypto.randomBytes(32),
				supportPayload: JSON.stringify({
					version,
					is_ai_message: isAiMessage,
					should_show_system_message: shouldShowSystemMessage,
					ticket_id: ticketId,
				}),
			},
		};

		return client.relayMessage(jid, msg, {
			additionalNodes: [
				{ tag: 'bot', attrs: { biz_bot: '1' } },
				{ tag: 'biz', attrs: {} },
			],
		});
	}

	/**
	 * Send an image and video as one paired-media unit (image sent first, video linked to it via
	 * `messageAssociation`). Distinct from a plain album — the client treats them as a single group.
	 * @param {import('../../WAProto/index.js').WASocket} client
	 * @param {string} jid
	 * @param {{ image: string|Buffer, video: string|Buffer }} media
	 */
	static async sendPairedMedia(client, jid, { image, video } = {}) {
		if (!client) throw new Error('Socket is required');
		if (!image || !video) throw new TypeError('sendPairedMedia() requires both "image" and "video"');

		const imagePrepared = await prepareWAMessageMedia(
			{ image: typeof image === 'string' ? { url: image } : image },
			{ upload: client.waUploadToServer }
		);
		const videoPrepared = await prepareWAMessageMedia(
			{ video: typeof video === 'string' ? { url: video } : video },
			{ upload: client.waUploadToServer }
		);

		const imageMsg = generateWAMessageFromContent(
			jid,
			{
				imageMessage: {
					...imagePrepared.imageMessage,
					contextInfo: { pairedMediaType: 5, statusSourceType: 0 },
				},
			},
			{}
		);

		await client.relayMessage(jid, imageMsg.message, { messageId: imageMsg.key.id });

		await client.relayMessage(
			jid,
			{
				videoMessage: {
					...videoPrepared.videoMessage,
					contextInfo: { pairedMediaType: 6, statusSourceType: 0 },
				},
				messageContextInfo: {
					messageAssociation: { associationType: 12, parentMessageKey: imageMsg.key },
				},
			},
			{}
		);

		return imageMsg.key;
	}

	/** Build a raw submessage layout block by name — escape hatch for layouts not covered by the add*() helpers. */
	static newLayout(name, data, extra = {}) {
		return {
			...extra,
			view_model: {
				[Array.isArray(data) ? 'primitives' : 'primitive']: data,
				__typename: `GenAI${name}LayoutViewModel`,
			},
		};
	}
}

// JAP@Add (stable/experimental separation) ------------------------------------
// STABLE: primitives whose wire shape is derived from the WAProto schema
// (AIRichResponse* messages) — safe to build on.
// EXPERIMENTAL: primitives reverse-engineered from captured traffic with no
// public schema backing — they render today but can break without notice.
AIRich.STABLE_METHODS = new Set([
	'addSubmessage', 'addSection', 'addText', 'addCode', 'addTable', 'addLinks',
	'addContentItems', 'addInlineVideo', 'addSource', 'addImage', 'addInlineImage',
	'addVideo', 'addLatex', 'addDivider', 'addSpacer', 'addMetadata', 'addTip',
	'setResponseId', 'setBotResponseId'
]);
AIRich.EXPERIMENTAL_METHODS = new Set([
	'addHeading', 'addWidget', 'addFooterAction', 'addTask', 'addProgressStatus',
	'addThinkingStatus', 'addQuotaUpsell', 'addBloks', 'addSuggest', 'addReels',
	'addProduct', 'addPost', 'addGenerating'
]);
/** True when `name` is a reverse-engineered primitive that may break after a WhatsApp update. */
AIRich.isExperimental = (name) => AIRich.EXPERIMENTAL_METHODS.has(String(name));

/** Thin no-op subclass of `AIRich` — kept as a legacy alias for code that references `ORich` by name. */
class ORich extends AIRich {}

/**
 * "Rich AI-response" style message builder: text with hyperlink/citation/latex
 * inline entities, code blocks, tables, sources, image/video attachments,
 * inline product/post cards, tip banners and quick-reply suggestions —
 * everything ChatGPT/Gemini-in-WhatsApp-style bots typically render.
 * Also exported as `AIJap` / `LeafRich` / `JapAI` / `JapRich` (identical class, alternate names).
 */
export { AIRich, ORich };
