/** Button extras — one-liners for common button patterns. */

/** Turn plain labels into a sendButtons-ready array (ids auto: qb_0…). */
export declare const quickButtons: (
	labels: Array<string | { id?: string; text: string }>,
	options?: { idPrefix?: string }
) => Array<{ id: string; text: string }>;

/** One-call yes/no prompt (ids confirm_yes / confirm_no). */
export declare const sendConfirm: (
	sock: unknown,
	jid: string,
	text: string,
	options?: { yes?: string; no?: string; yesId?: string; noId?: string; footer?: string } & Record<string, unknown>
) => Promise<unknown>;

/** Numbered menu from an option list (ids menu_0, menu_1, …). */
export declare const sendMenuButtons: (
	sock: unknown,
	jid: string,
	title: string,
	items: string[],
	options?: { idPrefix?: string; footer?: string } & Record<string, unknown>
) => Promise<unknown>;
