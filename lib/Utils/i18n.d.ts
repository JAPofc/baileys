/** i18n — dictionaries per language, per-chat selection, {var} interpolation. */

export interface I18nOptions {
	/** Default 'en'. */
	defaultLang?: string;
	/** Return the key itself when no translation exists. Default true. */
	fallbackToKey?: boolean;
}

export interface I18n {
	/** Register/merge a dictionary (nested objects become dot-paths). */
	addLanguage(lang: string, dict: Record<string, unknown>): I18n;
	removeLanguage(lang: string): boolean;
	hasLanguage(lang: string): boolean;
	getLanguages(): string[];
	t(key: string, vars?: Record<string, unknown>, lang?: string): string;
	/** Translate in a chat's configured language. */
	tFor(chat: string, key: string, vars?: Record<string, unknown>): string;
	setChatLang(chat: string, lang: string): void;
	getChatLang(chat: string): string;
	resetChatLang(chat: string): boolean;
	/** Keys the default language has that `lang` is missing. */
	getMissingKeys(lang: string): string[];
	toJSON(): Record<string, unknown>;
	load(snapshot: Record<string, unknown>): void;
}

export declare const createI18n: (options?: I18nOptions) => I18n;
