/**
 * Emoji tools — detect, count, extract and strip emoji from bot text.
 *
 * ```js
 * import { isEmojiOnly, extractEmojis, stripEmojis, randomEmoji } from '@japofc/baileys'
 *
 * isEmojiOnly('🔥🔥🔥')          // true — perfect for reaction-triggers
 * extractEmojis('nice 🔥 bro 😂') // ['🔥', '😂']
 * countEmojis('🔥😂🔥')           // 3
 * stripEmojis('halo 😂 dunia')    // 'halo  dunia'
 * randomEmoji('celebrate')        // '🎉' | '🥳' | …
 * ```
 */

// Extended_Pictographic covers emoji including newer ones; keep ZWJ sequences together.
const EMOJI_RE = /\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*/gu;

/** All emoji in a text (ZWJ sequences kept whole). */
export const extractEmojis = (text) => String(text ?? '').match(EMOJI_RE) || [];

export const countEmojis = (text) => extractEmojis(text).length;

/** True when the text is nothing but emoji (and whitespace). */
export const isEmojiOnly = (text) => {
	const s = String(text ?? '').trim();
	if (!s) {
		return false;
	}
	return s.replace(EMOJI_RE, '').replace(/[\s\uFE0F\u200D]/gu, '') === '';
};

export const stripEmojis = (text) => String(text ?? '').replace(EMOJI_RE, '');

/** Replace each emoji via a callback: replaceEmojis(t, e => `:${e}:`). */
export const replaceEmojis = (text, replacer) =>
	String(text ?? '').replace(EMOJI_RE, (m) => String(replacer(m)));

const EMOJI_SETS = {
	celebrate: ['🎉', '🥳', '🎊', '✨', '🏆'],
	love: ['❤️', '💖', '😍', '🥰', '💕'],
	funny: ['😂', '🤣', '😹', '💀', '😆'],
	sad: ['😢', '😭', '💔', '🥺', '😞'],
	fire: ['🔥', '⚡', '💥', '🌟', '🚀'],
	animals: ['🐱', '🐶', '🦁', '🐼', '🦊']
};

/** Random emoji from a themed set (or from all sets). */
export const randomEmoji = (category, { random = Math.random } = {}) => {
	const pool = EMOJI_SETS[category] || Object.values(EMOJI_SETS).flat();
	// clamp: an injected random() may return exactly 1.0 (unlike Math.random).
	return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
};

/** The first emoji in a string, or null when there is none. */
export const firstEmoji = (str) => extractEmojis(str)[0] || null;

/** True when the text contains at least one emoji. */
// NB: EMOJI_RE carries the /g flag, so `.test()` on it would advance lastIndex
// and flip results between calls — reuse extractEmojis instead (stateless).
export const hasEmoji = (text) => extractEmojis(text).length > 0;

/**
 * Fraction of a string's visible characters that are emoji, 0..1.
 * Whitespace is ignored; empty/whitespace-only input → 0. Handy for a
 * "too many emoji" spam heuristic.
 */
export const emojiRatio = (text) => {
	const chars = [...String(text ?? '')].filter(c => !/\s/u.test(c));
	if (!chars.length) {
		return 0;
	}
	return countEmojis(text) / chars.length;
};
