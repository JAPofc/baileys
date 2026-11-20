/**
 * lib/Utils/group-notification.js — pure parsing helpers for `w:gp2` group notifications
 *
 * Part of @japofc/baileys. `handleGroupNotification()` in `lib/Socket/messages-recv.js`
 * used to resolve the acting/affected participants with two independent `||` fallbacks,
 * which could pair one person's LID with another person's phone number (BUGREPORT §2.42).
 * The resolution lives here instead: socket-free, so it can be unit-tested against raw
 * binary nodes without standing up a connection.
 */
import { getBinaryNodeChild, getBinaryNodeChildren, isLidUser, isPnUser, jidNormalizedUser } from '../WABinary/index.js';

/**
 * JAP@Fix (§2.42 / v2.4.7) --- Resolve who performed a group action and who it was
 * performed on.
 *
 * The previous inline version was:
 *   affectedLid = child.participant?.attrs?.jid         || actingLid
 *   affectedPn  = child.participant?.attrs?.phone_number || actingPn
 *
 * Those two fallbacks are independent, so a `<participant jid="requester@lid">` child with
 * no `phone_number` attribute (the common shape for join-request notifications) produced
 * `{ lid: requester, pn: ADMIN }` — a pair describing nobody. That pair is written into
 * `messageStubParameters`, so bots reading it greeted/approved/stored the wrong identity.
 *
 * The affected participant is now resolved as a **unit**: either it comes from the
 * `<participant>` child (and a missing counterpart stays `undefined`), or — when there is
 * no such child — the action targets the actor and both fields come from the actor.
 *
 * @param {{attrs?: Record<string, any>}} fullNode The `<notification>` node.
 * @param {{tag?: string, attrs?: Record<string, any>, content?: any}} [child] Its first child (`add`, `remove`, …).
 * @returns {{
 *   actingLid: string|undefined, actingPn: string|undefined, actingUsername: string|undefined,
 *   affectedLid: string|undefined, affectedPn: string|undefined, affectedIsActor: boolean
 * }}
 */
export const resolveNotificationActors = (fullNode, child) => {
	const actingLid = fullNode?.attrs?.participant;
	const actingPn = fullNode?.attrs?.participant_pn;
	const actingUsername = fullNode?.attrs?.participant_username;

	const participantNode = child ? getBinaryNodeChild(child, 'participant') : undefined;
	const attrs = participantNode?.attrs;

	if (!attrs?.jid) {
		// No explicit target: the notification is about the actor themselves (someone left,
		// revoked their own request, …). Both halves come from the same person, so the pair
		// stays internally consistent.
		return {
			actingLid,
			actingPn,
			actingUsername,
			affectedLid: actingLid,
			affectedPn: actingPn,
			affectedIsActor: true
		};
	}

	// The target is addressed by whichever address kind the server used; the counterpart is
	// only taken from the SAME node, never from the actor.
	let affectedLid;
	let affectedPn;
	if (isLidUser(attrs.jid)) {
		affectedLid = attrs.jid;
		affectedPn = isPnUser(attrs.phone_number) ? attrs.phone_number : undefined;
	}
	else {
		affectedPn = attrs.jid;
		affectedLid = isLidUser(attrs.lid) ? attrs.lid : undefined;
	}

	return {
		actingLid,
		actingPn,
		actingUsername,
		affectedLid,
		affectedPn,
		affectedIsActor: false
	};
};

/**
 * Parse the `<participant>` children of a group-action node into the stub-parameter shape
 * (`add`/`remove`/`promote`/`demote`/`leave`). Same field layout `extractGroupMetadata()`
 * produces, so `extractLIDPNPairs()` accepts the result directly.
 * @param {{content?: any}} [child]
 * @returns {Array<{id: string, phoneNumber: string|undefined, lid: string|undefined, username: string|undefined, admin: string|null}>}
 */
export const parseNotificationParticipants = (child) => {
	if (!child) {
		return [];
	}
	return getBinaryNodeChildren(child, 'participant').map(({ attrs }) => ({
		id: attrs.jid,
		phoneNumber: isLidUser(attrs.jid) && isPnUser(attrs.phone_number) ? attrs.phone_number : undefined,
		lid: isPnUser(attrs.jid) && isLidUser(attrs.lid) ? attrs.lid : undefined,
		username: attrs.participant_username || attrs.username || undefined,
		admin: attrs.type || null
	}));
};

/**
 * JAP@Fix (§2.43 / v2.4.7) --- Collect every LID↔PN pair a `w:gp2` notification asserts.
 *
 * Two sources, both previously discarded (the `TODO: Store LID MAPPINGS` in
 * `messages-recv.js`):
 *   1. the actor attributes on the notification itself (`participant` + `participant_pn`),
 *      which the server sends on essentially every group action;
 *   2. the `<participant>` children of add/remove/promote/demote actions.
 *
 * A participant joining a group is precisely the moment the client first learns that
 * person's address pair, so dropping it forced a later USync round-trip to rediscover it.
 *
 * Only internally consistent pairs are returned — a LID is never matched with someone
 * else's phone number (see §2.42) — and everything is device-suffix normalized and
 * deduplicated, ready for `storeLIDPNMappings()`.
 *
 * The `modify` action (GROUP_PARTICIPANT_CHANGE_NUMBER) is deliberately excluded from
 * source 2: its `<participant>` children list the member's **old** number, so harvesting
 * them would write a mapping that the very same notification says is now stale.
 *
 * @param {{attrs?: Record<string, any>}} fullNode
 * @param {{tag?: string, content?: any}} [child]
 * @returns {Array<{lid: string, pn: string}>}
 */
export const extractNotificationLIDPNPairs = (fullNode, child) => {
	const pairs = [];
	const seen = new Set();

	const push = (lid, pn) => {
		if (!isLidUser(lid) || !isPnUser(pn)) {
			return;
		}
		const normalizedLid = jidNormalizedUser(lid);
		const normalizedPn = jidNormalizedUser(pn);
		const key = `${normalizedLid}|${normalizedPn}`;
		if (seen.has(key)) {
			return;
		}
		seen.add(key);
		pairs.push({ lid: normalizedLid, pn: normalizedPn });
	};

	// 1. the actor pair carried on the notification node
	push(fullNode?.attrs?.participant, fullNode?.attrs?.participant_pn);

	// A change-number notification (GROUP_PARTICIPANT_CHANGE_NUMBER) lists the member's
	// OLD number, so nothing below it may be harvested -- re-storing it would write the
	// mapping that this very notification declares stale.
	const isChangeNumber = child?.tag === 'modify';

	// 2. the affected participant, resolved as a consistent unit
	const actors = resolveNotificationActors(fullNode, child);
	if (!actors.affectedIsActor && !isChangeNumber) {
		push(actors.affectedLid, actors.affectedPn);
	}

	// 3. every participant listed by the action itself
	for (const participant of isChangeNumber ? [] : parseNotificationParticipants(child)) {
		if (isLidUser(participant.id)) {
			push(participant.id, participant.phoneNumber);
		}
		else {
			push(participant.lid, participant.id);
		}
	}

	return pairs;
};
