/**
 * html-card.js --- JAP@Add (v2.4.8)
 *
 * WhatsApp's own rich-response surface ("Meta AI" cards) renders a set of GenAI UX
 * primitives: markdown text, tables, code, LaTeX, inline images, content items. One more
 * primitive exists on the client -- an experimental one that renders a **full HTML/CSS/JS
 * document** inside the card, sandboxed by the client's own webview:
 *
 *     __typename: 'FOAHtmlPrimitiveDemoDONOTUSE'
 *
 * The `DemoDONOTUSE` suffix is WhatsApp's own internal naming for an unshipped feature
 * flag, not a warning emitted by this library. It is **not** a documented, stable message
 * type: treat it as experimental, expect it to break without notice, and never build a
 * product on it.
 *
 * This module only assembles the JSON that goes into `richResponseMessage.unifiedResponse`
 * -- it deliberately has no dependency on the rest of the rich-message pipeline so that
 * pipeline can import it.
 */
import { randomUUID } from 'crypto';

/** The client-side typename that selects the HTML renderer. */
export const HTML_PRIMITIVE_TYPENAME = 'FOAHtmlPrimitiveDemoDONOTUSE';

/** Soft ceiling for a single card's markup, in bytes. */
export const MAX_HTML_CARD_BYTES = 256 * 1024;

const byteLength = (html) => Buffer.byteLength(String(html), 'utf8');

/**
 * Socket-free sanity check for one HTML card.
 * @returns {{ ok: boolean, bytes: number, reason?: string }}
 */
export const assessHtmlCard = (html, { maxBytes = MAX_HTML_CARD_BYTES } = {}) => {
	if (typeof html !== 'string') {
		return { ok: false, bytes: 0, reason: 'html must be a string of markup' };
	}

	if (!html.trim()) {
		return { ok: false, bytes: 0, reason: 'html must not be empty' };
	}

	const bytes = byteLength(html);
	if (bytes > maxBytes) {
		return { ok: false, bytes, reason: `html is ${bytes} bytes, over the ${maxBytes}-byte limit` };
	}

	return { ok: true, bytes };
};

/** Throwing counterpart of {@link assessHtmlCard}. */
export const assertHtmlCard = (html, opts) => {
	const check = assessHtmlCard(html, opts);
	if (!check.ok) {
		throw new TypeError(`html card: ${check.reason}`);
	}

	return check;
};

/** One `sections[]` entry carrying an HTML document. */
export const buildHtmlPrimitiveSection = (html, { trustedSources = [] } = {}) => {
	assertHtmlCard(html);
	return {
		__typename: 'GenAIUnifiedResponseSection',
		view_model: {
			__typename: 'GenAISingleLayoutViewModel',
			primitive: {
				__typename: HTML_PRIMITIVE_TYPENAME,
				trusted_sources: Array.isArray(trustedSources) ? trustedSources : [],
				payload: html
			}
		}
	};
};

/**
 * A complete `GenAIUnifiedResponse` made of one or more HTML cards.
 * @param {string|string[]} html
 */
export const buildHtmlUnifiedResponse = (html, { uuid, trustedSources = [] } = {}) => {
	const documents = Array.isArray(html) ? html : [html];
	if (!documents.length) {
		throw new TypeError('html card: at least one document is required');
	}

	return {
		__typename: 'GenAIUnifiedResponse',
		response_id: uuid || randomUUID(),
		sections: documents.map((doc) => buildHtmlPrimitiveSection(doc, { trustedSources }))
	};
};
