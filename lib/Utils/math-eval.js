/**
 * Math eval — a SAFE calculator for `!calc` commands (no `eval`, no
 * Function constructor: a real shunting-yard parser), plus Indonesian
 * number spelling and Roman numerals.
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

const OPS = {
	'+': { prec: 1, fn: (a, b) => a + b },
	'-': { prec: 1, fn: (a, b) => a - b },
	'*': { prec: 2, fn: (a, b) => a * b },
	'/': { prec: 2, fn: (a, b) => { if (b === 0) throw new Error('division by zero'); return a / b; } },
	'%': { prec: 2, fn: (a, b) => { if (b === 0) throw new Error('division by zero'); return a % b; } },
	'^': { prec: 3, right: true, fn: (a, b) => Math.pow(a, b) }
};

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
			const value = parseFloat(num);
			if (!Number.isFinite(value)) {
				throw new Error(`invalid number: ${num}`);
			}
			tokens.push({ type: 'num', value });
			continue;
		}
		if (ch in OPS) {
			// unary minus: at start, after an operator, or after '('
			const prev = tokens[tokens.length - 1];
			if (ch === '-' && (!prev || prev.type === 'op' || prev.type === '(')) {
				tokens.push({ type: 'num', value: 0 });
			}
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
 * parentheses, decimals (both . and ,) and unary minus. Throws with a
 * clear message on anything invalid — never touches eval().
 */
export const evaluateMath = (expression) => {
	const output = [];
	const stack = [];
	for (const token of tokenize(expression)) {
		if (token.type === 'num') {
			output.push(token.value);
		} else if (token.type === 'op') {
			const op = OPS[token.value];
			while (stack.length) {
				const top = stack[stack.length - 1];
				if (top.type !== 'op') {
					break;
				}
				const topOp = OPS[top.value];
				if (topOp.prec > op.prec || (topOp.prec === op.prec && !op.right)) {
					apply(output, stack.pop().value);
				} else {
					break;
				}
			}
			stack.push(token);
		} else if (token.type === '(') {
			stack.push(token);
		} else { // ')'
			let matched = false;
			while (stack.length) {
				const top = stack.pop();
				if (top.type === '(') {
					matched = true;
					break;
				}
				apply(output, top.value);
			}
			if (!matched) {
				throw new Error('unbalanced parentheses');
			}
		}
	}
	while (stack.length) {
		const top = stack.pop();
		if (top.type === '(') {
			throw new Error('unbalanced parentheses');
		}
		apply(output, top.value);
	}
	if (output.length !== 1) {
		throw new Error('invalid expression');
	}
	const result = output[0];
	if (!Number.isFinite(result)) {
		throw new Error('result is not a finite number');
	}
	return result;
};

const apply = (output, op) => {
	if (output.length < 2) {
		throw new Error('invalid expression');
	}
	const b = output.pop();
	const a = output.pop();
	output.push(OPS[op].fn(a, b));
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
