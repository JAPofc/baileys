/** Group tools — pure helpers over groupMetadata. */

export declare const getGroupAdmins: (metadata: unknown) => string[];
/** Device-suffix tolerant admin check. */
export declare const isGroupAdmin: (metadata: unknown, jid: string) => boolean;
export declare const getGroupOwner: (metadata: unknown) => string | null;
export declare const getGroupStats: (metadata: unknown) => { total: number; superadmins: number; admins: number; members: number };
export declare const diffParticipants: (
	before: Array<{ id: string; admin?: string | null }>,
	after: Array<{ id: string; admin?: string | null }>
) => { added: string[]; removed: string[]; promoted: string[]; demoted: string[] };
/** Pretty one-liner summary of a diffParticipants() result. */
export declare const formatParticipantChanges: (diff: { added?: string[]; removed?: string[]; promoted?: string[]; demoted?: string[] }) => string;

/** Ready-to-send group info card. */
export declare const formatGroupInfo: (metadata: unknown) => string;
