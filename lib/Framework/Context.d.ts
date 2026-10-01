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
    /** True when the message came from a group chat. */
    readonly isGroup: boolean;
    /** Individual sender (group participant, else the chat JID). */
    readonly sender: string | undefined;
    /** Whether the bot itself sent this message. */
    readonly isFromMe: boolean;
    /** Sender's WhatsApp display name, when provided. */
    readonly pushName: string | undefined;
    /** JIDs @-mentioned in the message (empty when none). */
    readonly mentionedJids: string[];
    /** The quoted message content (contextInfo.quotedMessage), if any. */
    readonly quoted: unknown;
    /** Command word matched by CommandRouter (set during dispatch). */
    command?: string;
    /** Prefix that triggered the command (set during dispatch). */
    prefix?: string;
    /** Positional arguments after the command (set during dispatch). */
    args?: string[];
    /** Raw argument string after the command (set during dispatch). */
    argString?: string;
    /** Parsed flags/options (set during dispatch). */
    flags?: Record<string, string | boolean | Array<string | boolean>>;
    /** The matched command definition (set during dispatch). */
    matchedCommand?: import('./CommandRouter.js').CommandDefinition;
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
