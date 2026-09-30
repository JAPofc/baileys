/**
 * Todo lists — shared task lists per chat: "!todo add beli galon",
 * "!todo done 2", assignees included.
 *
 * ```js
 * import { createTodoList } from '@japofc/baileys'
 *
 * const todos = createTodoList()
 * todos.add(chat, 'beli galon', { by: sender })
 * todos.add(chat, 'bayar wifi', { assignee: 'budi@s.whatsapp.net' })
 *
 * todos.list(chat)             // open tasks, numbered
 * todos.done(chat, 1)          // check off by position
 * todos.render(chat)           // ready-to-send text with ☐/☑
 * todos.clearDone(chat)
 * ```
 */

export const createTodoList = (options = {}) => {
	const { maxPerChat = 100, now = () => Date.now() } = options;

	/** chat -> [{ id, text, by, assignee, done, createdAt, doneAt }] */
	const chats = new Map();
	let nextId = 1;

	const bag = (chat) => {
		let list = chats.get(chat);
		if (!list) {
			list = [];
			chats.set(chat, list);
		}
		return list;
	};

	/** Resolve a task by 1-based position (of the visible list) or by id. */
	const resolve = (chat, ref, { includeDone = true } = {}) => {
		const list = chats.get(chat) || [];
		const visible = includeDone ? list : list.filter(t => !t.done);
		if (Number.isInteger(ref) && ref >= 1 && ref <= visible.length) {
			return visible[ref - 1];
		}
		return list.find(t => t.id === ref) || null;
	};

	return {
		/** Add a task. Returns `{ id, position }`. */
		add(chat, text, { by, assignee, priority } = {}) {
			const clean = String(text || '').trim();
			if (!clean) {
				throw new Error('task text must not be empty');
			}
			const list = bag(chat);
			if (list.length >= maxPerChat) {
				throw new Error(`todo limit reached for this chat (${maxPerChat})`);
			}
			if (priority && !['high', 'medium', 'low'].includes(priority)) {
				throw new Error("priority must be 'high' | 'medium' | 'low'");
			}
			const task = { id: nextId++, text: clean, by, assignee, priority: priority || null, done: false, createdAt: now(), doneAt: null, dueAt: null };
			list.push(task);
			return { id: task.id, position: list.length };
		},
		/** Check a task off (1-based position or id). */
		done(chat, ref) {
			const task = resolve(chat, ref);
			if (!task || task.done) {
				return false;
			}
			task.done = true;
			task.doneAt = now();
			return true;
		},
		/** Un-check a task. */
		undone(chat, ref) {
			const task = resolve(chat, ref);
			if (!task || !task.done) {
				return false;
			}
			task.done = false;
			task.doneAt = null;
			return true;
		},
		remove(chat, ref) {
			const task = resolve(chat, ref);
			if (!task) {
				return false;
			}
			const list = bag(chat);
			list.splice(list.indexOf(task), 1);
			return true;
		},
		/** JAP@Upgrade: change a task's priority (null clears it). */
		setPriority(chat, ref, priority) {
			const task = resolve(chat, ref);
			if (!task) {
				return false;
			}
			if (priority && !['high', 'medium', 'low'].includes(priority)) {
				throw new Error("priority must be 'high' | 'medium' | 'low'");
			}
			task.priority = priority || null;
			return true;
		},
		/** JAP@Upgrade: set (or clear with null) a task deadline. */
		setDue(chat, ref, dueAt) {
			const task = resolve(chat, ref);
			if (!task) {
				return false;
			}
			task.dueAt = dueAt ?? null;
			return true;
		},
		/** Open tasks past their deadline. */
		getOverdue(chat) {
			const t = now();
			return this.list(chat, { openOnly: true }).filter(task => task.dueAt && task.dueAt <= t);
		},
		assign(chat, ref, assignee) {
			const task = resolve(chat, ref);
			if (!task) {
				return false;
			}
			task.assignee = assignee;
			return true;
		},
		/** Tasks in a chat — `{ openOnly: true }` hides finished ones. */
		list(chat, { openOnly = false } = {}) {
			const list = chats.get(chat) || [];
			return (openOnly ? list.filter(t => !t.done) : list).map((t, i) => ({ position: i + 1, ...t }));
		},
		/** Ready-to-send text with ☐/☑ checkboxes and @assignees. */
		render(chat, { title = '📋 *To-do*' } = {}) {
			const list = chats.get(chat) || [];
			if (!list.length) {
				return `${title}\n(kosong)`;
			}
			const lines = list.map((t, i) => {
				const box = t.done ? '☑' : '☐';
				const who = t.assignee ? ` → @${String(t.assignee).split('@')[0]}` : '';
				const late = !t.done && t.dueAt && t.dueAt <= now() ? ' ⏰' : '';
				const prio = t.priority === 'high' ? '🔴 ' : t.priority === 'medium' ? '🟡 ' : '';
				return `${box} ${i + 1}. ${prio}${t.text}${who}${late}`;
			});
			return `${title}\n${lines.join('\n')}`;
		},
		/** Mentions array matching render() output (for sendMessage). */
		mentions(chat) {
			return [...new Set((chats.get(chat) || []).map(t => t.assignee).filter(Boolean))];
		},
		/** JAP@Upgrade: one-line summary: '3/5 selesai (1 telat)'. */
		renderCompact(chat) {
			const list = chats.get(chat) || [];
			const done = list.filter(t => t.done).length;
			const late = this.getOverdue(chat).length;
			return `${done}/${list.length} selesai${late ? ` (${late} telat \u23F0)` : ''}`;
		},
		clearDone(chat) {
			const list = chats.get(chat) || [];
			const before = list.length;
			chats.set(chat, list.filter(t => !t.done));
			return before - chats.get(chat).length;
		},
		countIn: (chat, { openOnly = false } = {}) =>
			(chats.get(chat) || []).filter(t => !openOnly || !t.done).length,
		toJSON() {
			return { nextId, entries: [...chats] };
		},
		load(snapshot) {
			chats.clear();
			nextId = snapshot?.nextId || 1;
			for (const [chat, list] of snapshot?.entries || []) {
				chats.set(chat, list.map(t => ({ ...t })));
			}
		},
		clear() {
			chats.clear();
		}
	};
};
