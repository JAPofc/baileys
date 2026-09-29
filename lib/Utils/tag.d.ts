/**
 * JAP@Add --- Type declarations for tag-all / hide-tag.
 */
export interface TagBuildOptions {
    hide?: boolean;
}
export declare const buildTagContent: (participants: any[], text?: string, opts?: TagBuildOptions) => {
    text: string;
    mentions: string[];
};
export declare const tagAll: (sock: any, jid: string, text?: string, options?: any) => Promise<any>;
export declare const hideTag: (sock: any, jid: string, text?: string, options?: any) => Promise<any>;
