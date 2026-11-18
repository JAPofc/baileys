/** Emoji tools — detect, count, extract, strip. */
export declare const extractEmojis: (text: string) => string[];
export declare const countEmojis: (text: string) => number;
/** True when the text is nothing but emoji (and whitespace). */
export declare const isEmojiOnly: (text: string) => boolean;
export declare const stripEmojis: (text: string) => string;
export declare const replaceEmojis: (text: string, replacer: (emoji: string) => string) => string;
/** Random emoji from a themed set: celebrate/love/funny/sad/fire/animals. */
export declare const randomEmoji: (category?: string, options?: { random?: () => number }) => string;
export declare const firstEmoji: (str?: string) => string | null;
/** True when the text contains at least one emoji. */
export declare const hasEmoji: (text?: string) => boolean;
/** Fraction of visible (non-whitespace) characters that are emoji, 0..1. */
export declare const emojiRatio: (text?: string) => number;
