import { AIRich } from './AIRich.js';

const isPlainObject = (value) => value != null && typeof value === 'object' && !Array.isArray(value);
const toArray = (value) => value == null ? [] : (Array.isArray(value) ? value : [value]);

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
	return createRich(client, input).send(jid, options);
}

/** JAP-branded alias for sendRich(). */
export async function sendJapRich(client, jid, input = {}, options = {}) {
	return sendRich(client, jid, input, options);
}
