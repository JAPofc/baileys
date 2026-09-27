/** Todo lists — shared task lists per chat with assignees. */

export interface TodoTask {
	position?: number;
	id: number;
	text: string;
	by?: string;
	assignee?: string;
	priority?: 'high' | 'medium' | 'low' | null;
	done: boolean;
	createdAt: number;
	doneAt: number | null;
	dueAt: number | null;
}

export interface TodoListOptions {
	/** Max tasks per chat. Default 100. */
	maxPerChat?: number;
	/** Clock override (testing). */
	now?: () => number;
}

export interface TodoList {
	add(chat: string, text: string, meta?: { by?: string; assignee?: string; priority?: 'high' | 'medium' | 'low' }): { id: number; position: number };
	/** Check off by 1-based position or id. */
	done(chat: string, ref: number): boolean;
	undone(chat: string, ref: number): boolean;
	remove(chat: string, ref: number): boolean;
	assign(chat: string, ref: number, assignee: string): boolean;
	/** Set (or clear with null) a task deadline. */
	setDue(chat: string, ref: number, dueAt: number | null): boolean;
	setPriority(chat: string, ref: number, priority: 'high' | 'medium' | 'low' | null): boolean;
	/** Open tasks past their deadline. */
	getOverdue(chat: string): TodoTask[];
	list(chat: string, options?: { openOnly?: boolean }): TodoTask[];
	/** Ready-to-send checklist text (☐/☑, @assignees). */
	render(chat: string, options?: { title?: string }): string;
	/** Mentions array matching render() output. */
	mentions(chat: string): string[];
	/** Remove finished tasks. Returns how many were removed. */
	clearDone(chat: string): number;
	countIn(chat: string, options?: { openOnly?: boolean }): number;
	toJSON(): Record<string, unknown>;
	load(snapshot: Record<string, unknown>): void;
	clear(): void;
}

export declare const createTodoList: (options?: TodoListOptions) => TodoList;
