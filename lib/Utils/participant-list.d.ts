import type { GroupParticipant } from '../Types/index.js';

/** A participant-shaped object: matched by `id` or `phoneNumber`. */
export type ParticipantLike = Partial<GroupParticipant> & { id?: string; phoneNumber?: string | null };

/**
 * Add participants, merging into the existing entry when the person is already listed
 * under either identity (so a replayed `add` cannot duplicate a member). Order-preserving
 * and non-mutating. See BUGREPORT §2.52.
 */
export declare function upsertParticipants<T extends ParticipantLike>(participants: T[] | null | undefined, incoming: ParticipantLike[] | null | undefined): T[];

/** Remove participants matched by `id` or `phoneNumber`. Order-preserving, non-mutating. */
export declare function removeParticipants<T extends ParticipantLike>(participants: T[] | null | undefined, outgoing: ParticipantLike[] | null | undefined): T[];

/**
 * Set the admin rank of the matched participants. Uses `null` for "not an admin" — never
 * boolean `false` — and leaves a `superadmin` untouched when promoting to `admin`.
 */
export declare function setParticipantsAdmin<T extends ParticipantLike>(participants: T[] | null | undefined, targets: ParticipantLike[] | null | undefined, admin: 'admin' | 'superadmin' | null): T[];
