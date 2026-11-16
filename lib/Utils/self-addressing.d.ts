import type { WAMessageKey, WAProto } from '../Types/index.js';
export type WAAddressingMode = 'lid' | 'pn';
export type SelfAddressingIdentity = {
    userJid?: string;
    userLid?: string;
    addressingMode?: string | null;
};
export declare const keyAddressingMode: (key?: Partial<WAMessageKey> & {
    addressingMode?: string | null;
} | null) => WAAddressingMode | undefined;
export declare const selfJidForAddressingMode: (mode: string | null | undefined, identity?: SelfAddressingIdentity) => string | undefined;
export declare const resolveSelfAddressingMode: (opts?: {
    addressingMode?: string | null;
    quoted?: {
        key?: Partial<WAMessageKey> & {
            addressingMode?: string | null;
        };
    } | null;
    jid?: string;
}) => WAAddressingMode | undefined;
export declare const quotedParticipantJid: (quoted?: {
    key?: Partial<WAMessageKey> & {
        addressingMode?: string | null;
    };
    participant?: string | null;
} | WAProto.IWebMessageInfo | null, identity?: SelfAddressingIdentity) => string | undefined;
