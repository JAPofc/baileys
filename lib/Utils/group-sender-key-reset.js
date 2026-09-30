/**
 * JAP@Add --- decide whether a group-participant notification must invalidate the
 * bot's stored group sender-key state (`sender-key-memory`).
 *
 * WhatsApp/Signal "Sender Keys" implement membership changes *lazily*: the sender
 * notes the change and rotates its outbound sender key on the next send. If the
 * stored distribution memory is never invalidated, two things break:
 *
 *  - **Forward secrecy** — a removed/departed member keeps the current sender key
 *    and can still decrypt everything the bot sends afterwards.
 *  - **Delivery** — after a member switches phones (a new device replaces the old),
 *    the new device never receives a Sender Key Distribution Message, so its
 *    messages to the group stay stuck at "Waiting for this message"
 *    (WhiskeySockets/Baileys#2704).
 *
 * Clearing `sender-key-memory[group]` forces the next outbound message to generate
 * a fresh sender key and re-distribute it to exactly the *current* devices.
 *
 * Adds/promotes/demotes need no reset: a newly-added device isn't in the memory
 * yet, so the normal send path already sends it the current key, and role changes
 * don't affect membership.
 *
 * @param {string | undefined} action  the group-participant notification tag
 *   (`add` | `remove` | `leave` | `modify` | `promote` | `demote` | ...)
 * @returns {{ reset: boolean, reason: 'participant-left' | 'participant-number-changed' | null }}
 */
export const resolveGroupSenderKeyReset = (action) => {
    switch (action) {
        case 'remove':
        case 'leave':
            // forward secrecy: rotate so the departed member can't read future messages
            return { reset: true, reason: 'participant-left' };
        case 'modify':
            // phone/number switch: re-distribute to the replacement device (#2704)
            return { reset: true, reason: 'participant-number-changed' };
        default:
            return { reset: false, reason: null };
    }
};
