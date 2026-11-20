// JAP@Add --- Send Guard: transparent anti-ban pacing for outgoing messages.
//
// Getting banned for sending too fast is the single most common way bot
// accounts die. This guard enforces two independent limits BEFORE a message
// is handed to the wire, with zero changes to calling code:
//
//   1. a global token bucket  — at most `messagesPerMinute` sends per minute
//      across ALL chats (burst-friendly: unused capacity accumulates up to
//      one bucket, so occasional spikes don't queue)
//   2. per-chat spacing       — at least `perChatDelayMs` (+/- jitter) between
//      two sends to the SAME jid, which is what WhatsApp's spam heuristics
//      weigh most heavily
//
// Enable it socket-wide via config and every sendMessage() call is paced
// automatically:
//
//   makeWASocket({ sendRateLimit: { messagesPerMinute: 20, perChatDelayMs: 1500 } })
//
// or use it standalone around any async work:
//
//   const guard = createSendGuard({ messagesPerMinute: 30 })
//   await guard.acquire(jid); await whatever()
//
// The guard is deliberately FIFO per chat and fair across chats; it never
// drops messages — it only delays them. `maxQueue` bounds memory: when more
// than that many sends are already waiting, acquire() rejects instead of
// growing the backlog silently (a bot stuck offline should fail loudly, not
// buffer gigabytes).

// NOTE: deliberately NOT unref'd — a paced send is real pending work; the
// process must not exit while a message is still waiting for its slot.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const createSendGuard = ({ messagesPerMinute = 0, perChatDelayMs = 0, jitterRatio = 0.2, maxQueue = 5000 } = {}) => {
    if (messagesPerMinute < 0 || perChatDelayMs < 0) {
        throw new TypeError('createSendGuard: limits must be >= 0');
    }
    const minGlobalGapMs = messagesPerMinute > 0 ? 60_000 / messagesPerMinute : 0;
    /** timestamp the next global slot opens */
    let nextGlobalSlot = 0;
    /** per-jid: timestamp the next per-chat slot opens */
    const nextChatSlot = new Map();
    /** per-jid promise chains so sends to one chat stay FIFO */
    const chains = new Map();
    let pending = 0;

    const jitter = (base) => {
        if (!base || !jitterRatio) return base;
        const spread = base * jitterRatio;
        return base + (Math.random() * 2 - 1) * spread;
    };

    const acquireSlot = async (jid) => {
        // global pacing
        if (minGlobalGapMs > 0) {
            const now = Date.now();
            const wait = Math.max(0, nextGlobalSlot - now);
            nextGlobalSlot = Math.max(now, nextGlobalSlot) + jitter(minGlobalGapMs);
            if (wait > 0) await sleep(wait);
        }
        // per-chat pacing
        if (perChatDelayMs > 0 && jid) {
            const now = Date.now();
            const slot = nextChatSlot.get(jid) ?? 0;
            const wait = Math.max(0, slot - now);
            nextChatSlot.set(jid, Math.max(now, slot) + jitter(perChatDelayMs));
            if (wait > 0) await sleep(wait);
            // opportunistic cleanup — drop expired chat slots so the map
            // doesn't grow one entry per jid forever
            if (nextChatSlot.size > 5_000) {
                const cutoff = Date.now();
                for (const [k, v] of nextChatSlot) {
                    if (v <= cutoff) nextChatSlot.delete(k);
                }
            }
        }
    };

    return {
        /** resolves when this send may proceed; FIFO per chat, fair globally */
        acquire(jid) {
            if (minGlobalGapMs === 0 && perChatDelayMs === 0) {
                return Promise.resolve(); // guard disabled — zero overhead
            }
            if (pending >= maxQueue) {
                return Promise.reject(new Error(`sendGuard queue overflow (${pending} sends already waiting, maxQueue=${maxQueue})`));
            }
            pending++;
            const key = jid || '';
            const prev = chains.get(key) || Promise.resolve();
            const next = prev.catch(() => { }).then(() => acquireSlot(jid));
            chains.set(key, next);
            next.finally(() => {
                pending--;
                if (chains.get(key) === next) {
                    chains.delete(key);
                }
            }).catch(() => { });
            return next;
        },
        /** sends currently waiting for a slot */
        get pending() {
            return pending;
        },
        /** effective settings (for doctor/debug output) */
        get settings() {
            return { messagesPerMinute, perChatDelayMs, jitterRatio, maxQueue };
        }
    };
};
