/**
 * csv — tiny RFC-4180 CSV writer/reader with zero dependencies.
 *
 * For dumping bot data (leaderboards, economy balances, attendance) to a file
 * a human can open in a spreadsheet, and reading it back. Handles the fiddly
 * bits correctly: values containing commas, quotes, or newlines are quoted and
 * inner quotes are doubled.
 *
 * ```js
 * import { toCSV, parseCSV } from '@japofc/baileys'
 *
 * toCSV([{ name: 'Budi, Jr', xp: 1200 }, { name: 'Ana', xp: 900 }])
 * // 'name,xp\r\n"Budi, Jr",1200\r\nAna,900'
 *
 * parseCSV('name,xp\nAna,900')      // [{ name: 'Ana', xp: '900' }]
 * parseCSV(text, { headers: false }) // [['name','xp'], ['Ana','900']]
 * ```
 */

/** Quote one field if it contains the delimiter, a quote, CR or LF. */
const escapeField = (value, delimiter) => {
	const s = value == null ? '' : String(value);
	if (s.includes(delimiter) || s.includes('"') || s.includes('\n') || s.includes('\r')) {
		return `"${s.replace(/"/g, '""')}"`;
	}
	return s;
};

/**
 * Serialize rows to a CSV string.
 * - Array of objects → a header row is derived from the union of keys (or pass
 *   `columns` to fix the order/subset).
 * - Array of arrays → written as-is (pass `columns` to prepend a header row).
 *
 * Options: `delimiter` (','), `newline` ('\r\n'), `columns` (explicit header),
 * `header` (default true; set false to omit the header for object rows).
 */
export const toCSV = (rows, options = {}) => {
	const { delimiter = ',', newline = '\r\n', columns, header = true } = options;
	const list = Array.isArray(rows) ? rows : [];
	if (list.length === 0 && !columns) {
		return '';
	}

	const arrayMode = list.length > 0 && Array.isArray(list[0]);
	const lines = [];

	if (arrayMode) {
		if (columns) {
			lines.push(columns.map((c) => escapeField(c, delimiter)).join(delimiter));
		}
		for (const row of list) {
			lines.push(row.map((v) => escapeField(v, delimiter)).join(delimiter));
		}
		return lines.join(newline);
	}

	// object mode
	const keys = columns ?? [...list.reduce((set, obj) => {
		for (const k of Object.keys(obj ?? {})) set.add(k);
		return set;
	}, new Set())];
	if (header) {
		lines.push(keys.map((k) => escapeField(k, delimiter)).join(delimiter));
	}
	for (const obj of list) {
		lines.push(keys.map((k) => escapeField(obj?.[k], delimiter)).join(delimiter));
	}
	return lines.join(newline);
};

/**
 * Parse a CSV string. Returns an array of objects keyed by the header row
 * (default) or an array of string arrays when `headers: false`. Handles quoted
 * fields with embedded delimiters, newlines and doubled quotes. Accepts both
 * `\n` and `\r\n` line endings. A trailing newline is ignored.
 *
 * Options: `delimiter` (','), `headers` (true).
 */
export const parseCSV = (text, options = {}) => {
	const { delimiter = ',', headers = true } = options;
	const src = String(text ?? '');
	const rows = [];
	let field = '';
	let row = [];
	let inQuotes = false;
	let started = false; // did we see any char on this line?

	const endField = () => { row.push(field); field = ''; };
	const endRow = () => { endField(); rows.push(row); row = []; started = false; };

	for (let i = 0; i < src.length; i++) {
		const ch = src[i];
		started = true;
		if (inQuotes) {
			if (ch === '"') {
				if (src[i + 1] === '"') { field += '"'; i++; }
				else { inQuotes = false; }
			}
			else {
				field += ch;
			}
			continue;
		}
		if (ch === '"') {
			inQuotes = true;
		}
		else if (ch === delimiter) {
			endField();
		}
		else if (ch === '\n') {
			endRow();
		}
		else if (ch === '\r') {
			if (src[i + 1] === '\n') i++;
			endRow();
		}
		else {
			field += ch;
		}
	}
	// flush the last field/row unless the input ended exactly on a newline
	if (started || field.length > 0 || row.length > 0) {
		endRow();
	}

	if (!headers) {
		return rows;
	}
	if (rows.length === 0) {
		return [];
	}
	const head = rows[0];
	return rows.slice(1).map((r) => {
		const obj = {};
		head.forEach((key, idx) => { obj[key] = r[idx] ?? ''; });
		return obj;
	});
};
