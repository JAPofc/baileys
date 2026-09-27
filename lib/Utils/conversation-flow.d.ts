/** Conversation flows — multi-step wizards per (chat, user). */

export interface FlowStep {
	id: string;
	/** Text or a function of the answers collected so far. */
	prompt?: string | ((answers: Record<string, unknown>) => string);
	/** Return true/undefined to accept; a string re-prompts with that message. */
	validate?: (text: string, answers: Record<string, unknown>) => boolean | string | Promise<boolean | string>;
	/** Transform the accepted text before storing. */
	parse?: (text: string) => unknown;
	/** Fixed options: rendered numbered, answered by text or number. */
	choices?: string[];
}

export interface ConversationFlowOptions {
	/** Inactivity timeout per step. Default 5 min. 0 disables. */
	timeoutMs?: number;
	/** Words that abort the flow. Default ['cancel', 'batal']. */
	cancelWords?: string[];
	/** Words that go back one step. Default ['back', 'kembali']. */
	backWords?: string[];
	/** Clock override (testing). */
	now?: () => number;
}

export interface FlowSessionInfo {
	chat: string;
	user: string;
	flowName: string;
	stepIndex: number;
	totalSteps: number;
	answers: Record<string, unknown>;
	startedAt: number;
	lastActiveAt: number;
}

export interface FlowEndEvent {
	chat: string;
	user: string;
	flow: string;
	answers: Record<string, unknown>;
	reason?: string;
}

export interface ConversationFlow {
	define(name: string, steps: FlowStep[]): ConversationFlow;
	start(sock: unknown, chat: string, user: string, flowName: string, seed?: Record<string, unknown>): Promise<unknown>;
	answer(chat: string, user: string, text: string, sock?: unknown): Promise<'cancelled' | 'back' | 'invalid' | 'complete' | 'next' | null>;
	handler(upsert: { messages: unknown[] }, sock?: unknown): Promise<void>;
	bind(sock: unknown): () => void;
	unbind(): void;
	cancel(chat: string, user: string, reason?: string): boolean;
	isActive(chat: string, user: string): boolean;
	getSession(chat: string, user: string): FlowSessionInfo | null;
	onStep(cb: (info: { chat: string; user: string; flow: string; step: string; prompt: string }) => void): () => void;
	onComplete(cb: (event: FlowEndEvent) => void): () => void;
	onCancel(cb: (event: FlowEndEvent) => void): () => void;
	readonly size: number;
	clear(): void;
}

export declare const createConversationFlow: (options?: ConversationFlowOptions) => ConversationFlow;
