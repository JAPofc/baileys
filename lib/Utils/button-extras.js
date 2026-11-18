/**
 * Button extras — one-liners for the most common button patterns.
 *
 * ```js
 * import { quickButtons, sendConfirm, sendMenuButtons } from '@japofc/baileys'
 *
 * // labels → ready-to-send button array
 * await sendButtons(sock, jid, { text: 'Pick one', buttons: quickButtons(['A', 'B', 'C']) })
 *
 * // yes/no prompt in one call
 * await sendConfirm(sock, jid, 'Delete all data?', { yes: '✅ Yes', no: '❌ Cancel' })
 * // ids: confirm_yes / confirm_no — catch them in your upsert handler
 *
 * // numbered menu from an option list
 * await sendMenuButtons(sock, jid, 'Main Menu', ['Profile', 'Shop', 'Help'])
 * // ids: menu_0 / menu_1 / menu_2
 * ```
 */
import { sendButtons } from './button-sender.js';

/**
 * Turn plain labels into a `sendButtons`-ready array.
 * Accepts strings or `{ id, text }` objects (ids auto-filled as `qb_i`).
 */
export const quickButtons = (labels = [], { idPrefix = 'qb' } = {}) => {
	if (!Array.isArray(labels) || !labels.length) {
		throw new Error('quickButtons(labels[]) requires a non-empty array');
	}
	return labels.map((label, i) => {
		if (label && typeof label === 'object') {
			return { id: label.id ?? `${idPrefix}_${i}`, text: String(label.text ?? '') };
		}
		return { id: `${idPrefix}_${i}`, text: String(label) };
	});
};

/**
 * One-call yes/no prompt. Button ids: `confirm_yes` / `confirm_no`
 * (override via `yesId`/`noId`). Returns the sendButtons result.
 */
export const sendConfirm = async (sock, jid, text, options = {}) => {
	const {
		yes = 'Yes',
		no = 'No',
		yesId = 'confirm_yes',
		noId = 'confirm_no',
		footer,
		...sendOptions
	} = options;
	return sendButtons(sock, jid, {
		text,
		...(footer ? { footer } : {}),
		buttons: [
			{ id: yesId, text: yes },
			{ id: noId, text: no }
		]
	}, sendOptions);
};

/**
 * Numbered menu from a list of options (max 25 per WhatsApp's soft cap).
 * Button ids: `menu_0`, `menu_1`, … (override the prefix via `idPrefix`).
 */
export const sendMenuButtons = async (sock, jid, title, items = [], options = {}) => {
	if (!Array.isArray(items) || !items.length) {
		throw new Error('sendMenuButtons requires a non-empty items array');
	}
	const { idPrefix = 'menu', footer, ...sendOptions } = options;
	return sendButtons(sock, jid, {
		text: title,
		...(footer ? { footer } : {}),
		buttons: items.map((item, i) => ({ id: `${idPrefix}_${i}`, text: String(item) }))
	}, sendOptions);
};
