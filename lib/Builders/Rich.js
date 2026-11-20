import { AIRich } from './AIRich.js';

const isPlainObject = (value) => value != null && typeof value === 'object' && !Array.isArray(value);
const toArray = (value) => value == null ? [] : (Array.isArray(value) ? value : [value]);


/**
 * JAP@Add (§2.76): the complete set of keys the one-liner understands. Kept next to the
 * reader so the two cannot drift -- an unknown key is now an error, not a silent drop.
 */
export const ONE_LINER_KEYS = new Set([
	'title', 'subtitle', 'footer', 'contextInfo', 'payload',
	'markdown', 'md', 'heading', 'text', 'body', 'code', 'table', 'links', 'sources',
	'image', 'inlineImage', 'video', 'compact', 'profile', 'checklist', 'keyValue', 'keyValues',
	'progress', 'tip', 'metadata', 'divider', 'spacer', 'actions', 'footerActions',
	'suggestions', 'suggested', 'primitives', 'viewModels',
	'latex', 'task', 'tasks', 'widget', 'widgets', 'progressStatus', 'thinking', 'thinkingStatus',
	'quotaUpsell', 'bloks', 'reels', 'post', 'posts', 'product', 'products',
	'socialEntity', 'social', 'inlineVideo', 'contentItems', 'generating',
	'allowUnknown'
]);

const editDistance = (a, b) => {
	const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
	for (let j = 0; j <= b.length; j++) rows[0][j] = j;
	for (let i = 1; i <= a.length; i++) {
		for (let j = 1; j <= b.length; j++) {
			rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
		}
	}

	return rows[a.length][b.length];
};

const nearestKey = (key) => {
	const lower = String(key).toLowerCase();
	let best = null;
	let bestScore = Infinity;
	for (const known of ONE_LINER_KEYS) {
		const score = editDistance(lower, known.toLowerCase());
		if (score < bestScore) {
			bestScore = score;
			best = known;
		}
	}

	return bestScore <= Math.max(2, Math.floor(lower.length / 3)) ? best : null;
};

