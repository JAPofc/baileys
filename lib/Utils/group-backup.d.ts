/** Group backup — snapshot, diff and restore group settings. */

export interface GroupBackup {
	type: 'jap-group-backup';
	version: number;
	takenAt: number;
	id: string;
	subject: string;
	description: string;
	owner?: string;
	announce: boolean;
	restrict: boolean;
	joinApprovalMode: boolean;
	memberAddMode?: unknown;
	ephemeralDuration: number;
	size: number;
	participants: Array<{ id: string; admin: string | null }>;
}

export declare const backupGroup: (sock: unknown, groupJid: string) => Promise<GroupBackup>;

export interface GroupBackupDiff {
	joined: string[];
	left: string[];
	promoted: string[];
	demoted: string[];
	/** Changed setting fields: subject, description, announce, … */
	changed: string[];
	before: GroupBackup;
	after: GroupBackup;
}

export declare const diffGroupBackup: (sock: unknown, backup: GroupBackup, groupJid?: string) => Promise<GroupBackupDiff>;

export declare const restoreGroupSettings: (
	sock: unknown,
	backup: GroupBackup,
	groupJid?: string
) => Promise<{ applied: string[]; errors: Array<{ step: string; error: unknown }> }>;
