/**
 * Math eval — a SAFE calculator for `!calc` commands (no `eval`, no
 * Function constructor: a real parser), plus Indonesian number spelling and
 * Roman numerals.
 *
 * ```js
 * import { evaluateMath, terbilang, toRoman, fromRoman } from '@japofc/baileys'
 *
 * evaluateMath('2 + 3 * 4')        // 14
 * evaluateMath('(1+2)^3 / 9')      // 3
 * evaluateMath('10 % 3')           // 1
 * evaluateMath('1/0')              // throws (division by zero)
 *
 * terbilang(1250)   // 'seribu dua ratus lima puluh'
 * toRoman(2026)     // 'MMXXVI'
 * fromRoman('XIV')  // 14
 * ```
 */

const OPS = new Set(['+', '-', '*', '/', '%', '^']);

const tokenize = (input) => {
	const src = String(input ?? '').replace(/\s+/g, '').replace(/,/g, '.');
	if (!src) {
		throw new Error('empty expression');
	}
	if (src.length > 200) {
		throw new Error('expression too long');
	}
	const tokens = [];
	let i = 0;
	while (i < src.length) {
		const ch = src[i];
		if (/[0-9.]/.test(ch)) {
			let num = '';
			while (i < src.length && /[0-9.]/.test(src[i])) {
				num += src[i++];
			}
			// parseFloat('1..2') silently returns 1, so validate the entire
			// numeric token. Accept `1`, `1.`, `1.5`, and `.5`.
			if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(num)) {
				throw new Error(`invalid number: ${num}`);
			}
			const value = Number(num);
			if (!Number.isFinite(value)) {
				throw new Error(`invalid number: ${num}`);
			}
			tokens.push({ type: 'num', value });
			continue;
		}
		if (OPS.has(ch)) {
			tokens.push({ type: 'op', value: ch });
			i++;
			continue;
		}
		if (ch === '(' || ch === ')') {
			tokens.push({ type: ch });
			i++;
			continue;
		}
		throw new Error(`unexpected character: ${ch}`);
	}
	return tokens;
};

/**
 * Evaluate an arithmetic expression safely. Supports + - * / % ^,
 * parentheses, decimals (both . and ,) and unary +/-.
 *
 * Exponentiation is right-associative (`2^3^2 === 512`). Unary minus follows
 * the calculator convention: `-2^2 === -4`, while negative exponents work as
 * expected (`2^-2 === 0.25`). Throws clear errors on invalid syntax — never
 * touches eval().
 */
export const evaluateMath = (expression) => {
	const tokens = tokenize(expression);
	let pos = 0;
	const peek = () => tokens[pos];
	const take = () => tokens[pos++];

	const parsePrimary = () => {
		const t = take();
		if (!t) {
			throw new Error('invalid expression');
		}
		if (t.type === 'num') {
			return t.value;
		}
		if (t.type === '(') {
			const value = parseAddSub();
			if (!peek() || peek().type !== ')') {
				throw new Error('unbalanced parentheses');
			}
			take();
			return value;
		}
		if (t.type === ')') {
			throw new Error('unbalanced parentheses');
		}
		throw new Error('invalid expression');
	};

	const parsePower = () => {
		const left = parsePrimary();
		if (peek()?.type === 'op' && peek().value === '^') {
			take();
			// Right-associative and intentionally parses unary +/- on the right,
			// so `2^-2` becomes `2 ** (-2)`.
			const right = parseUnary();
			return Math.pow(left, right);
		}
		return left;
	};

	const parseUnary = () => {
		const t = peek();
		if (t?.type === 'op' && (t.value === '+' || t.value === '-')) {
			take();
			const v = parseUnary();
			return t.value === '-' ? -v : v;
		}
		return parsePower();
	};

	const parseMulDiv = () => {
		let value = parseUnary();
		while (peek()?.type === 'op' && ['*', '/', '%'].includes(peek().value)) {
			const op = take().value;
			const right = parseUnary();
			if ((op === '/' || op === '%') && right === 0) {
				throw new Error('division by zero');
			}
			if (op === '*') value *= right;
			else if (op === '/') value /= right;
			else value %= right;
		}
		return value;
	};

	function parseAddSub() {
		let value = parseMulDiv();
		while (peek()?.type === 'op' && ['+', '-'].includes(peek().value)) {
			const op = take().value;
			const right = parseMulDiv();
			value = op === '+' ? value + right : value - right;
		}
		return value;
	}

	const result = parseAddSub();
	if (pos !== tokens.length) {
		if (peek()?.type === ')') {
			throw new Error('unbalanced parentheses');
		}
		throw new Error('invalid expression');
	}
	if (!Number.isFinite(result)) {
		throw new Error('result is not a finite number');
	}
	return result;
};

