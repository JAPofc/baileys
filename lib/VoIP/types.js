/**
 * lib/VoIP/types.js
 * Author: J.AP (@japofc/baileys)
 *
 * Shared constants for the VoIP stack.
 */

/** Call lifecycle states (values mirror WhatsApp's WASM `CallState`). */
export const CallState = Object.freeze({
    Idle: 0,
    Calling: 1,
    PreacceptReceived: 2,
    ReceivedCall: 3,
    AcceptSent: 4,
    AcceptReceived: 5,
    Active: 6,
    ActiveElsewhere: 7,
    Ending: 13
});
