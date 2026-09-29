/** Group events tracker — join/leave/promote/demote callbacks + event log. */

export type GroupParticipantsAction = 'add' | 'remove' | 'promote' | 'demote' | 'modify';

export interface GroupParticipantsEvent {
	type: 'participants';
	id: string;
	action: GroupParticipantsAction | string;
	participants: string[];
	author?: string;
	at: number;
}

export interface GroupUpdateEvent {
	type: 'update';
	id: string;
	update: Record<string, unknown>;
	at: number;
}

export type GroupEvent = GroupParticipantsEvent | GroupUpdateEvent;

export interface GroupEventsTrackerOptions {
	/** Max events kept in the log (LRU). Default 500. */
	maxEvents?: number;
}

export interface GroupEventsTracker {
	participantsHandler(update: unknown): void;
	groupsHandler(updates: unknown[]): void;
	bind(sock: unknown): () => void;
	unbind(): void;
	onJoin(cb: (event: GroupParticipantsEvent) => void): () => void;
	onLeave(cb: (event: GroupParticipantsEvent) => void): () => void;
	onPromote(cb: (event: GroupParticipantsEvent) => void): () => void;
	onDemote(cb: (event: GroupParticipantsEvent) => void): () => void;
	onModify(cb: (event: GroupParticipantsEvent) => void): () => void;
	onGroupUpdate(cb: (event: GroupUpdateEvent) => void): () => void;
	onAny(cb: (event: GroupEvent) => void): () => void;
	getEvents(groupJid?: string): GroupEvent[];
	readonly size: number;
	clear(): void;
}

export declare const createGroupEventsTracker: (options?: GroupEventsTrackerOptions) => GroupEventsTracker;
