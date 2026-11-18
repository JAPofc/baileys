/**
 * text-table — render an aligned monospace text table for bot output.
 *
 * WhatsApp renders monospace inside a code fence, so a column-aligned table is
 * the cleanest way to show leaderboards, stats, or price lists.
 *
 * ```js
 * import { textTable } from '@japofc/baileys'
 *
 * textTable(
 *   [['Ana', '1200'], ['Budi', '900']],
 *   { headers: ['Name', 'XP'], align: ['left', 'right'] }
 * )
 * // Name │  XP
 * // ─────┼─────
 * // Ana  │ 1200
 * // Budi │  900
 * ```
 */

const pad = (text, width, align) => {
	const s = String(text ?? '');
	const gap = Math.max(0, width - s.length);
	if (align === 'right') return ' '.repeat(gap) + s;
	if (align === 'center') {
		const left = Math.floor(gap / 2);
		return ' '.repeat(left) + s + ' '.repeat(gap - left);
	}
	return s + ' '.repeat(gap);
};

/**
 * Build an aligned table string. `rows` is an array of arrays (cells are
 * stringified). Options:
 *   - `headers`: string[] header row (adds a separator line under it)
 *   - `align`: per-column 'left'|'right'|'center' (default 'left')
 *   - `separator`: column separator (default ' │ ')
 *   - `fence`: wrap the whole thing in a ``` code block (default false)
 */
export const textTable = (rows, options = {}) => {
	const { headers, align = [], separator = ' │ ', fence = false } = options;
	const body = Array.isArray(rows) ? rows.map((r) => (Array.isArray(r) ? r : [r])) : [];
	const all = headers ? [headers, ...body] : body;
	if (all.length === 0) {
		return fence ? '```\n\n```' : '';
	}
	const cols = Math.max(...all.map((r) => r.length));
	const widths = [];
	for (let c = 0; c < cols; c++) {
		widths[c] = Math.max(...all.map((r) => String(r[c] ?? '').length));
	}
	const alignOf = (c) => align[c] || 'left';
	const renderRow = (r) => widths.map((w, c) => pad(r[c], w, alignOf(c))).join(separator).replace(/\s+$/, '');

	const lines = [];
	if (headers) {
		lines.push(renderRow(headers));
		// separator line: dashes per column joined by a cross that matches the separator width
		const cross = separator.replace(/[^│|]/g, '─').replace(/[│|]/g, '┼');
		lines.push(widths.map((w) => '─'.repeat(w)).join(cross).replace(/\s+$/, ''));
	}
	for (const r of body) {
		lines.push(renderRow(r));
	}
	const out = lines.join('\n');
	return fence ? '```\n' + out + '\n```' : out;
};
