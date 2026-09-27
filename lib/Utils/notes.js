/**
 * Notes store — save named snippets per chat (`#save rules …` / `#get rules`):
 * the classic bot notes/tags feature.
 *
 * ```js
 * import { createNotes } from '@japofc/baileys'
 *
 * const notes = createNotes()
 * notes.set(chat, 'rules', 'No spam. Be kind.')
 * notes.get(chat, 'rules')?.content     // 'No spam. Be kind.'
 * notes.list(chat)                      // [{ name, updatedAt, ... }]
 * notes.search(chat, 'spam')            // notes matching name or content
 * notes.remove(chat, 'rules')
 *
 * fs.writeFileSync('notes.json', JSON.stringify(notes.toJSON()))
 * ```
 *
 * `content` can be any JSON-serializable value — plain text or a whole
 * message content object (`{ image: … }`) you want to replay later.
 */

export const createNotes = (options = {}) => {
	const { maxPerChat = 200, now = () => Date.now() } = options;

	/** chat -> Map(name -> { name, content, author, createdAt, updatedAt }) */
	const chats = new Map();

	const bag = (chat) => {
		let m = chats.get(chat);
		if (!m) {
			m = new Map();
			chats.set(chat, m);
		}
		return m;
	};

	const normalize = (name) => String(name || '').trim().toLowerCase();

	return {
		/** Create or overwrite a note. Returns the stored note. */
		set(chat, name, content, author) {
			const key = normalize(name);
			if (!key) {
				throw new Error('note name must not be empty');
			}
			const m = bag(chat);
			const existing = m.get(key);
			if (!existing && m.size >= maxPerChat) {
				throw new Error(`note limit reached for this chat (${maxPerChat})`);
			}
			const note = {
				name: key,
				content,
				author,
				createdAt: existing?.createdAt ?? now(),
				updatedAt: now()
			};
			m.set(key, note);
			return note;
		},
		get(chat, name) {
			return chats.get(chat)?.get(normalize(name)) ?? null;
		},
		has(chat, name) {
			return !!chats.get(chat)?.has(normalize(name));
		},
		remove(chat, name) {
			const m = chats.get(chat);
			const removed = m ? m.delete(normalize(name)) : false;
			if (m && !m.size) {
				chats.delete(chat);
			}
			return removed;
		},
		rename(chat, from, to) {
			const m = chats.get(chat);
			const note = m?.get(normalize(from));
			if (!note) {
				return false;
			}
			m.delete(normalize(from));
			note.name = normalize(to);
			note.updatedAt = now();
			m.set(note.name, note);
			return true;
		},
		list(chat) {
			return [...(chats.get(chat)?.values() ?? [])].sort((a, b) => a.name.localeCompare(b.name));
		},
		/** Case-insensitive search across note names and string contents. */
		search(chat, query) {
			const q = String(query || '').toLowerCase();
			if (!q) {
				return [];
			}
			return this.list(chat).filter(n =>
				n.name.includes(q) || (typeof n.content === 'string' && n.content.toLowerCase().includes(q)));
		},
		countIn: (chat) => chats.get(chat)?.size ?? 0,
		get size() {
			let total = 0;
			for (const m of chats.values()) {
				total += m.size;
			}
			return total;
		},
		toJSON() {
			return { entries: [...chats].map(([chat, m]) => [chat, [...m.values()]]) };
		},
		load(snapshot) {
			chats.clear();
			for (const [chat, list] of snapshot?.entries || []) {
				const m = new Map();
				for (const note of list) {
					m.set(note.name, { ...note });
				}
				chats.set(chat, m);
			}
		},
		clear() {
			chats.clear();
		}
	};
};
