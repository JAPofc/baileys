/**
 * JAP@Add --- Type declarations for JID helpers.
 */
export declare const getPhoneNumber: (sock: any, jid: string) => Promise<string | null>;
export declare const getLidForPhone: (sock: any, phone: string) => Promise<string | null>;
