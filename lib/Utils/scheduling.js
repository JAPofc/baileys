/** Message scheduling helpers for @japofc/baileys. */
import { mintId } from './provenance.js';

const DEFAULT_OPTIONS = Object.freeze({
    maxQueue: 1000,
    checkInterval: 1000,
    onSent: () => { },
    onFailed: () => { },
    // last-resort sink for an error thrown BY one of the callbacks above (§2.197).
    // Defaults to a warning rather than silence -- losing it entirely is how the original
    // crash would have been replaced by a mystery.
    onError: (err) => console.warn('[MessageScheduler] callback threw:', err)
});

// JAP@Fix ids come from the shared minter: crypto-grade entropy instead of Math.random(),
// and every id carries the build tag (see docs/provenance.md).
const makeId = (prefix) => mintId(prefix === 'sched' ? 'SCHD' : prefix);
const isValidDate = (value) => value instanceof Date && !Number.isNaN(value.getTime());

export class MessageScheduler {
    queue = new Map();
    timer = null;
    processing = false;
    sendMessage;
    options;

    constructor(sendMessage, options = {}) {
        if (typeof sendMessage !== 'function') {
            throw new TypeError('MessageScheduler requires a sendMessage function');
        }
        this.sendMessage = sendMessage;
        this.options = { ...DEFAULT_OPTIONS, ...options };
    }

    /** Call a user callback without letting it alter -- or crash -- the run (§2.197/§2.200). */
    #notify(name, ...args) {
        try {
            this.options[name]?.(...args);
        }
        catch (err) {
            try {
                this.options.onError?.(err);
            }
            catch { /* a throwing onError is where reporting stops */ }
        }
    }

    generateId() {
        return makeId('sched');
    }

    schedule(jid, content, scheduledTime, repeatOptions) {
        if (!jid) throw new Error('jid is required');
        if (!isValidDate(scheduledTime)) throw new Error('Scheduled time must be a valid Date');
        if (scheduledTime.getTime() <= Date.now()) throw new Error('Scheduled time must be in the future');
        if (this.queue.size >= this.options.maxQueue) {
            throw new Error(`Maximum queue size (${this.options.maxQueue}) reached`);
        }

        const scheduled = {
            id: this.generateId(),
            jid,
            content,
            scheduledTime,
            createdAt: new Date(),
            status: 'pending',
            repeatIntervalMs: repeatOptions?.repeatIntervalMs,
            maxRepeats: repeatOptions?.maxRepeats,
            repeatCount: 0
        };

        this.queue.set(scheduled.id, scheduled);
        this.ensureTimerRunning();
        return scheduled;
    }

    scheduleDelay(jid, content, delayMs, repeatOptions) {
        return this.schedule(jid, content, new Date(Date.now() + delayMs), repeatOptions);
    }

    cancel(id) {
        const scheduled = this.queue.get(id);
        if (scheduled?.status !== 'pending') return false;
        scheduled.status = 'cancelled';
        this.queue.delete(id);
        if (this.queue.size === 0) this.stopTimer();
        return true;
    }

    cancelForJid(jid) {
        let count = 0;
        for (const [id, scheduled] of this.queue) {
            if (scheduled.jid !== jid || scheduled.status !== 'pending') continue;
            scheduled.status = 'cancelled';
            this.queue.delete(id);
            count++;
        }
        if (this.queue.size === 0) this.stopTimer();
        return count;
    }

    getPending() {
        return Array.from(this.queue.values()).filter((scheduled) => scheduled.status === 'pending');
    }

    get(id) {
        return this.queue.get(id);
    }

    clearAll() {
        const count = this.queue.size;
        this.queue.clear();
        this.stopTimer();
        return count;
    }

    async processQueue() {
        // JAP@Fix (bug): the timer fires processQueue() every `checkInterval`
        // WITHOUT awaiting the previous run. When a send is slower than the
        // interval, overlapping runs re-scan the queue and see the same item
        // still marked 'pending' (its status isn't updated until the await
        // resolves) — sending ONE scheduled message multiple times. A single
        // re-entrancy guard serializes runs, and each due item is flipped to an
        // in-flight status BEFORE the await so it can never be picked twice.
        if (this.processing) return;
        this.processing = true;
        try {
            const now = Date.now();
            const due = Array.from(this.queue.entries()).filter(([, scheduled]) => {
                return scheduled.status === 'pending' && scheduled.scheduledTime.getTime() <= now;
            });

            for (const [id, scheduled] of due) {
                if (!this.queue.has(id) || scheduled.status !== 'pending') continue;
                scheduled.status = 'sending'; // claim it before the await
                try {
                    const message = await this.sendMessage(scheduled.jid, scheduled.content);
                    scheduled.messageId = message?.key?.id ?? undefined;
                    // JAP@Fix (§2.200): onSent() was called INSIDE the send's try block, so a
                    // callback that threw -- a logging or database hiccup, nothing to do with
                    // WhatsApp -- landed in the catch below, flipped the item to 'failed' and
                    // invoked onFailed(). The message had already been delivered, so anyone
                    // retrying on onFailed sent it twice. A reporting callback must not be
                    // able to change the outcome it is reporting.
                    this.#notify('onSent', scheduled, message);

                    if (scheduled.repeatIntervalMs && scheduled.repeatIntervalMs > 0) {
                        const nextCount = (scheduled.repeatCount ?? 0) + 1;
                        if (scheduled.maxRepeats === undefined || nextCount < scheduled.maxRepeats) {
                            scheduled.repeatCount = nextCount;
                            scheduled.scheduledTime = new Date(Date.now() + scheduled.repeatIntervalMs);
                            scheduled.status = 'pending';
                            continue;
                        }
                    }

                    scheduled.status = 'sent';
                }
                catch (error) {
                    scheduled.status = 'failed';
                    scheduled.error = error?.message || String(error);
                    this.#notify('onFailed', scheduled, error);
                }

                this.queue.delete(id);
            }
        }
        finally {
            this.processing = false;
        }

        if (this.queue.size === 0) this.stopTimer();
    }

    ensureTimerRunning() {
        if (this.timer) return;
        // JAP@Fix (§2.197): a throwing onSent/onFailed callback -- user code, so entirely
        // possible -- escaped processQueue() as an unhandled rejection from this timer and
        // took the process down. The scheduler itself recovered (`processing` is reset in a
        // finally), so the crash looked unrelated to scheduling.
        this.timer = setInterval(() => {
            this.processQueue().catch(err => {
                this.options.onError?.(err);
            });
        }, this.options.checkInterval);
        this.timer?.unref?.();
    }

    stopTimer() {
        if (!this.timer) return;
        clearInterval(this.timer);
        this.timer = null;
    }

    stop() {
        this.stopTimer();
    }

    start() {
        if (this.queue.size > 0) this.ensureTimerRunning();
    }
}

export const createMessageScheduler = (sendMessage, options) => new MessageScheduler(sendMessage, options);
