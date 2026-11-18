/** A participant as carried by `messageStubParameters`, in any of its shapes. */
export interface StubParticipant {
    lid?: string;
    pn?: string;
    phoneNumber?: string;
    id?: string;
    jid?: string;
    [key: string]: any;
}

/**
 * Normalise one `messageStubParameters` entry: JSON object, plain jid, bare number or an
 * already-parsed object. Never throws — an unparsable string becomes `{ phoneNumber }`.
 */
export declare function parseStubParticipant(value: string | StubParticipant | null | undefined): StubParticipant | null | undefined;

/** Every jid a stub participant can be addressed by (`lid`, `pn`, `phoneNumber`, `id`, `jid`). */
export declare function stubParticipantIdentities(participant: string | StubParticipant | null | undefined): string[];

/**
 * Whether any stub participant matches one of the given jids, checking every identity it
 * carries rather than the phone number alone (BUGREPORT §2.60).
 */
export declare function stubParticipantsInclude(participants: Array<string | StubParticipant> | null | undefined, ...jids: Array<string | null | undefined>): boolean;
