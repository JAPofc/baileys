/** Message scheduling helpers for @japofc/baileys. */

const DEFAULT_OPTIONS = Object.freeze({
    maxQueue: 1000,
    checkInterval: 1000,
    onSent: () => { },
    onFailed: () => { }
});

const makeId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
const isValidDate = (value) => value instanceof Date && !Number.isNaN(value.getTime());

export class MessageScheduler {
    queue = new Map();
    timer = null;
    sendMessage;
    options;

    constructor(sendMessage, options = {}) {
        if (typeof sendMessage !== 'function') {
            throw new TypeError('MessageScheduler requires a sendMessage function');
        }
        this.sendMessage = sendMessage;
        this.options = { ...DEFAULT_OPTIONS, ...options };
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
        const now = Date.now();
        const due = Array.from(this.queue.entries()).filter(([, scheduled]) => {
            return scheduled.status === 'pending' && scheduled.scheduledTime.getTime() <= now;
        });

        for (const [id, scheduled] of due) {
            if (!this.queue.has(id) || scheduled.status !== 'pending') continue;
            try {
                const message = await this.sendMessage(scheduled.jid, scheduled.content);
                scheduled.messageId = message?.key?.id ?? undefined;
                this.options.onSent(scheduled, message);

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
                this.options.onFailed(scheduled, error);
            }

            this.queue.delete(id);
        }

        if (this.queue.size === 0) this.stopTimer();
    }

    ensureTimerRunning() {
        if (this.timer) return;
        this.timer = setInterval(() => void this.processQueue(), this.options.checkInterval);
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
