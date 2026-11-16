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

/**
 * JAP@Upgrade (v2.4.8): every rule now also carries whether the close is FATAL
 * (reconnecting cannot help and may make things worse), a `remedy` telling the
 * operator what to actually do, and — for `badSession` — how many consecutive
 * hits are tolerated before it counts as fatal. A single badSession is usually a
 * transient server-side decrypt hiccup; three in a row is a corrupt session.
 */
const BAD_SESSION_STREAK = 3;

const RULES = {
	[DisconnectReason.connectionClosed]: { category: 'transient', action: 'reconnect-now', fatal: false, description: 'Connection closed by the server — normal churn.', remedy: 'Reconnect; no action needed.' },
	[DisconnectReason.connectionLost]: { category: 'transient', action: 'reconnect-now', fatal: false, description: 'Network dropped mid-session.', remedy: 'Reconnect; check the host network if it repeats.' },
	[DisconnectReason.timedOut]: { category: 'transient', action: 'reconnect-now', fatal: false, description: 'Server stopped answering (timeout).', remedy: 'Reconnect; no action needed.' },
	[DisconnectReason.restartRequired]: { category: 'transient', action: 'reconnect-now', fatal: false, description: 'Server asked for a restart — standard after pairing.', remedy: 'Reconnect immediately once; back off if it repeats.' },
	[DisconnectReason.unavailableService]: { category: 'transient', action: 'reconnect-backoff', fatal: false, description: 'WhatsApp service temporarily unavailable — back off before retrying.', remedy: 'Back off and retry; this is on WhatsApp\'s side.' },
	[DisconnectReason.connectionReplaced]: { category: 'conflict', action: 'stop', fatal: true, description: 'Another session with the same credentials connected — running two bots on one session corrupts it.', remedy: 'STOP this process. Find the other process/host using the same auth folder and shut one of them down — do not reconnect in a loop, that is a fight both sides lose.' },
	[DisconnectReason.multideviceMismatch]: { category: 'auth', action: 're-pair', fatal: true, description: 'Multi-device state mismatch — delete the session and pair again.', remedy: 'Delete the auth folder and pair again. Reconnecting with the same files will keep failing.' },
	[DisconnectReason.badSession]: { category: 'auth', action: 'retry-then-re-pair', fatal: true, fatalAfterStreak: BAD_SESSION_STREAK, description: 'Session files look corrupt (bad decrypt).', remedy: `One of these is often a transient server hiccup — retry. After ${BAD_SESSION_STREAK} in a row, run repairAuthState() or delete the auth folder and pair again.` },
	[DisconnectReason.loggedOut]: { category: 'auth', action: 're-pair', fatal: true, description: 'Logged out from the phone — the session is gone, pair again.', remedy: 'Delete the auth folder and pair again; the credentials are dead.' },
	[DisconnectReason.forbidden]: { category: 'banned', action: 'stop', fatal: true, description: 'Account access forbidden — the number is likely banned or restricted.', remedy: 'STOP and check the number in the WhatsApp app. Hammering a forbidden account with reconnects can escalate the restriction.' }
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
		description: rule?.description ?? `Unrecognized close (code ${code ?? 'none'}) — reconnect with backoff and watch the logs.`,
		/** Reconnecting cannot fix this one. `fatalAfterStreak` relaxes it to "not yet". */
		fatal: rule?.fatal ?? false,
		/** How many consecutive hits are tolerated before `fatal` applies (null = immediately). */
		fatalAfterStreak: rule?.fatalAfterStreak ?? null,
		/** What the operator should actually do. */
		remedy: rule?.remedy ?? 'Reconnect with backoff; if it repeats, capture the logs — this code is not in the table.'
	};
};

/** One human-readable line for logs/owner DMs. */
export const explainDisconnect = (input, { streak = 0 } = {}) => {
	const verdict = classifyDisconnect(input);
	const icon = { transient: '🔄', conflict: '⚔️', auth: '🔑', banned: '⛔', unknown: '❓' }[verdict.category];
	const head = `${icon} [${verdict.category}${verdict.code !== null ? ` ${verdict.code}` : ''}] ${verdict.description}`;
	// JAP@Upgrade (v2.4.8): a fatal close now spells out what to do, and a streaked
	// one (badSession) says how far along the streak we are instead of crying wolf
	// on the first hit.
	if (verdict.fatalAfterStreak && streak > 0 && streak < verdict.fatalAfterStreak) {
		return `${head} (${streak}/${verdict.fatalAfterStreak} in a row — retrying; ${verdict.remedy})`;
	}
	return verdict.fatal ? `${head}\n   ↳ FATAL: ${verdict.remedy}` : head;
};
