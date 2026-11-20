/** Chat control utilities for @japofc/baileys. */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Standard disappearing-message duration constants, in seconds. */
export const DISAPPEARING_DURATIONS = Object.freeze({
    OFF: 0,
    HOURS_24: 86400,
    DAYS_7: 604800,
    DAYS_90: 7776000
});

export class TypingIndicator {
    constructor(sendPresence) {
        if (typeof sendPresence !== 'function') throw new TypeError('TypingIndicator requires a sendPresence function');
        this.sendPresence = sendPresence;
        this.timers = new Map();
        this.activeJids = new Set();
    }

    async startTyping(jid, options = {}) {
        await this.setPresence(jid, 'composing', options);
    }

    async startRecording(jid, options = {}) {
        await this.setPresence(jid, 'recording', options);
    }

    async setPresence(jid, presence, options) {
        this.clearTimer(jid);
        this.activeJids.add(jid);
        await this.sendPresence(jid, presence);

        if (options.autoPause !== false && options.duration) {
            const timer = setTimeout(() => void this.stopTyping(jid), options.duration);
            timer?.unref?.();
            this.timers.set(jid, timer);
        }
    }

    async stopTyping(jid) {
        this.clearTimer(jid);
        this.activeJids.delete(jid);
        try {
            await this.sendPresence(jid, 'paused');
        }
        catch {
            // Presence stop is best-effort; a socket may already be closed.
        }
    }

    async stopAll() {
        const jids = Array.from(this.activeJids);
        await Promise.all(jids.map((jid) => this.stopTyping(jid)));
    }

    async simulateTyping(jid, durationMs, callback) {
        await this.startTyping(jid);
        try {
            await sleep(durationMs);
            return await callback();
        }
        finally {
            await this.stopTyping(jid);
        }
    }

    clearTimer(jid) {
        const timer = this.timers.get(jid);
        if (!timer) return;
        clearTimeout(timer);
        this.timers.delete(jid);
    }
}

export const createTypingIndicator = (sendPresence) => new TypingIndicator(sendPresence);

export class PinnedMessagesManager {
    constructor() {
        this.store = new Map();
    }

    pin(jid, messageId, pinnedBy, expiresAt) {
        const entry = { messageId, jid, pinnedAt: new Date(), pinnedBy, expiresAt };
        const pins = (this.store.get(jid) ?? []).filter((pin) => pin.messageId !== messageId);
        pins.push(entry);
        this.store.set(jid, pins);
        return entry;
    }

    unpin(jid, messageId) {
        const pins = this.store.get(jid);
        if (!pins) return false;
        const next = pins.filter((pin) => pin.messageId !== messageId);
        if (next.length === pins.length) return false;
        if (next.length) this.store.set(jid, next);
        else this.store.delete(jid);
        return true;
    }

    getPinned(jid) {
        return this.store.get(jid) ?? [];
    }

    isPinned(jid, messageId) {
        return this.getPinned(jid).some((pin) => pin.messageId === messageId);
    }

    clearPins(jid) {
        this.store.delete(jid);
    }

    clearExpired() {
        const now = Date.now();
        let removed = 0;

        for (const [jid, pins] of this.store) {
            const active = pins.filter((pin) => !pin.expiresAt || pin.expiresAt.getTime() > now);
            removed += pins.length - active.length;
            if (active.length) this.store.set(jid, active);
            else this.store.delete(jid);
        }

        return removed;
    }

    get totalPins() {
        let total = 0;
        for (const pins of this.store.values()) total += pins.length;
        return total;
    }
}

export const createPinnedMessagesManager = () => new PinnedMessagesManager();

export const createReadReceiptController = (sendReadReceipt, config = {}) => {
    if (typeof sendReadReceipt !== 'function') throw new TypeError('createReadReceiptController requires a sendReadReceipt function');

    let currentConfig = {
        enabled: config.enabled ?? true,
        excludeJids: [...(config.excludeJids ?? [])],
        readDelay: config.readDelay ?? 0
    };

    const shouldSkip = (jid) => !currentConfig.enabled || currentConfig.excludeJids.includes(jid);

    return {
        setConfig(newConfig) {
            currentConfig = {
                ...currentConfig,
                ...newConfig,
                excludeJids: newConfig.excludeJids ? [...newConfig.excludeJids] : currentConfig.excludeJids
            };
        },
        getConfig() {
            return { ...currentConfig, excludeJids: [...currentConfig.excludeJids] };
        },
        enable() {
            currentConfig.enabled = true;
        },
        disable() {
            currentConfig.enabled = false;
        },
        isEnabled() {
            return currentConfig.enabled;
        },
        async markRead(jid, participant, messageIds) {
            if (shouldSkip(jid)) return;
            if (currentConfig.readDelay > 0) await sleep(currentConfig.readDelay);
            await sendReadReceipt(jid, participant, messageIds);
        },
        async forceMarkRead(jid, participant, messageIds) {
            await sendReadReceipt(jid, participant, messageIds);
        }
    };
};
