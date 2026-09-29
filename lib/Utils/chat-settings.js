/**
 * Chat settings — per-chat feature toggles with defaults: the "!settings"
 * backbone (welcome on/off, antilink on/off, language, …) every group bot
 * reinvents.
 *
 * ```js
 * import { createChatSettings } from '@japofc/baileys'
 *
 * const settings = createChatSettings({
 *     defaults: { welcome: true, antilink: false, language: 'id' }
 * })
 *
 * settings.isEnabled(chat, 'antilink')     // false (default)
 * settings.set(chat, 'antilink', true)
 * settings.toggle(chat, 'welcome')         // flips → returns the new value
 * settings.get(chat, 'language')           // 'id'
 * settings.all(chat)                       // effective view (defaults + overrides)
 * settings.render(chat)                    // ✅/❌ card for the chat
 *
 * settings.onChange(({ chat, key, value }) => persist())
 * ```
 *
 * Only OVERRIDES are stored — changing a default later applies everywhere
 * that never overrode it.
 */

export const createChatSettings = (options = {}) => {
	const { defaults = {} } = options;

	/** chat -> Map(key -> value) — overrides only */
	const chats = new Map();
	const changeCbs = new Set();

	const emit = (payload) => {
		for (const cb of changeCbs) {
			try {
				cb(payload);
			} catch {
				// listener errors are the listener's problem
			}
		}
	};

	const assertKnown = (key) => {
		if (!(key in defaults)) {
			throw new Error(`unknown setting "${key}" — add it to defaults first`);
		}
	};

	return {
		get(chat, key) {
			assertKnown(key);
			const overrides = chats.get(chat);
			return overrides && overrides.has(key) ? overrides.get(key) : defaults[key];
		},
		/** Boolean sugar: truthy check on get(). */
		isEnabled(chat, key) {
			return !!this.get(chat, key);
		},
		set(chat, key, value) {
			assertKnown(key);
			let overrides = chats.get(chat);
			if (!overrides) {
				overrides = new Map();
				chats.set(chat, overrides);
			}
			overrides.set(key, value);
			emit({ chat, key, value });
			return value;
		},
		/** Flip a boolean setting. Returns the new value. */
		toggle(chat, key) {
			return this.set(chat, key, !this.get(chat, key));
		},
		/** Remove one override (falls back to the default). */
		reset(chat, key) {
			assertKnown(key);
			const overrides = chats.get(chat);
			const removed = overrides ? overrides.delete(key) : false;
			if (overrides && !overrides.size) {
				chats.delete(chat);
			}
			if (removed) {
				emit({ chat, key, value: defaults[key], reset: true });
			}
			return removed;
		},
		/** Remove every override of a chat. */
		resetChat(chat) {
			return chats.delete(chat);
		},
		/** Effective settings for a chat (defaults merged with overrides). */
		all(chat) {
			const out = { ...defaults };
			for (const [key, value] of chats.get(chat) || []) {
				out[key] = value;
			}
			return out;
		},
		/** Which keys a chat has overridden. */
		getOverrides(chat) {
			return Object.fromEntries(chats.get(chat) || []);
		},
		/** Ready-to-send ✅/❌ settings card. */
		render(chat, { title = '⚙️ *Settings*' } = {}) {
			const all = this.all(chat);
			const lines = Object.entries(all).map(([key, value]) => {
				const shown = typeof value === 'boolean' ? (value ? '✅' : '❌') : `\`${value}\``;
				return `${shown} ${key}`;
			});
			return `${title}\n${lines.join('\n')}`;
		},
		keys: () => Object.keys(defaults),
		onChange(cb) {
			changeCbs.add(cb);
			return () => changeCbs.delete(cb);
		},
		toJSON() {
			return { entries: [...chats].map(([chat, m]) => [chat, [...m]]) };
		},
		load(snapshot) {
			chats.clear();
			for (const [chat, list] of snapshot?.entries || []) {
				chats.set(chat, new Map(list));
			}
		},
		get size() {
			return chats.size;
		}
	};
};
