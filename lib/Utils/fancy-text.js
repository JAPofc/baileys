/**
 * Fancy text — restyle ASCII into Unicode variants for bot menus and
 * flexes: 𝗯𝗼𝗹𝗱, 𝘪𝘵𝘢𝘭𝘪𝘤, 𝚖𝚘𝚗𝚘𝚜𝚙𝚊𝚌𝚎, ⓒⓘⓡⓒⓛⓔⓓ, ｆｕｌｌｗｉｄｔｈ…
 *
 * ```js
 * import { styleText, listTextStyles } from '@japofc/baileys'
 *
 * styleText('Bot Menu 2026', 'bold')       // '𝗕𝗼𝘁 𝗠𝗲𝗻𝘂 𝟮𝟬𝟮𝟲'
 * styleText('hello', 'smallcaps')          // 'ʜᴇʟʟᴏ'
 * listTextStyles()                         // ['bold', 'italic', …]
 * ```
 *
 * Characters without a variant in the chosen style (emoji, punctuation,
 * non-Latin) pass through unchanged.
 */

// Unicode code points for styled A-Z / a-z / 0-9 starts (0 = no variant).
const STYLES = {
	bold: { upper: 0x1d5d4, lower: 0x1d5ee, digit: 0x1d7ec }, // sans-serif bold
	italic: { upper: 0x1d608, lower: 0x1d622, digit: 0 }, // sans-serif italic
	boldItalic: { upper: 0x1d63c, lower: 0x1d656, digit: 0 },
	serifBold: { upper: 0x1d400, lower: 0x1d41a, digit: 0x1d7ce },
	script: { upper: 0x1d4d0, lower: 0x1d4ea, digit: 0 }, // bold script
	fraktur: { upper: 0x1d504, lower: 0x1d51e, digit: 0 },
	doubleStruck: { upper: 0x1d538, lower: 0x1d552, digit: 0x1d7d8 },
	monospace: { upper: 0x1d670, lower: 0x1d68a, digit: 0x1d7f6 },
	circled: { upper: 0x24b6, lower: 0x24d0, digit: 0 }, // ⓪ digits separate
	squared: { upper: 0x1f130, lower: 0, digit: 0 },
	fullwidth: { upper: 0xff21, lower: 0xff41, digit: 0xff10 }
};

// Irregular mappings the offset formula can't cover.
const SPECIALS = {
	script: { B: '\u212c', E: '\u2130', F: '\u2131', H: '\u210b', I: '\u2110', L: '\u2112', M: '\u2133', R: '\u211b', e: '\u212f', g: '\u210a', o: '\u2134' },
	fraktur: { C: '\u212d', H: '\u210c', I: '\u2111', R: '\u211c', Z: '\u2128' },
	doubleStruck: { C: '\u2102', H: '\u210d', N: '\u2115', P: '\u2119', Q: '\u211a', R: '\u211d', Z: '\u2124' },
	italic: { h: '\u210e' },
	circled: { 0: '\u24ea', 1: '\u2460', 2: '\u2461', 3: '\u2462', 4: '\u2463', 5: '\u2464', 6: '\u2465', 7: '\u2466', 8: '\u2467', 9: '\u2468' }
};

const SMALLCAPS = {
	a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ', j: 'ᴊ',
	k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ', s: 'ꜱ', t: 'ᴛ',
	u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ'
};

/** Names accepted by styleText(). */
export const listTextStyles = () => [...Object.keys(STYLES), 'smallcaps'];

/** Restyle a string; unknown characters pass through unchanged. */
export const styleText = (text, style) => {
	const input = String(text ?? '');
	if (style === 'smallcaps') {
		return [...input].map(ch => SMALLCAPS[ch.toLowerCase()] ?? ch).join('');
	}
	const map = STYLES[style];
	if (!map) {
		throw new Error(`unknown style: ${style} — use one of ${listTextStyles().join(', ')}`);
	}
	const specials = SPECIALS[style] || {};
	let out = '';
	for (const ch of input) {
		if (specials[ch]) {
			out += specials[ch];
			continue;
		}
		const code = ch.codePointAt(0);
		if (code >= 65 && code <= 90 && map.upper) {
			out += String.fromCodePoint(map.upper + code - 65);
		} else if (code >= 97 && code <= 122 && map.lower) {
			out += String.fromCodePoint(map.lower + code - 97);
		} else if (code >= 48 && code <= 57 && map.digit) {
			out += String.fromCodePoint(map.digit + code - 48);
		} else {
			out += ch;
		}
	}
	return out;
};
