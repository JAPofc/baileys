/**
 * Status tools — content preparation for status broadcasts: text statuses
 * get the styled look (font + colors) automatically, media statuses get
 * their fields normalized the way WhatsApp expects.
 *
 * ```js
 * import { prepareStatusContent, randomStatusColor } from '@japofc/baileys'
 *
 * // sendStatusMention / sendMessage([...jids]) use this under the hood:
 * const { content, styleOptions } = prepareStatusContent({ text: 'Halo!' })
 * // styleOptions → { font: 0-8, textColor: '#…', backgroundColor: '#…' }
 * // pass your own font/backgroundColor/textColor in the content to pin them
 * ```
 *
 * Rules applied:
 * - text status → random font (0-8) + random text/background colors,
 *   unless explicitly provided
 * - image/video status → `text` becomes `caption`; style fields dropped
 * - audio status → text/caption dropped, `ptt` defaults to true,
 *   background color kept (voice statuses render on a colored card)
 */

/** Random '#rrggbb' color. */
export const randomStatusColor = ({ random = Math.random } = {}) =>
	'#' + Math.floor(random() * 0xffffff).toString(16).padStart(6, '0');

/** Random WhatsApp status font id (0-8). */
export const randomStatusFont = ({ random = Math.random } = {}) =>
	// clamp: an injected random() may return exactly 1.0 (unlike Math.random's
	// [0,1)), which would yield 9 — an out-of-range font id. Same guard used by
	// array-tools `sample` and emoji-tools `randomEmoji`.
	Math.min(8, Math.floor(random() * 9));

/**
 * Normalize status content + derive style options for generateWAMessage.
 * Returns `{ content, styleOptions }` — the input is never mutated.
 */
export const prepareStatusContent = (rawContent, { random = Math.random, autoStyle = true } = {}) => {
	const content = { ...(rawContent || {}) };
	const isAudio = !!content.audio;
	const isVisualMedia = !!(content.image || content.video);
	const styleOptions = {};

	if (isVisualMedia) {
		// media statuses caption instead of text; style fields don't apply
		if (content.text && !content.caption) {
			content.caption = content.text;
		}
		delete content.text;
		delete content.font;
		delete content.textColor;
		delete content.backgroundColor;
		delete content.ptt;
		return { content, styleOptions };
	}

	if (isAudio) {
		delete content.text;
		delete content.caption;
		delete content.font;
		delete content.textColor;
		styleOptions.ptt = typeof content.ptt === 'boolean' ? content.ptt : true;
		delete content.ptt;
		if (autoStyle) {
			styleOptions.backgroundColor = content.backgroundColor || randomStatusColor({ random });
		} else if (content.backgroundColor) {
			styleOptions.backgroundColor = content.backgroundColor;
		}
		delete content.backgroundColor;
		return { content, styleOptions };
	}

	// text status
	if (autoStyle) {
		styleOptions.font = content.font ?? randomStatusFont({ random });
		styleOptions.textColor = content.textColor || randomStatusColor({ random });
		styleOptions.backgroundColor = content.backgroundColor || randomStatusColor({ random });
	} else {
		if (content.font !== undefined) {
			styleOptions.font = content.font;
		}
		if (content.textColor) {
			styleOptions.textColor = content.textColor;
		}
		if (content.backgroundColor) {
			styleOptions.backgroundColor = content.backgroundColor;
		}
	}
	delete content.font;
	delete content.textColor;
	delete content.backgroundColor;
	return { content, styleOptions };
};