function applyOneLiner(rich, input = {}) {
	if (typeof input === 'string') {
		return rich.addMarkdown(input);
	}
	if (!isPlainObject(input)) {
		throw new TypeError('Rich(client, input) expects a markdown string or a plain object');
	}

	const {
		title,
		subtitle,
		footer,
		contextInfo,
		payload,
		markdown,
		md,
		heading,
		text,
		body,
		code,
		table,
		links,
		sources,
		image,
		inlineImage,
		video,
		compact,
		profile,
		checklist,
		keyValue,
		keyValues,
		progress,
		tip,
		metadata,
		divider,
		spacer,
		actions,
		footerActions,
		suggestions,
		suggested,
		primitives,
		viewModels,
		// JAP@Fix (§2.76): every primitive AIRich can render now has a key here.
		// These were unreachable from the one-liner, and because unknown keys were
		// dropped in silence the result was an empty card that still got sent.
		latex,
		task,
		tasks,
		widget,
		widgets,
		progressStatus,
		thinking,
		thinkingStatus,
		quotaUpsell,
		bloks,
		reels,
		post,
		posts,
		product,
		products,
		socialEntity,
		social,
		inlineVideo,
		contentItems,
		generating,
		allowUnknown,
	} = input;

	if (title != null) rich.setTitle(String(title));
	if (subtitle != null) rich.setSubtitle(String(subtitle));
	if (footer != null) rich.setFooter(String(footer));
	if (contextInfo != null) rich.setContextInfo(contextInfo);
	if (payload != null) rich.addPayload(payload);

	const markdownText = markdown ?? md;
	if (markdownText != null) rich.addMarkdown(String(markdownText));
	if (heading != null) rich.addHeading(String(heading));
	const plainText = text ?? body;
	if (plainText != null) rich.addText(String(plainText));

	for (const item of toArray(code)) {
		if (typeof item === 'string') rich.addCode('text', item);
		else if (isPlainObject(item)) rich.addCode(item.language ?? item.lang ?? 'text', String(item.code ?? item.text ?? ''));
	}
	if (table != null) rich.addTable(table);
	if (links != null) rich.addLinks(toArray(links));
	if (sources != null) rich.addSource(toArray(sources));
	for (const item of toArray(image)) {
		if (typeof item === 'string') rich.addImage(item);
		else if (isPlainObject(item)) rich.addImage(item.url ?? item.imageUrl ?? item.src, item.options ?? item);
	}
	for (const item of toArray(inlineImage)) {
		if (typeof item === 'string') rich.addInlineImage(item);
		else if (isPlainObject(item)) rich.addInlineImage(item.url ?? item.imageUrl ?? item.src, item.options ?? item);
	}
	for (const item of toArray(video)) {
		if (typeof item === 'string') rich.addVideo(item);
		else if (isPlainObject(item)) rich.addVideo(item.url ?? item.videoUrl ?? item.src, item.options ?? item);
	}
	for (const item of toArray(compact)) rich.addCompact(item);
	for (const item of toArray(profile)) rich.addProfileCard(item);
	if (checklist != null) rich.addChecklist(toArray(checklist));
	if (keyValue != null || keyValues != null) rich.addKeyValue(keyValue ?? keyValues);
	for (const item of toArray(progress)) {
		if (isPlainObject(item)) rich.addProgressBar(item.label ?? item.title ?? 'Progress', Number(item.value ?? 0), item.max ?? item.total ?? 100, item.options ?? item);
	}
	for (const item of toArray(tip)) rich.addTip(String(item));
	for (const item of toArray(metadata)) rich.addMetadata(String(item));
	if (divider) rich.addDivider();
	if (spacer) rich.addSpacer(typeof spacer === 'number' ? spacer : undefined);
	const actionItems = footerActions ?? actions;
	if (actionItems != null) rich.addFooterAction(actionItems);
	const suggestionItems = toArray(suggestions ?? suggested)
		.map((item) => typeof item === 'string' ? item : (item?.text ?? item?.prompt ?? item?.prompt_text))
		.filter((item) => typeof item === 'string' && item);
	if (suggestionItems.length) rich.addSuggest(suggestionItems);
	for (const item of toArray(primitives)) {
		if (typeof item === 'string') rich.addText(item);
		else if (isPlainObject(item)) rich.addRawPrimitive(item.typename ?? item.__typename, item.props ?? item, item.options ?? {});
	}
	for (const item of toArray(viewModels)) {
		if (isPlainObject(item)) rich.addViewModel(item.typename ?? item.__typename, item.primitives ?? item.primitive ?? [], item.options ?? {});
	}

	// JAP@Add (§2.76): the rest of the AIRich surface, reachable from the one-liner
	for (const item of toArray(latex)) rich.addLatex(String(item));
	for (const item of toArray(task ?? tasks)) {
		rich.addTask(typeof item === 'string' ? { title: item } : item);
	}
	for (const item of toArray(widget ?? widgets)) {
		if (isPlainObject(item)) rich.addWidget(item.data ?? item, item.options ?? (item.layout ? { layout: item.layout } : {}));
	}
	for (const item of toArray(progressStatus)) {
		if (typeof item === 'string') rich.addProgressStatus(item);
		else if (isPlainObject(item)) rich.addProgressStatus(String(item.title ?? item.text ?? ''), item.options ?? item);
	}
	for (const item of toArray(thinking ?? thinkingStatus)) {
		if (typeof item === 'string') rich.addThinkingStatus(item);
		else if (isPlainObject(item)) rich.addThinkingStatus(String(item.title ?? item.text ?? ''), item.options ?? item);
	}
	for (const item of toArray(quotaUpsell)) {
		if (isPlainObject(item)) rich.addQuotaUpsell(item);
	}
	for (const item of toArray(bloks)) {
		if (isPlainObject(item)) rich.addBloks(item);
	}
	if (reels != null) rich.addReels(toArray(reels));
	for (const item of toArray(post ?? posts)) {
		if (isPlainObject(item)) rich.addPost(item, item.options ?? {});
	}
	for (const item of toArray(product ?? products)) {
		if (isPlainObject(item)) rich.addProduct(item, item.options ?? {});
	}
	for (const item of toArray(socialEntity ?? social)) {
		if (isPlainObject(item)) rich.addSocialEntity(item);
	}
	if (inlineVideo) rich.addInlineVideo();
	if (contentItems != null) rich.addContentItems(toArray(contentItems));
	if (generating) rich.addGenerating(isPlainObject(generating) ? generating : undefined);

	/**
	 * JAP@Fix (§2.76): a key we do not recognise used to be dropped without a word, so a
	 * typo (`tabel`, `lateks`) produced a card missing exactly the part you cared about --
	 * or, when it was the only key, an empty card that was still sent. Say so instead.
	 * `allowUnknown: true` restores the old permissive behaviour for callers that pass
	 * their own bookkeeping fields through this object.
	 */
	if (!allowUnknown) {
		const unknown = Object.keys(input).filter(key => !ONE_LINER_KEYS.has(key));
		if (unknown.length) {
			const hints = unknown.map(key => {
				const near = nearestKey(key);
				return near ? `'${key}' (did you mean '${near}'?)` : `'${key}'`;
			});
			throw new TypeError(`Rich one-liner received unknown key(s): ${hints.join(', ')}. ` +
				`Pass { allowUnknown: true } to ignore extra fields.`);
		}
	}

	return rich;
}

/**
 * Build an AIRich instance in one call. Use this for concise rich cards while
 * keeping the full AIRich builder available for advanced chaining.
 *
 * @example
 * const rich = jap(sock, { title: 'Menu', markdown: '# Hi', actions: { text: 'Open', url: 'https://example.com' } })
 * await rich.send(jid)
 */
export function createRich(client, input = {}) {
	return applyOneLiner(new AIRich(client), input);
}

// JAP-branded aliases requested for the one-liner layer. The original neutral
// names stay as compatibility aliases; prefer these in new docs/examples.
export const createJapRich = createRich;
export const japRich = createRich;
export const jap = createRich;

/** Alias for createRich(): `Rich(sock, '# Hello').send(jid)`. */
export const Rich = createRich;

/** Build rich-message content from a one-liner input without sending. */
export async function buildRich(client, input = {}, options = {}) {
	return createRich(client, input).build(options);
}

/** JAP-branded alias for buildRich(). */
export async function buildJapRich(client, input = {}, options = {}) {
	return buildRich(client, input, options);
}

/** Send a rich-message one-liner. */
export async function sendRich(client, jid, input = {}, options = {}) {
	const rich = createRich(client, input);
	/**
	 * JAP@Fix (§2.76): an input that produced no primitives used to be relayed anyway --
	 * the recipient got a blank rich bubble. Chaining off createRich() is still fine
	 * (that is what the builder is for); it is only the fire-and-forget path that
	 * refuses to send nothing.
	 */
	if (!rich.items?.length) {
		throw new TypeError('Rich one-liner produced no content to send — pass at least one of: ' +
			'markdown, text, table, latex, code, image, actions, …');
	}

	return rich.send(jid, options);
}

/** JAP-branded alias for sendRich(). */
export async function sendJapRich(client, jid, input = {}, options = {}) {
	return sendRich(client, jid, input, options);
}
