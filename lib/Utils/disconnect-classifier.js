/**
 * Disconnect classifier — turn cryptic close errors into a category, a
 * recommended action and a human sentence.
 *
 * ```js
 * import { classifyDisconnect, explainDisconnect } from '@japofc/baileys'
 *
 * sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
 *     if (connection !== 'close') return
 *     const verdict = classifyDisconnect(lastDisconnect)
 *     // { code: 515, category: 'transient', shouldReconnect: true,
 *     //   action: 'reconnect-now', description: '…' }
 *     if (verdict.shouldReconnect) restart()
 *     else console.log(explainDisconnect(lastDisconnect))
 * })
 * ```
 *
 * Categories: 'transient' (reconnect), 'conflict' (another session took
 * over), 'auth' (re-pair needed), 'banned', 'unknown'.
 */
import { DisconnectReason } from '../Types/index.js';

const RULES = {
	[DisconnectReason.connectionClosed]: { category: 'transient', action: 'reconnect-now', description: 'Connection closed by the server — normal churn.' },
	[DisconnectReason.connectionLost]: { category: 'transient', action: 'reconnect-now', description: 'Network dropped mid-session.' },
	[DisconnectReason.timedOut]: { category: 'transient', action: 'reconnect-now', description: 'Server stopped answering (timeout).' },
	[DisconnectReason.restartRequired]: { category: 'transient', action: 'reconnect-now', description: 'Server asked for a restart — standard after pairing.' },
	[DisconnectReason.unavailableService]: { category: 'transient', action: 'reconnect-backoff', description: 'WhatsApp service temporarily unavailable — back off before retrying.' },
	[DisconnectReason.connectionReplaced]: { category: 'conflict', action: 'stop', description: 'Another session with the same credentials connected — running two bots on one session corrupts it.' },
	[DisconnectReason.multideviceMismatch]: { category: 'auth', action: 're-pair', description: 'Multi-device state mismatch — delete the session and pair again.' },
	[DisconnectReason.badSession]: { category: 'auth', action: 're-pair', description: 'Session files are corrupt — repair or re-pair.' },
	[DisconnectReason.loggedOut]: { category: 'auth', action: 're-pair', description: 'Logged out from the phone — the session is gone, pair again.' },
	[DisconnectReason.forbidden]: { category: 'banned', action: 'stop', description: 'Account access forbidden — the number is likely banned or restricted.' }
};

const codeOf = (input) => {
	if (typeof input === 'number') {
		return input;
	}
	const error = input?.error ?? input; // accepts lastDisconnect or an error
	return error?.output?.statusCode
		?? error?.output?.payload?.statusCode
		?? null;
};

/**
 * Classify a close. Accepts a `lastDisconnect` object, a Boom error, or a
 * bare status code. Returns `{ code, reason, category, action,
 * shouldReconnect, description }`.
 */
export const classifyDisconnect = (input) => {
	const code = codeOf(input);
	const rule = code !== null ? RULES[code] : undefined;
	const category = rule?.category ?? 'unknown';
	return {
		code,
		reason: code !== null ? (DisconnectReason[code] ?? null) : null,
		category,
		action: rule?.action ?? 'reconnect-backoff',
		shouldReconnect: category === 'transient' || category === 'unknown',
		description: rule?.description ?? `Unrecognized close (code ${code ?? 'none'}) — reconnect with backoff and watch the logs.`
	};
};

/** One human-readable line for logs/owner DMs. */
export const explainDisconnect = (input) => {
	const verdict = classifyDisconnect(input);
	const icon = { transient: '🔄', conflict: '⚔️', auth: '🔑', banned: '⛔', unknown: '❓' }[verdict.category];
	return `${icon} [${verdict.category}${verdict.code !== null ? ` ${verdict.code}` : ''}] ${verdict.description}`;
};
