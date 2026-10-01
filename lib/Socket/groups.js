import { Boom } from '@hapi/boom';
import { proto } from '../../WAProto/index.js';
import { WAMessageAddressingMode, WAMessageStubType } from '../Types/index.js';
import { generateMessageIDV2, unixTimestampSeconds } from '../Utils/index.js';
import { getBinaryNodeChild, getBinaryNodeChildren, getBinaryNodeChildString, isLidUser, isPnUser, jidEncode, jidNormalizedUser } from '../WABinary/index.js';
import { makeChatsSocket } from './chats.js';
/**
 * JAP@Fix (§2.38 / v2.4.7) --- `+undefined` is NaN, and WhatsApp omits `s_t` / `creation`
 * / description `t` on plenty of real payloads (freshly created groups, invite-info
 * lookups, trimmed `participating` entries). The old code wrote those NaNs straight into
 * group metadata, where `JSON.stringify` turns them into `null` on the way into any store
 * and every `creation > x` comparison silently evaluates false.
 * @param {string|undefined} value
 * @param {number|undefined} [fallback]
 * @returns {number|undefined}
 */
const toIntOrUndefined = (value, fallback = undefined) => {
    if (value === undefined || value === null || value === '') {
        return fallback;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * JAP@Add (v2.4.7) --- Pull every LID↔PN pair out of already-parsed group/community
 * metadata. WhatsApp hands both addresses for a participant in the same `<participant>`
 * node, so a single metadata fetch is the cheapest and most complete mapping source there
 * is; previously it was thrown away (the `TODO: Store LID MAPPINGS` in this file) and the
 * socket re-discovered the same pairs later through USync round-trips.
 * Pure + null-safe, so it can be used on cached metadata too.
 * @param {{participants?: Array<{id?: string, lid?: string, phoneNumber?: string}>}} metadata
 * @returns {Array<{lid: string, pn: string}>} Deduplicated, device-normalized pairs.
 */
export const extractLIDPNPairs = (metadata) => {
    const pairs = [];
    const seen = new Set();
    for (const participant of metadata?.participants || []) {
        const id = participant?.id;
        if (!id) {
            continue;
        }
        let lid;
        let pn;
        if (isLidUser(id) && isPnUser(participant.phoneNumber)) {
            lid = id;
            pn = participant.phoneNumber;
        }
        else if (isPnUser(id) && isLidUser(participant.lid)) {
            lid = participant.lid;
            pn = id;
        }
        if (!lid || !pn) {
            continue;
        }
        // normalize away any device suffix -- the mapping store is keyed by base user
        const normalizedLid = jidNormalizedUser(lid);
        const normalizedPn = jidNormalizedUser(pn);
        const key = `${normalizedLid}|${normalizedPn}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        pairs.push({ lid: normalizedLid, pn: normalizedPn });
    }
    return pairs;
};

/**
 * JAP@Add (v2.4.7) --- WhatsApp rejects oversized participant arrays on w:g2 writes, so
 * every participant-mutating query is chunked at this size.
 */
export const GROUP_PARTICIPANTS_CHUNK_SIZE = 25;

export const makeGroupsSocket = (config) => {
    const sock = makeChatsSocket(config);
    const { authState, ev, query, upsertMessage, signalRepository, logger } = sock;
    /**
     * JAP@Fix (§2.41 / v2.4.7) --- persist the LID↔PN pairs a metadata fetch already
     * carries. Never allowed to break a metadata call: a mapping-store failure is logged
     * and swallowed, since the caller asked for metadata, not for a mapping write.
     */
    const storeMappingsFromMetadata = async (metadatas) => {
        try {
            const pairs = [];
            const seen = new Set();
            for (const metadata of metadatas) {
                for (const pair of extractLIDPNPairs(metadata)) {
                    const key = `${pair.lid}|${pair.pn}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        pairs.push(pair);
                    }
                }
            }
            if (pairs.length) {
                await signalRepository?.lidMapping?.storeLIDPNMappings(pairs);
            }
            return pairs;
        }
        catch (error) {
            logger?.warn?.({ trace: error?.stack }, 'failed to store LID-PN mappings from group metadata');
            return [];
        }
    };
    const groupQuery = async (jid, type, content) => query({
        tag: 'iq',
        attrs: {
            type,
            xmlns: 'w:g2',
            to: jid
        },
        content
    });
    const groupMetadata = async (jid) => {
        const result = await groupQuery(jid, 'get', [{ tag: 'query', attrs: { request: 'interactive' } }]);
        const metadata = extractGroupMetadata(result);
        await storeMappingsFromMetadata([metadata]);
        return metadata;
    };
    const groupFetchAllParticipating = async () => {
        const result = await query({
            tag: 'iq',
            attrs: {
                to: '@g.us',
                xmlns: 'w:g2',
                type: 'get'
            },
            content: [
                {
                    tag: 'participating',
                    attrs: {},
                    content: [
                        { tag: 'participants', attrs: {} },
                        { tag: 'description', attrs: {} }
                    ]
                }
            ]
        });
        const data = {};
        const groupsChild = getBinaryNodeChild(result, 'groups');
        if (groupsChild) {
            const groups = getBinaryNodeChildren(groupsChild, 'group');
            for (const groupNode of groups) {
                const meta = extractGroupMetadata({
                    tag: 'result',
                    attrs: {},
                    content: [groupNode]
                });
                data[meta.id] = meta;
            }
        }
        // JAP@Fix (§2.41 / v2.4.7): this was the `TODO: properly parse LID / PN DATA`.
        // `participating` returns every group at once, which is the single richest
        // LID↔PN source the client ever sees -- it is now persisted instead of dropped.
        await storeMappingsFromMetadata(Object.values(data));
        sock.ev.emit('groups.update', Object.values(data));
        return data;
    };
    sock.ws.on('CB:ib,,dirty', async (node) => {
        const { attrs } = getBinaryNodeChild(node, 'dirty');
        if (attrs.type !== 'groups') {
            return;
        }
        await groupFetchAllParticipating();
        await sock.cleanDirtyBits('groups');
    });
    return {
        ...sock,
        groupQuery,
        groupMetadata,
        groupCreate: async (subject, participants) => {
            const key = generateMessageIDV2();
            const result = await groupQuery('@g.us', 'set', [
                {
                    tag: 'create',
                    attrs: {
                        subject,
                        key
                    },
                    content: participants.map(jid => ({
                        tag: 'participant',
                        attrs: { jid }
                    }))
                }
            ]);
            return extractGroupMetadata(result);
        },
        groupLeave: async (id) => {
            await groupQuery('@g.us', 'set', [
                {
                    tag: 'leave',
                    attrs: {},
                    content: [{ tag: 'group', attrs: { id } }]
                }
            ]);
        },
        groupUpdateSubject: async (jid, subject) => {
            await groupQuery(jid, 'set', [
                {
                    tag: 'subject',
                    attrs: {},
                    content: Buffer.from(subject, 'utf-8')
                }
            ]);
        },
        groupRequestParticipantsList: async (jid) => {
            const result = await groupQuery(jid, 'get', [
                {
                    tag: 'membership_approval_requests',
                    attrs: {}
                }
            ]);
            const node = getBinaryNodeChild(result, 'membership_approval_requests');
            const participants = getBinaryNodeChildren(node, 'membership_approval_request');
            return participants.map(v => v.attrs);
        },
        // JAP@Upgrade (v2.4.7): approving/rejecting join requests hits the same w:g2
        // participant-array limit that groupParticipantsUpdate was already chunked for
        // (bug 46), but this path sent the whole list in one stanza -- a community with a
        // large approval backlog failed as a single all-or-nothing query. Chunked to match.
        groupRequestParticipantsUpdate: async (jid, participants, action) => {
            const results = [];
            for (let i = 0; i < participants.length; i += GROUP_PARTICIPANTS_CHUNK_SIZE) {
                const chunk = participants.slice(i, i + GROUP_PARTICIPANTS_CHUNK_SIZE);
                const result = await groupQuery(jid, 'set', [
                    {
                        tag: 'membership_requests_action',
                        attrs: {},
                        content: [
                            {
                                tag: action,
                                attrs: {},
                                content: chunk.map(jid => ({
                                    tag: 'participant',
                                    attrs: { jid }
                                }))
                            }
                        ]
                    }
                ]);
                const node = getBinaryNodeChild(result, 'membership_requests_action');
                const nodeAction = getBinaryNodeChild(node, action);
                const participantsAffected = getBinaryNodeChildren(nodeAction, 'participant');
                results.push(...participantsAffected.map(p => ({ status: p.attrs.error || '200', jid: p.attrs.jid })));
            }
            return results;
        },
        groupParticipantsUpdate: async (jid, participants, action) => {
            // JAP@Fix (bug 46): WA rejects large participant arrays — chunk per 25
            const CHUNK_SIZE = GROUP_PARTICIPANTS_CHUNK_SIZE;
            const results = [];
            for (let i = 0; i < participants.length; i += CHUNK_SIZE) {
                const chunk = participants.slice(i, i + CHUNK_SIZE);
                const result = await groupQuery(jid, 'set', [
                    {
                        tag: action,
                        attrs: {},
                        content: chunk.map(jid => ({
                            tag: 'participant',
                            attrs: { jid }
                        }))
                    }
                ]);
                const node = getBinaryNodeChild(result, action);
                const participantsAffected = getBinaryNodeChildren(node, 'participant');
                results.push(...participantsAffected.map(p => ({
                    status: p.attrs.error || '200', jid: p.attrs.jid, content: p
                })));
            }
            return results;
        },
        groupUpdateDescription: async (jid, description) => {
            const metadata = await groupMetadata(jid);
            const prev = metadata.descId ?? null;
            await groupQuery(jid, 'set', [
                {
                    tag: 'description',
                    attrs: {
                        ...(description ? { id: generateMessageIDV2() } : { delete: 'true' }),
                        ...(prev ? { prev } : {})
                    },
                    content: description ? [{ tag: 'body', attrs: {}, content: Buffer.from(description, 'utf-8') }] : undefined
                }
            ]);
        },
        groupInviteCode: async (jid) => {
            const result = await groupQuery(jid, 'get', [{ tag: 'invite', attrs: {} }]);
            const inviteNode = getBinaryNodeChild(result, 'invite');
            return inviteNode?.attrs.code;
        },
        groupRevokeInvite: async (jid) => {
            const result = await groupQuery(jid, 'set', [{ tag: 'invite', attrs: {} }]);
            const inviteNode = getBinaryNodeChild(result, 'invite');
            return inviteNode?.attrs.code;
        },
        groupAcceptInvite: async (code) => {
            const results = await groupQuery('@g.us', 'set', [{ tag: 'invite', attrs: { code } }]);
            const result = getBinaryNodeChild(results, 'group');
            return result?.attrs.jid;
        },
        /**
         * revoke a v4 invite for someone
         * @param groupJid group jid
         * @param invitedJid jid of person you invited
         * @returns true if successful
         */
        groupRevokeInviteV4: async (groupJid, invitedJid) => {
            const result = await groupQuery(groupJid, 'set', [
                { tag: 'revoke', attrs: {}, content: [{ tag: 'participant', attrs: { jid: invitedJid } }] }
            ]);
            return !!result;
        },
        /**
         * accept a GroupInviteMessage
         * @param key the key of the invite message, or optionally only provide the jid of the person who sent the invite
         * @param inviteMessage the message to accept
         */
        groupAcceptInviteV4: ev.createBufferedFunction(async (key, inviteMessage) => {
            key = typeof key === 'string' ? { remoteJid: key } : key;
            const results = await groupQuery(inviteMessage.groupJid, 'set', [
                {
                    tag: 'accept',
                    attrs: {
                        code: inviteMessage.inviteCode,
                        expiration: inviteMessage.inviteExpiration.toString(),
                        admin: key.remoteJid
                    }
                }
            ]);
            // if we have the full message key
            // update the invite message to be expired
            if (key.id) {
                // create new invite message that is expired
                inviteMessage = proto.Message.GroupInviteMessage.fromObject(inviteMessage);
                inviteMessage.inviteExpiration = 0;
                inviteMessage.inviteCode = '';
                ev.emit('messages.update', [
                    {
                        key,
                        update: {
                            message: {
                                groupInviteMessage: inviteMessage
                            }
                        }
                    }
                ]);
            }
            // generate the group add message
            await upsertMessage({
                key: {
                    remoteJid: inviteMessage.groupJid,
                    id: generateMessageIDV2(sock.user?.id),
                    fromMe: false,
                    participant: key.remoteJid
                },
                messageStubType: WAMessageStubType.GROUP_PARTICIPANT_ADD,
                messageStubParameters: [JSON.stringify(authState.creds.me)],
                participant: key.remoteJid,
                messageTimestamp: unixTimestampSeconds()
            }, 'notify');
            return results.attrs.from;
        }),
        groupGetInviteInfo: async (code) => {
            const results = await groupQuery('@g.us', 'get', [{ tag: 'invite', attrs: { code } }]);
            return extractGroupMetadata(results);
        },
        groupToggleEphemeral: async (jid, ephemeralExpiration) => {
            const content = ephemeralExpiration
                ? { tag: 'ephemeral', attrs: { expiration: ephemeralExpiration.toString() } }
                : { tag: 'not_ephemeral', attrs: {} };
            await groupQuery(jid, 'set', [content]);
        },
        groupSettingUpdate: async (jid, setting) => {
            await groupQuery(jid, 'set', [{ tag: setting, attrs: {} }]);
        },
        groupMemberAddMode: async (jid, mode) => {
            await groupQuery(jid, 'set', [{ tag: 'member_add_mode', attrs: {}, content: mode }]);
        },
        groupJoinApprovalMode: async (jid, mode) => {
            await groupQuery(jid, 'set', [
                { tag: 'membership_approval_mode', attrs: {}, content: [{ tag: 'group_join', attrs: { state: mode } }] }
            ]);
        },
        groupFetchAllParticipating
    };
};
export const extractGroupMetadata = (result) => {
    const group = getBinaryNodeChild(result, 'group');
    if (!group) {
        // Mirror WAWeb: surface server/client errors with their code+text instead of crashing.
        const errorNode = getBinaryNodeChild(result, 'error');
        if (errorNode) {
            const code = errorNode.attrs.code ? +errorNode.attrs.code : 500;
            const text = errorNode.attrs.text || 'group metadata query failed';
            throw new Boom(text, { statusCode: code, data: errorNode });
        }
        throw new Boom('Invalid group metadata response: missing <group> node', { data: result });
    }
    if (!group.attrs.id) {
        throw new Boom('Invalid group metadata response: missing group id', { data: group });
    }
    const descChild = getBinaryNodeChild(group, 'description');
    let desc;
    let descId;
    let descOwner;
    let descOwnerPn;
    let descOwnerUsername;
    let descTime;
    if (descChild) {
        desc = getBinaryNodeChildString(descChild, 'body');
        descOwner = descChild.attrs.participant ? jidNormalizedUser(descChild.attrs.participant) : undefined;
        descOwnerPn = descChild.attrs.participant_pn ? jidNormalizedUser(descChild.attrs.participant_pn) : undefined;
        descOwnerUsername = descChild.attrs.participant_username || undefined;
        descTime = toIntOrUndefined(descChild.attrs.t);
        descId = descChild.attrs.id;
    }
    const groupId = group.attrs.id.includes('@') ? group.attrs.id : jidEncode(group.attrs.id, 'g.us');
    const eph = getBinaryNodeChild(group, 'ephemeral')?.attrs.expiration;
    const memberAddMode = getBinaryNodeChildString(group, 'member_add_mode') === 'all_member_add';
    const metadata = {
        id: groupId,
        notify: group.attrs.notify,
        addressingMode: group.attrs.addressing_mode === 'lid' ? WAMessageAddressingMode.LID : WAMessageAddressingMode.PN,
        subject: group.attrs.subject,
        subjectOwner: group.attrs.s_o,
        subjectOwnerPn: group.attrs.s_o_pn,
        subjectOwnerUsername: group.attrs.s_o_username,
        subjectTime: toIntOrUndefined(group.attrs.s_t),
        size: toIntOrUndefined(group.attrs.size, getBinaryNodeChildren(group, 'participant').length),
        creation: toIntOrUndefined(group.attrs.creation),
        owner: group.attrs.creator ? jidNormalizedUser(group.attrs.creator) : undefined,
        ownerPn: group.attrs.creator_pn ? jidNormalizedUser(group.attrs.creator_pn) : undefined,
        ownerUsername: group.attrs.creator_username || undefined,
        owner_country_code: group.attrs.creator_country_code,
        desc,
        descId,
        descOwner,
        descOwnerPn,
        descOwnerUsername,
        descTime,
        linkedParent: getBinaryNodeChild(group, 'linked_parent')?.attrs.jid || undefined,
        restrict: !!getBinaryNodeChild(group, 'locked'),
        announce: !!getBinaryNodeChild(group, 'announcement'),
        isCommunity: !!getBinaryNodeChild(group, 'parent'),
        isCommunityAnnounce: !!getBinaryNodeChild(group, 'default_sub_group'),
        joinApprovalMode: !!getBinaryNodeChild(group, 'membership_approval_mode'),
        memberAddMode,
        // JAP@Fix (§2.41 / v2.4.7): the `TODO: Store LID MAPPINGS` here is now handled by
        // extractLIDPNPairs() + the socket's storeMappingsFromMetadata(); this stays a pure
        // parser so it can keep being used on cached/offline payloads.
        participants: getBinaryNodeChildren(group, 'participant').map(({ attrs }) => {
            return {
                id: attrs.jid,
                phoneNumber: isLidUser(attrs.jid) && isPnUser(attrs.phone_number) ? attrs.phone_number : undefined,
                lid: isPnUser(attrs.jid) && isLidUser(attrs.lid) ? attrs.lid : undefined,
                username: attrs.participant_username || attrs.username || undefined,
                admin: (attrs.type || null)
            };
        }),
        ephemeralDuration: toIntOrUndefined(eph)
    };
    return metadata;
};
