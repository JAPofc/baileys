/**
 * args-parser — quote-aware tokenizer + flag parser for bot commands.
 *
 * The built-in router splits arguments on whitespace only, which breaks on
 * quoted phrases and command flags. These pure helpers cover both, so a
 * command like:
 *
 *     !broadcast --to=all --pin -f "Selamat pagi, semua!"
 *
 * parses cleanly.
 *
 * ```js
 * import { tokenizeArgs, parseArgs, parseCommand } from '@japofc/baileys'
 *
 * tokenizeArgs('add "John Doe" 25')        // ['add', 'John Doe', '25']
 *
 * parseArgs('--to=all --pin -f "hi there"', { booleans: ['pin'], alias: { f: 'force' } })
 * // { _: ['hi there'], to: 'all', pin: true, force: true }
 *
 * parseCommand('!kick @62812 --silent', { prefixes: ['!', '.'] })
 * // { prefix: '!', command: 'kick', args: ['@62812', '--silent'], argString: '@62812 --silent' }
 * ```
 */

/**
 * Split a string into tokens, honoring single and double quotes and
 * backslash escapes. Quotes are removed from the returned tokens; an
 * unterminated quote runs to end-of-string (never throws).
 */
export const tokenizeArgs = (input) => {
	const s = String(input ?? '');
	const tokens = [];
	let cur = '';
	let quote = null; // "'" | '"' | null
	let has = false; // whether cur holds a (possibly empty) token
	for (let i = 0; i < s.length; i++) {
		const ch = s[i];
		if (ch === '\\' && i + 1 < s.length) {
			// In single quotes, backslash is literal (POSIX-ish); otherwise it escapes.
			if (quote === "'") {
				cur += ch;
			} else {
				cur += s[i + 1];
				has = true;
				i++;
			}
			continue;
		}
		if (quote) {
			if (ch === quote) {
				quote = null;
			} else {
				cur += ch;
			}
			has = true;
			continue;
		}
		if (ch === '"' || ch === "'") {
			quote = ch;
			has = true;
			continue;
		}
		if (/\s/.test(ch)) {
			if (has) {
				tokens.push(cur);
				cur = '';
				has = false;
			}
			continue;
		}
		cur += ch;
		has = true;
	}
	if (has) {
		tokens.push(cur);
	}
	return tokens;
};

const addFlag = (flags, key, value) => {
	if (key in flags) {
		if (Array.isArray(flags[key])) {
			flags[key].push(value);
		} else {
			flags[key] = [flags[key], value];
		}
	} else {
		flags[key] = value;
	}
};

/**
 * Parse a command's arguments into positionals + flags (minimist-like).
 *
 * Supported syntax:
 *   --key=value       → key: 'value'
 *   --key value       → key: 'value'  (unless `key` is a declared boolean)
 *   --flag            → flag: true
 *   --no-flag         → flag: false
 *   -abc              → a: true, b: true, c: true
 *   -k value          → k: 'value'    (unless `k` is a declared boolean)
 *   --                → everything after is positional
 *   repeated flags    → collected into an array
 *
 * @param input  a raw string (tokenized here) or a pre-tokenized array
 * @param opts.booleans  flag names that never consume the next token
 * @param opts.alias     map of name → canonical name (applied both directions of the pair given)
 * @param opts.defaults  default flag values merged in first
 * @returns { _: string[], ...flags }
 */
export const parseArgs = (input, opts = {}) => {
	const { booleans = [], alias = {}, defaults = {} } = opts;
	const tokens = Array.isArray(input) ? input.map(String) : tokenizeArgs(input);

	// Build a bidirectional alias resolver → canonical name.
	const canon = new Map();
	for (const [a, b] of Object.entries(alias)) {
		canon.set(a, b);
		if (!canon.has(b)) {
			canon.set(b, b);
		}
	}
	const resolve = (name) => canon.get(name) ?? name;
	const boolSet = new Set(booleans.map(resolve));

	const positional = [];
	const flags = {};
	let noMoreFlags = false;

	for (let i = 0; i < tokens.length; i++) {
		const tok = tokens[i];
		if (noMoreFlags) {
			positional.push(tok);
			continue;
		}
		if (tok === '--') {
			noMoreFlags = true;
			continue;
		}
		if (tok.startsWith('--')) {
			const body = tok.slice(2);
			const eq = body.indexOf('=');
			if (eq !== -1) {
				addFlag(flags, resolve(body.slice(0, eq)), body.slice(eq + 1));
				continue;
			}
			if (body.startsWith('no-')) {
				addFlag(flags, resolve(body.slice(3)), false);
				continue;
			}
			const key = resolve(body);
			const next = tokens[i + 1];
			if (!boolSet.has(key) && next !== undefined && !isFlagToken(next)) {
				addFlag(flags, key, next);
				i++;
			} else {
				addFlag(flags, key, true);
			}
			continue;
		}
		if (tok.length > 1 && tok[0] === '-' && !isNumericToken(tok)) {
			const chars = tok.slice(1);
			// -k=value form
			const eq = chars.indexOf('=');
			if (eq !== -1) {
				addFlag(flags, resolve(chars.slice(0, eq)), chars.slice(eq + 1));
				continue;
			}
			if (chars.length === 1) {
				const key = resolve(chars);
				const next = tokens[i + 1];
				if (!boolSet.has(key) && next !== undefined && !isFlagToken(next)) {
					addFlag(flags, key, next);
					i++;
				} else {
					addFlag(flags, key, true);
				}
			} else {
				// combined short booleans: -abc
				for (const c of chars) {
					addFlag(flags, resolve(c), true);
				}
			}
			continue;
		}
		positional.push(tok);
	}

	return { _: positional, ...defaults, ...flags };
};

const isFlagToken = (tok) =>
	typeof tok === 'string' && tok.length > 1 && tok[0] === '-' && !isNumericToken(tok);

// A lone '-' or a negative number ('-5', '-3.14') is a value, not a flag.
const isNumericToken = (tok) => /^-\d/.test(tok);

/**
 * Split a full command message into its prefix, command word, and arguments.
 * Returns `null` when the text carries no configured prefix.
 *
 * @param opts.prefixes  accepted prefixes (default ['!'])
 * @param opts.lowerCommand  lowercase the command word (default true)
 */
export const parseCommand = (text, opts = {}) => {
	const { prefixes = ['!'], lowerCommand = true } = opts;
	const clean = String(text ?? '').trim();
	if (!clean) {
		return null;
	}
	const list = (Array.isArray(prefixes) ? prefixes : [prefixes]).filter((p) => typeof p === 'string' && p);
	const prefix = list.find((p) => clean.startsWith(p));
	if (prefix === undefined) {
		return null;
	}
	const rest = clean.slice(prefix.length).trim();
	const tokens = tokenizeArgs(rest);
	if (!tokens.length) {
		return null;
	}
	const [command, ...args] = tokens;
	// argString: the raw remainder after the command word (quotes preserved).
	const afterCmd = rest.slice(rest.indexOf(command) + command.length).trim();
	return {
		prefix,
		command: lowerCommand ? command.toLowerCase() : command,
		args,
		argString: afterCmd
	};
};
