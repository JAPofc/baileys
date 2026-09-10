import type { Bot } from './Bot.js';

/** Wraps a WAMessage with reply/react/session/media helpers for command handlers. */
export class Context {
    constructor(bot: Bot, message: any);
    bot: Bot;
    message: any;
    readonly remoteJid: string | undefined;
    /** Text content, including image/video/document captions. */
    readonly text: string | undefined;
    readonly quoted: any;
    session(): any;
    setSession(data: any): void;
    updateSession(updater: (prev: any) => any): void;
    clearSession(): void;
    /** Reply quoting the original message. Throws when remoteJid is missing. */
    reply(content: any, options?: any): Promise<void>;
    react(emoji: string): Promise<void>;
    replySticker(inputPathOrBuffer: string | Buffer, metadata?: { packname?: string; author?: string }): Promise<void>;
    replyVoiceNote(inputPathOrBuffer: string | Buffer): Promise<void>;
}
