/**
 * lib/Utils/device-list.js — deduplication for the USync device fan-out
 *
 * Part of @japofc/baileys. `getUSyncDevices()` in `lib/Socket/messages-send.js` walked its
 * input jids one by one with no deduplication, so the same user appearing twice produced
 * the same device entries twice — and every duplicate becomes an extra encrypted
 * `<to>` participant node in the outgoing stanza (BUGREPORT §2.46).
 */
import { jidDecode } from '../WABinary/index.js';

/**
 * JAP@Fix (§2.46 / v2.4.7) --- Collapse jids that resolve to the same user.
 *
 * `relayMessage()` calls `getUSyncDevices([senderIdentity, jid], …)` for 1:1 chats; in the
 * "message yourself" chat both entries are the same user, so every device was enumerated
 * twice. Status broadcasts hit the same thing whenever `statusJidList` overlaps the group
 * participant list.
 *
 * @param {Array<{jid: string, user?: string}>} entries
 * @returns {Array<{jid: string, user?: string}>} First occurrence per user, order preserved.
 */
export const dedupeJidsByUser = (entries) => {
	const seen = new Set();
	const out = [];
	for (const entry of entries || []) {
		if (!entry) {
			continue;
		}
		const key = entry.user ?? jidDecode(entry.jid)?.user ?? entry.jid;
		if (key === undefined || seen.has(key)) {
			continue;
		}
		seen.add(key);
		out.push(entry);
	}
	return out;
};

/**
 * Collapse duplicate device entries, keyed by the exact wire jid they will be addressed
 * with (falling back to `user:device` when no jid was built yet).
 *
 * Also catches the overlap between an explicitly device-addressed jid passed in by the
 * caller and the same device coming back from the cache/USync enumeration.
 *
 * @param {Array<{jid?: string, user?: string, device?: number}>} devices
 * @returns {Array<{jid?: string, user?: string, device?: number}>} First occurrence per device, order preserved.
 */
export const dedupeDeviceList = (devices) => {
	const seen = new Set();
	const out = [];
	for (const device of devices || []) {
		if (!device) {
			continue;
		}
		// Key on user + device index rather than the raw string: device 0 is encoded both
		// as `user@server` and `user:0@server` depending on who built the jid, and those
		// are the same device.
		let key;
		const decoded = device.jid ? jidDecode(device.jid) : undefined;
		if (decoded?.user) {
			key = `${decoded.user}:${decoded.device ?? 0}@${decoded.server}`;
		}
		else {
			key = device.jid ?? `${device.user}:${device.device ?? 0}`;
		}
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		out.push(device);
	}
	return out;
};
