/**
 * lib/Framework/Context.js
 * Author: J.AP (@japofc/baileys)
 *
 * Per-message context handed to middleware/command handlers. Wraps a WAMessage
 * with reply / react / session / media helpers so handlers never touch the raw
 * socket. `text` also reads image/video/document captions, and the reply-family
 * throws (rather than silently no-op) when there is no destination JID.
 */
import { MediaManager } from './MediaManager.js';
import { isJidGroup } from '../WABinary/index.js';

export class Context {
    constructor(bot, message) {
        this.bot = bot;
        this.message = message;
    }

    get remoteJid() {
        return this.message.key.remoteJid;
    }

    /** True when this message came from a group chat. */
    get isGroup() {
        return this.remoteJid ? isJidGroup(this.remoteJid) : false;
    }

    /**
     * The individual who sent this message: the group participant in a group,
     * otherwise the chat JID. This is the identity permission gates and
     * cooldowns key off, so it's device-agnostic downstream.
     */
    get sender() {
        return this.message.key.participant || this.message.participant || this.remoteJid;
    }

    /** Did the bot itself send this message? */
    get isFromMe() {
        return !!this.message.key.fromMe;
    }

    /** Sender's display name, when WhatsApp provided one. */
    get pushName() {
        return this.message.pushName || undefined;
    }

    /** JIDs @-mentioned in this message (empty array when none). */
    get mentionedJids() {
        const m = this.message.message;
        const ctxInfo = m?.extendedTextMessage?.contextInfo
            || m?.imageMessage?.contextInfo
            || m?.videoMessage?.contextInfo;
        return ctxInfo?.mentionedJid ? [...ctxInfo.mentionedJid] : [];
    }

    /** Message text — including captions, so a caption-only command still matches. */
    get text() {
        const m = this.message.message;
        return (
            m?.conversation ||
            m?.extendedTextMessage?.text ||
            m?.imageMessage?.caption ||
            m?.videoMessage?.caption ||
            m?.documentMessage?.caption ||
            undefined
        );
    }

    get quoted() {
        return this.message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    }

    session() {
        return this.bot.sessions?.get(this.remoteJid || '');
    }

    setSession(data) {
        this.bot.sessions?.set(this.remoteJid || '', data);
    }

    updateSession(updater) {
        this.bot.sessions?.update(this.remoteJid || '', updater);
    }

    clearSession() {
        this.bot.sessions?.delete(this.remoteJid || '');
    }

    /** Guard that a destination exists before an outbound action. */
    #requireJid(action) {
        if (!this.remoteJid) throw new Error(`Cannot ${action}: remoteJid is undefined`);
        return this.remoteJid;
    }

    async reply(content, options) {
        const jid = this.#requireJid('reply');
        // a plain string must become { text } — spreading a string yields {0:'h',...}
        const normalized = typeof content === 'string' ? { text: content } : content;
        await this.bot.sendMessage(jid, { ...normalized }, { quoted: this.message, ...options });
    }

    async react(emoji) {
        const jid = this.#requireJid('react');
        await this.bot.sendMessage(jid, { react: { text: emoji, key: this.message.key } });
    }

    async replySticker(inputPathOrBuffer, metadata) {
        this.#requireJid('reply');
        const buffer = await MediaManager.convertToSticker(inputPathOrBuffer, metadata);
        await this.reply({ sticker: buffer });
    }

    async replyVoiceNote(inputPathOrBuffer) {
        this.#requireJid('reply');
        const buffer = await MediaManager.convertToVoiceNote(inputPathOrBuffer);
        await this.reply({ audio: buffer, mimetype: 'audio/ogg; codecs=opus', ptt: true });
    }
}
