/** Keyword/regex auto-reply engine for @japofc/baileys bots. */

import { extractMessageText } from './message-search.js';

const noop = () => { };
const makeId = () => `ar_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
const cooldownKey = (ruleId, jid) => `${ruleId}:${jid}`;

const normalizeOptions = (options = {}) => ({
    globalCooldown: options.globalCooldown ?? 1000,
    simulateTyping: options.simulateTyping ?? false,
    typingDuration: options.typingDuration ?? 1000,
    multiMatch: options.multiMatch ?? false,
    onReply: options.onReply ?? noop,
    onError: options.onError ?? noop
});

const cloneRule = (rule) => ({
    ...rule,
    id: rule.id ?? makeId(),
    active: rule.active ?? true,
    priority: rule.priority ?? 0
});

export class AutoReplyHandler {
    rules = new Map();
    cooldowns = new Map();
    globalCooldown = new Map();
    sendMessage;
    sendPresence;
    options;

    constructor(sendMessage, sendPresence, options = {}) {
        this.sendMessage = sendMessage;
        this.sendPresence = sendPresence;
        this.options = normalizeOptions(options);
    }

    generateId() {
        return makeId();
    }

    addRule(rule) {
        const fullRule = cloneRule(rule);
        if (!fullRule.keywords?.length && !fullRule.pattern && !fullRule.exactMatch) {
            throw new Error('Rule must have keywords, pattern, or exactMatch');
        }
        this.rules.set(fullRule.id, fullRule);
        return fullRule;
    }

    removeRule(id) {
        return this.rules.delete(id);
    }

    getRules() {
        return Array.from(this.rules.values());
    }

    getRule(id) {
        return this.rules.get(id);
    }

    setRuleActive(id, active) {
        const rule = this.rules.get(id);
        if (!rule) return false;
        rule.active = active;
        return true;
    }

    clearRules() {
        this.rules.clear();
    }

    checkCooldown(ruleId, jid) {
        return Date.now() - (this.cooldowns.get(cooldownKey(ruleId, jid)) ?? 0) > 0;
    }

    checkGlobalCooldown(jid) {
        return Date.now() - (this.globalCooldown.get(jid) ?? 0) > this.options.globalCooldown;
    }

    sweepCooldowns() {
        const now = Date.now();
        for (const [key, expiry] of this.cooldowns) {
            if (now - expiry > 0) this.cooldowns.delete(key);
        }
        const maxAge = this.options.globalCooldown;
        for (const [jid, stamp] of this.globalCooldown) {
            if (now - stamp > maxAge) this.globalCooldown.delete(jid);
        }
    }

    setCooldown(ruleId, jid, cooldown) {
        this.cooldowns.set(cooldownKey(ruleId, jid), Date.now() + cooldown);
        if (this.cooldowns.size > 10_000 || this.globalCooldown.size > 10_000) {
            this.sweepCooldowns();
        }
    }

    matchRule(text, rule) {
        if (!rule.active) return null;

        if (typeof rule.exactMatch === 'string' && text.toLowerCase() === rule.exactMatch.toLowerCase()) {
            return [text];
        }

        if (rule.keywords?.length) {
            const lower = text.toLowerCase();
            const keyword = rule.keywords.find((value) => lower.includes(String(value).toLowerCase()));
            if (keyword) return [keyword];
        }

        if (rule.pattern) {
            rule.pattern.lastIndex = 0;
            return text.match(rule.pattern);
        }

        return null;
    }

    isJidAllowed(jid, rule) {
        const isGroup = jid.endsWith('@g.us');
        if (jid.endsWith('@newsletter')) return false;
        if (rule.groupsOnly && !isGroup) return false;
        if (rule.privateOnly && isGroup) return false;
        if (rule.allowedJids?.length && !rule.allowedJids.includes(jid)) return false;
        if (rule.blockedJids?.includes(jid)) return false;
        return true;
    }

    async maybeSimulateTyping(jid) {
        if (!this.options.simulateTyping || !this.sendPresence) return;
        await this.sendPresence(jid, 'composing');
        try {
            await new Promise((resolve) => setTimeout(resolve, this.options.typingDuration));
        }
        finally {
            await this.sendPresence(jid, 'paused');
        }
    }

    async processMessage(message) {
        const text = extractMessageText(message);
        if (!text) return false;

        const jid = message.key?.remoteJid;
        if (!jid || !this.checkGlobalCooldown(jid)) return false;

        const sortedRules = Array.from(this.rules.values())
            .filter((rule) => rule.active)
            .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

        let matched = false;
        for (const rule of sortedRules) {
            if (!this.isJidAllowed(jid, rule)) continue;
            if (rule.cooldown && !this.checkCooldown(rule.id, jid)) continue;

            const match = this.matchRule(text, rule);
            if (!match) continue;

            try {
                const response = typeof rule.response === 'function'
                    ? await rule.response(message, match)
                    : rule.response;

                await this.maybeSimulateTyping(jid);
                await this.sendMessage(jid, response, rule.quoted ? { quoted: message } : undefined);

                this.globalCooldown.set(jid, Date.now());
                if (rule.cooldown) this.setCooldown(rule.id, jid, rule.cooldown);
                this.options.onReply(rule, message, response);

                matched = true;
                if (!this.options.multiMatch) break;
            }
            catch (error) {
                this.options.onError(error, rule, message);
            }
        }

        return matched;
    }
}

export const createAutoReply = (sendMessage, sendPresence, options) => new AutoReplyHandler(sendMessage, sendPresence, options);