const SATUAN = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];

const spell = (n) => {
	if (n < 12) {
		return SATUAN[n];
	}
	if (n < 20) {
		return `${spell(n - 10)} belas`;
	}
	if (n < 100) {
		return `${spell(Math.floor(n / 10))} puluh${n % 10 ? ` ${spell(n % 10)}` : ''}`;
	}
	if (n < 200) {
		return `seratus${n % 100 ? ` ${spell(n % 100)}` : ''}`;
	}
	if (n < 1000) {
		return `${spell(Math.floor(n / 100))} ratus${n % 100 ? ` ${spell(n % 100)}` : ''}`;
	}
	if (n < 2000) {
		return `seribu${n % 1000 ? ` ${spell(n % 1000)}` : ''}`;
	}
	if (n < 1_000_000) {
		return `${spell(Math.floor(n / 1000))} ribu${n % 1000 ? ` ${spell(n % 1000)}` : ''}`;
	}
	if (n < 1_000_000_000) {
		return `${spell(Math.floor(n / 1_000_000))} juta${n % 1_000_000 ? ` ${spell(n % 1_000_000)}` : ''}`;
	}
	if (n < 1_000_000_000_000) {
		return `${spell(Math.floor(n / 1_000_000_000))} miliar${n % 1_000_000_000 ? ` ${spell(n % 1_000_000_000)}` : ''}`;
	}
	return `${spell(Math.floor(n / 1_000_000_000_000))} triliun${n % 1_000_000_000_000 ? ` ${spell(n % 1_000_000_000_000)}` : ''}`;
};

/** Indonesian number spelling: terbilang(1250) → 'seribu dua ratus lima puluh'. */
export const terbilang = (n) => {
	const num = Math.trunc(Number(n));
	if (!Number.isFinite(num) || Math.abs(num) >= 1_000_000_000_000_000) {
		throw new Error('terbilang: number out of range');
	}
	if (num === 0) {
		return 'nol';
	}
	return num < 0 ? `minus ${spell(-num)}` : spell(num);
};

/** Greatest common divisor (absolute, integer): gcd(12, 18) → 6. gcd(0,0) → 0. */
export const gcd = (a, b) => {
	let x = Math.abs(Math.trunc(Number(a) || 0));
	let y = Math.abs(Math.trunc(Number(b) || 0));
	while (y) {
		[x, y] = [y, x % y];
	}
	return x;
};

/** Least common multiple (absolute, integer): lcm(4, 6) → 12. lcm(_,0) → 0. */
export const lcm = (a, b) => {
	const x = Math.abs(Math.trunc(Number(a) || 0));
	const y = Math.abs(Math.trunc(Number(b) || 0));
	if (!x || !y) {
		return 0;
	}
	return (x / gcd(x, y)) * y;
};

/** `part` as a percentage of `whole`, rounded to `decimals` (default 1). whole 0 → 0. */
export const percentage = (part, whole, decimals = 1) => {
	const p = Number(part);
	const w = Number(whole);
	if (!Number.isFinite(p) || !Number.isFinite(w) || w === 0) {
		return 0;
	}
	return roundTo((p / w) * 100, decimals);
};

/** Round to `decimals` places, half-up and free of float drift: roundTo(1.005, 2) → 1.01. */
export const roundTo = (value, decimals = 0) => {
	const n = Number(value);
	if (!Number.isFinite(n)) {
		return NaN;
	}
	const f = 10 ** Math.max(0, Math.trunc(decimals));
	return Math.round((n + Number.EPSILON) * f) / f;
};

const ROMAN = [
	[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
	[100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
	[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
];

/** 1..3999 → Roman numerals. */
export const toRoman = (n) => {
	let num = Math.trunc(Number(n));
	if (!Number.isInteger(num) || num < 1 || num > 3999) {
		throw new Error('toRoman: needs an integer 1..3999');
	}
	let out = '';
	for (const [value, glyph] of ROMAN) {
		while (num >= value) {
			out += glyph;
			num -= value;
		}
	}
	return out;
};

/** Roman numerals → number (validated by round-trip). */
export const fromRoman = (input) => {
	const s = String(input ?? '').toUpperCase().trim();
	const values = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
	let total = 0;
	for (let i = 0; i < s.length; i++) {
		const cur = values[s[i]];
		if (!cur) {
			throw new Error(`fromRoman: invalid glyph ${s[i]}`);
		}
		const next = values[s[i + 1]] || 0;
		total += cur < next ? -cur : cur;
	}
	if (!total || toRoman(total) !== s) {
		throw new Error('fromRoman: not a canonical Roman numeral');
	}
	return total;
};
