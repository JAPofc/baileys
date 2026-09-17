import type { Bot } from './Bot.js';
import type { AnyMessageContent, WAMessage } from '../Types/Message.js';

/** Wraps a WAMessage with reply/react/session/media helpers for command handlers. */
export class Context {
    constructor(bot: Bot, message: WAMessage);
    bot: Bot;
    message: WAMessage;
    readonly remoteJid: string | undefined;
    /** Text content, including image/video/document captions. */
    readonly text: string | undefined;
    /** The quoted message content (contextInfo.quotedMessage), if any. */
    readonly quoted: unknown;
    session(): Record<string, unknown>;
    setSession(data: Record<string, unknown>): void;
    updateSession(updater: (prev: Record<string, unknown>) => Record<string, unknown>): void;
    clearSession(): void;
    /** Reply quoting the original message. Throws when remoteJid is missing. */
    reply(content: AnyMessageContent | string, options?: Record<string, unknown>): Promise<void>;
    react(emoji: string): Promise<void>;
    replySticker(inputPathOrBuffer: string | Buffer, metadata?: { packname?: string; author?: string }): Promise<void>;
    replyVoiceNote(inputPathOrBuffer: string | Buffer): Promise<void>;
}
