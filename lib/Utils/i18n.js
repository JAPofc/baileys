/**
 * i18n — tiny translation layer for multilingual bots: dictionaries per
 * language, per-chat language selection, `{var}` interpolation.
 *
 * ```js
 * import { createI18n } from '@japofc/baileys'
 *
 * const i18n = createI18n({ defaultLang: 'en' })
 * i18n.addLanguage('en', { greet: 'Hello {name}!', menu: { title: 'Menu' } })
 * i18n.addLanguage('id', { greet: 'Halo {name}!', menu: { title: 'Menu Bot' } })
 *
 * i18n.t('greet', { name: 'Budi' })            // 'Hello Budi!'
 * i18n.t('menu.title', {}, 'id')               // 'Menu Bot'
 *
 * i18n.setChatLang(chatJid, 'id')              // e.g. from a !lang id command
 * i18n.tFor(chatJid, 'greet', { name: 'Budi' }) // 'Halo Budi!'
 * ```
 *
 * Missing keys fall back to the default language, then to the key itself —
 * the bot never crashes over a missing translation.
 */

const flatten = (obj, prefix = '', out = {}) => {
	for (const [key, value] of Object.entries(obj || {})) {
		const path = prefix ? `${prefix}.${key}` : key;
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			flatten(value, path, out);
		} else {
			out[path] = String(value);
		}
	}
	return out;
};

export const createI18n = (options = {}) => {
	const { defaultLang = 'en', fallbackToKey = true } = options;

	/** lang -> flat Map(key -> template) */
	const languages = new Map();
	/** chat -> lang */
	const chatLangs = new Map();

	const interpolate = (template, vars) =>
		template.replace(/\{(\w+)\}/g, (m, name) => (vars && name in vars ? String(vars[name]) : m));

	const lookup = (key, lang) => {
		const dict = languages.get(lang);
		return dict?.get(key);
	};

	const translate = (key, vars, lang) => {
		const hit = lookup(key, lang) ?? (lang !== defaultLang ? lookup(key, defaultLang) : undefined);
		if (hit !== undefined) {
			return interpolate(hit, vars);
		}
		return fallbackToKey ? key : '';
	};

	return {
		/** Register/merge a dictionary (nested objects become dot-paths). */
		addLanguage(lang, dict) {
			let m = languages.get(lang);
			if (!m) {
				m = new Map();
				languages.set(lang, m);
			}
			for (const [key, value] of Object.entries(flatten(dict))) {
				m.set(key, value);
			}
			return this;
		},
		removeLanguage(lang) {
			return languages.delete(lang);
		},
		hasLanguage: (lang) => languages.has(lang),
		getLanguages: () => [...languages.keys()],
		/** Translate in an explicit (or the default) language. */
		t: (key, vars, lang = defaultLang) => translate(key, vars, lang),
		/** Translate in a chat's configured language. */
		tFor(chat, key, vars) {
			return translate(key, vars, chatLangs.get(chat) || defaultLang);
		},
		setChatLang(chat, lang) {
			if (!languages.has(lang)) {
				throw new Error(`unknown language: ${lang} (add it with addLanguage first)`);
			}
			chatLangs.set(chat, lang);
		},
		getChatLang: (chat) => chatLangs.get(chat) || defaultLang,
		resetChatLang(chat) {
			return chatLangs.delete(chat);
		},
		/** Keys missing from `lang` compared to the default language. */
		getMissingKeys(lang) {
			const base = languages.get(defaultLang);
			const target = languages.get(lang);
			if (!base) {
				return [];
			}
			return [...base.keys()].filter(k => !target?.has(k));
		},
		toJSON() {
			return {
				defaultLang,
				languages: [...languages].map(([lang, m]) => [lang, Object.fromEntries(m)]),
				chatLangs: [...chatLangs]
			};
		},
		load(snapshot) {
			languages.clear();
			chatLangs.clear();
			for (const [lang, dict] of snapshot?.languages || []) {
				this.addLanguage(lang, dict);
			}
			for (const [chat, lang] of snapshot?.chatLangs || []) {
				if (languages.has(lang)) {
					chatLangs.set(chat, lang);
				}
			}
		}
	};
};
