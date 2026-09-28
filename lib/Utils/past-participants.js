/** Helpers for WhatsApp history-sync past participant payloads. */

import { proto } from '../../WAProto/index.js';

const LeaveReason = proto.PastParticipant?.LeaveReason ?? {};

const mapLeaveReason = (reason) => {
    if (reason === LeaveReason.LEFT || reason === 'LEFT' || reason === 'left') return 'left';
    if (reason === LeaveReason.REMOVED || reason === 'REMOVED' || reason === 'removed') return 'removed';
    return undefined;
};

/** Process proto.IPastParticipants[] into a structured list per group. */
export const processPastParticipants = (pastParticipantsList = []) => {
    if (!Array.isArray(pastParticipantsList)) return [];

    return pastParticipantsList.map((entry) => ({
        groupJid: entry?.groupJid ?? '',
        participants: Array.isArray(entry?.pastParticipants)
            ? entry.pastParticipants.map((participant) => ({
                jid: participant?.userJid ?? '',
                leaveTs: participant?.leaveTs !== undefined && participant?.leaveTs !== null ? Number(participant.leaveTs) : undefined,
                leaveReason: mapLeaveReason(participant?.leaveReason)
            }))
            : []
    }));
};

/** Check whether an event carries non-empty past participant data. */
export const hasPastParticipants = (event) => Array.isArray(event?.pastParticipants) && event.pastParticipants.length > 0;
