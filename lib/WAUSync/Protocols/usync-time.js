/**
 * JAP@Fix (§2.133) — a `t` attribute straight off the wire turned into a Date no matter what
 * it held: absent meant `new Date(0)` (1 Jan 1970, which reads as a real, very old timestamp
 * to every consumer) and non-numeric meant an Invalid Date, whose `.toISOString()` throws a
 * RangeError in the caller. A timestamp the server did not send is `undefined`.
 * @param {string|number|undefined} t seconds since the epoch, as sent by WhatsApp
 * @returns {Date|undefined}
 */
export const toSetAtDate = (t) => {
    if (t === undefined || t === null || t === '') {
        return undefined;
    }
    const seconds = Number(t);
    if (!Number.isFinite(seconds) || seconds <= 0) {
        return undefined;
    }
    return new Date(seconds * 1000);
};
