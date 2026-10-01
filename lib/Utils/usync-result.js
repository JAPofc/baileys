/**
 * lib/Utils/usync-result.js — reading the error side of a USync IQ
 *
 * Part of @japofc/baileys. `USyncQuery.parseUSyncQueryResult()` carried three standing
 * TODOs — "implement errors etc.", "implement error backoff, refresh etc." and "see if
 * there are any errors in the result node" — and in the meantime threw every server-side
 * error away: a `<usync><result><error code="479"/>` (rate overlimit) parsed into an empty
 * list that is indistinguishable from "none of these numbers are on WhatsApp"
 * (BUGREPORT §2.49).
 *
 * These helpers are pure and null-safe so they can be unit-tested without a socket.
 */
import { getBinaryNodeChild, getBinaryNodeChildren } from '../WABinary/index.js';

const toErrorEntry = (errorNode, extra) => {
	const attrs = errorNode?.attrs || {};
	const rawCode = attrs.code ?? attrs.error;
	const code = Number.parseInt(rawCode, 10);
	return {
		...extra,
		code: Number.isFinite(code) ? code : undefined,
		text: attrs.text ?? attrs.reason ?? undefined
	};
};

/**
 * Collect every error carried by a USync IQ: the query-level `<usync><result><error/>`
 * and the per-user errors nested under `<usync><list><user>`, including the ones a
 * protocol reports inside its own child node (`<devices><error/>`).
 *
 * @param {object} resultNode The full `<iq>` node handed to `parseUSyncQueryResult()`.
 * @returns {Array<{ code?: number, text?: string, jid?: string, protocol?: string }>}
 *   Empty when the query succeeded.
 */
export const extractUSyncErrors = (resultNode) => {
	const errors = [];
	const usyncNode = getBinaryNodeChild(resultNode, 'usync');
	if (!usyncNode) {
		return errors;
	}
	// query-level: <usync><result><error code="479" text="rate overlimit"/>
	const resultChild = getBinaryNodeChild(usyncNode, 'result');
	for (const errorNode of getBinaryNodeChildren(resultChild, 'error')) {
		errors.push(toErrorEntry(errorNode));
	}
	// per-user: <usync><list><user jid="…"><error/> and <user><devices><error/>
	const listNode = getBinaryNodeChild(usyncNode, 'list');
	for (const userNode of getBinaryNodeChildren(listNode, 'user')) {
		const jid = userNode?.attrs?.jid;
		for (const errorNode of getBinaryNodeChildren(userNode, 'error')) {
			errors.push(toErrorEntry(errorNode, { jid }));
		}
		if (Array.isArray(userNode?.content)) {
			for (const protocolNode of userNode.content) {
				if (!protocolNode || protocolNode.tag === 'error') {
					continue;
				}
				for (const errorNode of getBinaryNodeChildren(protocolNode, 'error')) {
					errors.push(toErrorEntry(errorNode, { jid, protocol: protocolNode.tag }));
				}
			}
		}
	}
	return errors;
};

/**
 * Whether a USync IQ reported an error that applies to the whole query rather than to one
 * user — i.e. the caller's empty list means "the server refused", not "nobody matched".
 *
 * @param {Array<{ jid?: string }>} errors Output of {@link extractUSyncErrors}.
 * @returns {boolean}
 */
export const hasUSyncQueryError = (errors) => (errors || []).some((error) => error && error.jid === undefined);
