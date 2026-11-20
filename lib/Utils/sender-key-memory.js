/**
 * lib/Utils/sender-key-memory.js — the "who already has our group sender key" bookkeeping.
 *
 * Group messages are encrypted once with a sender key; the key itself is distributed to each
 * device exactly once and that fact is remembered in the `sender-key-memory` auth bucket. If
 * that memory ever claims a device has a key it never received, the device sees
 * "waiting for this message" forever — so there has to be a supported way to clear it.
 *
 * Part of @japofc/baileys.
 */
import { Boom } from '@hapi/boom';

const asJidList = (jids, fn) => {
    const list = (Array.isArray(jids) ? jids : [jids]).filter(Boolean).map(String);
    if (!list.length) {
        throw new Boom(`${fn}: pass at least one group jid`, { statusCode: 400 });
    }
    for (const jid of list) {
        if (!jid.endsWith('@g.us') && jid !== 'status@broadcast') {
            throw new Boom(`${fn}: "${jid}" is not a group jid`, { statusCode: 400, data: { jid } });
        }
    }
    return list;
};

/**
 * Read the sender-key memory of one or more groups.
 * Returns `{ [jid]: { [deviceJid]: true } }` — an empty object for a group we have never
 * distributed a key in.
 */
export const readSenderKeyMemory = async (keys, jids) => {
    const list = asJidList(jids, 'readSenderKeyMemory');
    const stored = await keys.get('sender-key-memory', list);
    return Object.fromEntries(list.map(jid => [jid, stored?.[jid] || {}]));
};

/**
 * Forget that we ever distributed the sender key in these groups, so the next message
 * re-sends the distribution message to every device.
 *
 * ```js
 * await sock.clearSenderKeyMemory('120363000@g.us')     // one group
 * await sock.clearSenderKeyMemory([groupA, groupB])     // several
 * ```
 * Returns `{ cleared, devices }` — how many groups were reset and how many device entries
 * were dropped, so a command can report something truthful.
 */
export const clearSenderKeyMemory = async (keys, jids) => {
    const list = asJidList(jids, 'clearSenderKeyMemory');
    const existing = await readSenderKeyMemory(keys, list);
    const devices = Object.values(existing).reduce((acc, map) => acc + Object.keys(map).length, 0);
    await keys.set({ 'sender-key-memory': Object.fromEntries(list.map(jid => [jid, null])) });
    return { cleared: list.length, devices };
};

/**
 * Drop specific devices from a group's sender-key memory — the targeted version, for when a
 * single participant reports "waiting for this message" and re-keying the whole group would
 * cost every other member a redistribution.
 */
export const forgetSenderKeyDevices = async (keys, jid, deviceJids) => {
    const [group] = asJidList(jid, 'forgetSenderKeyDevices');
    const targets = (Array.isArray(deviceJids) ? deviceJids : [deviceJids]).filter(Boolean).map(String);
    if (!targets.length) {
        throw new Boom('forgetSenderKeyDevices: pass at least one device jid', { statusCode: 400 });
    }
    const memory = (await readSenderKeyMemory(keys, group))[group];
    let removed = 0;
    for (const device of targets) {
        if (memory[device] !== undefined) {
            delete memory[device];
            removed++;
        }
    }
    if (removed) {
        await keys.set({ 'sender-key-memory': { [group]: memory } });
    }
    return { removed, remaining: Object.keys(memory).length };
};
