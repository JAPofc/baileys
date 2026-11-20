/** Member verifier — captcha-gate new group members. */

export declare const mathChallenge: () => { question: string; answer: string };
export declare const emojiChallenge: () => { question: string; answer: string };

export interface VerifierOptions {
	/** Built-in preset: 'math' (default) or 'emoji'. Ignored when generateChallenge given. */
	challenge?: 'math' | 'emoji';
	/** Time to answer before onFailed('timeout'). Default 120000. 0 disables. */
	timeoutMs?: number;
	/** Wrong answers before onFailed('attempts'). Default 3. */
	maxAttempts?: number;
	/** Auto-challenge members added to groups. Default true. */
	autoChallenge?: boolean;
	/** Custom challenge factory. Default: simple math. */
	generateChallenge?: (info: { user: string; chat: string }) => { question: string; answer: string | number };
	/** Only watch these group jids. Omit for all groups. */
	groups?: string[];
}

export interface VerifierChallenge {
	user: string;
	chat: string;
	question: string;
	deadline: number;
}

export interface VerifierResult {
	user: string;
	chat: string;
	attempts: number;
	reason?: 'timeout' | 'attempts';
}

export interface Verifier {
	challenge(user: string, chat: string): { user: string; chat: string; question: string; answer: string };
	verify(user: string, chat: string, answer: string): 'verified' | 'wrong' | 'failed' | null;
	participantsHandler(update: unknown): void;
	upsertHandler(upsert: { messages: unknown[] }): void;
	bind(sock: unknown): () => void;
	unbind(): void;
	onChallenge(cb: (challenge: VerifierChallenge) => void): () => void;
	onVerified(cb: (result: VerifierResult) => void): () => void;
	onFailed(cb: (result: VerifierResult) => void): () => void;
	isPending(user: string, chat: string): boolean;
	getPending(): Array<Omit<VerifierChallenge, 'deadline'> & { answer: string; attempts: number; deadline: number }>;
	cancel(user: string, chat: string): boolean;
	readonly size: number;
	clear(): void;
}

export declare const createVerifier: (options?: VerifierOptions) => Verifier;
