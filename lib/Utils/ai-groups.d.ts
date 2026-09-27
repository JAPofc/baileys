/**
 * AI group helpers — EXPERIMENTAL & SERVER-GATED: works only when the
 * session's account has Meta's AI rollout flag; otherwise the server
 * rejects the add. Wire shapes structurally verified.
 */

/** Meta AI's bot user id (the `@bot` domain participant). */
export declare const META_AI_BOT_USER: string;
/** Build the `…@bot` participant jid. */
export declare const aiBotJid: (botUser?: string) => string;

export interface AiBotParticipantStatus {
	jid: string;
	/** '200' = accepted; anything else is the server's error code. */
	status: string;
}

export declare const addAiBotToGroup: (
	sock: unknown,
	groupJid: string,
	options?: { botUser?: string }
) => Promise<AiBotParticipantStatus[]>;

export declare const removeAiBotFromGroup: (
	sock: unknown,
	groupJid: string,
	options?: { botUser?: string }
) => Promise<AiBotParticipantStatus[]>;

/** Normal groupCreate, then best-effort bot add (rejection never fails creation). */
export declare const createAiGroup: (
	sock: unknown,
	subject: string,
	participants?: string[],
	options?: { autoAddBot?: boolean; botUser?: string }
) => Promise<{ group: Record<string, unknown>; bot: { added: boolean; statuses?: AiBotParticipantStatus[]; error?: unknown } }>;
