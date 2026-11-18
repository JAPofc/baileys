/** Command lock — disable commands per chat/globally + maintenance mode. */

export interface CommandLockVerdict {
	locked: boolean;
	reason?: 'maintenance' | 'global' | 'chat';
}

export interface CommandLock {
	check(chat: string, command: string, sender?: string): CommandLockVerdict;
	isLocked(chat: string, command: string, sender?: string): boolean;
	/** '*' locks everything in the chat. */
	lock(chat: string, command?: string): void;
	unlock(chat: string, command?: string): boolean;
	lockGlobal(command: string): void;
	unlockGlobal(command: string): boolean;
	getLocks(chat: string): { chat: string[]; global: string[] };
	/** Only owners run anything while on. */
	setMaintenance(on: boolean, options?: { message?: string }): void;
	readonly isMaintenance: boolean;
	/** Router middleware; maintenance notices are sent once per user. */
	middleware(options?: { reply?: string | false | ((ctx: unknown, verdict: CommandLockVerdict) => string) }): (ctx: any, next: () => Promise<void>) => Promise<void>;
	onBlocked(cb: (info: { chat: string; sender: string; command: string; reason: string }) => void): () => void;
	toJSON(): Record<string, unknown>;
	load(snapshot: Record<string, unknown>): void;
}

export declare const createCommandLock: (options?: { owners?: string | string[] }) => CommandLock;
