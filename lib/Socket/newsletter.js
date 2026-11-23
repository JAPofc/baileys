import { Boom } from '@hapi/boom';
import { proto } from '../../WAProto/index.js';
import { QueryIds, XWAPaths } from '../Types/index.js';
import { generateProfilePicture } from '../Utils/messages-media.js';
import { getBinaryNodeChild, getBinaryNodeChildren, S_WHATSAPP_NET } from '../WABinary/index.js';
import { makeGroupsSocket } from './groups.js';
import { executeWMexQuery as genericExecuteWMexQuery } from './mex.js';
/**
 * JAP@Fix (§2.114): this used to read `thread.name.text`, `thread.description.text` and
 * `viewer.mute` straight off the response. A channel created without a description comes back
 * with no `description` object at all (and `viewer_metadata` is absent until the first fetch),
 * so the parser threw `Cannot read properties of undefined` *after the channel had already
 * been created on the server* -- the caller got an exception instead of the new channel's id,
 * with no way to learn it other than re-listing. Everything is optional now, and the numbers
 * stay `undefined` rather than becoming `NaN`.
 */
const NEWSLETTER_ACTIONS = {
    FOLLOW: { queryId: 'FOLLOW', path: 'xwa2_newsletter_join_v2' },
    UNFOLLOW: { queryId: 'UNFOLLOW', path: 'xwa2_newsletter_leave_v2' },
    MUTE: { queryId: 'MUTE', path: 'xwa2_newsletter_mute_v2' },
    UNMUTE: { queryId: 'UNMUTE', path: 'xwa2_newsletter_unmute_v2' }
};
const NEWSLETTER_REACTION_MODES = ['ALL', 'BASIC', 'NONE'];
const asInt = (value) => {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
};
const parseNewsletterCreateResponse = (response) => {
    if (!response || typeof response !== 'object') {
        return null;
    }
    const { id, thread_metadata: thread = {}, viewer_metadata: viewer } = response;
    return {
        id: id,
        owner: undefined,
        name: thread.name?.text ?? thread.name ?? undefined,
        creation_time: asInt(thread.creation_time),
        description: thread.description?.text ?? thread.description ?? undefined,
        invite: thread.invite,
        subscribers: asInt(thread.subscribers_count),
        verification: thread.verification,
        picture: {
            id: thread.picture?.id,
            directPath: thread.picture?.direct_path
        },
        mute_state: viewer?.mute
    };
};
const parseNewsletterMetadata = (result) => {
    if (typeof result !== 'object' || result === null) {
        return null;
    }
    if ('id' in result && typeof result.id === 'string') {
        return result;
    }
    if ('result' in result && typeof result.result === 'object' && result.result !== null && 'id' in result.result) {
        return result.result;
    }
    return null;
};
export const makeNewsletterSocket = (config) => {
    const sock = makeGroupsSocket(config);
    const { query, generateMessageTag } = sock;
    const executeWMexQuery = (variables, queryId, dataPath) => {
        return genericExecuteWMexQuery(variables, queryId, dataPath, query, generateMessageTag);
    };
    /**
     * JAP@Fix (§2.219): `settings` was hardcoded to null, which is right for name/description/
     * picture edits but makes any settings-level mutation unsendable. Callers may now pass a
     * `settings` object explicitly; omitting it keeps the previous null, so every existing
     * call behaves exactly as before.
     */
    const newsletterUpdate = async (jid, updates) => {
        const { settings = null, ...rest } = updates || {};
        const variables = {
            newsletter_id: jid,
            updates: {
                ...rest,
                settings
            }
        };
        return executeWMexQuery(variables, QueryIds.UPDATE_METADATA, 'xwa2_newsletter_update');
    };
    return {
        ...sock,
        executeWMexQuery,
        newsletterCreate: async (name, description) => {
            const variables = {
                input: {
                    name,
                    description: description ?? null
                }
            };
            const rawResponse = await executeWMexQuery(variables, QueryIds.CREATE, XWAPaths.xwa2_newsletter_create);
            return parseNewsletterCreateResponse(rawResponse);
        },
        newsletterUpdate,
        newsletterSubscribers: async (jid) => {
            return executeWMexQuery({ newsletter_id: jid }, QueryIds.SUBSCRIBERS, XWAPaths.xwa2_newsletter_subscribers);
        },
        // JAP@Changes 29-01-26 --- Add newsletterSubscribed to fetch all subscribed newsletters (similar to groupFetchAllParticipating (⁠ ⁠╹⁠▽⁠╹⁠ ⁠))
        newsletterSubscribed: async () => {
            return executeWMexQuery({}, QueryIds.SUBSCRIBED, XWAPaths.xwa2_newsletter_subscribed);
        },
        newsletterMetadata: async (type, key) => {
            const variables = {
                fetch_creation_time: true,
                fetch_full_image: true,
                fetch_viewer_metadata: true,
                input: {
                    key,
                    type: type.toUpperCase()
                }
            };
            const result = await executeWMexQuery(variables, QueryIds.METADATA, XWAPaths.xwa2_newsletter_metadata);
            return parseNewsletterMetadata(result);
        },
        newsletterFollow: (jid) => {
            return executeWMexQuery({ newsletter_id: jid }, QueryIds.FOLLOW, XWAPaths.xwa2_newsletter_join_v2);
        },
        newsletterUnfollow: (jid) => {
            return executeWMexQuery({ newsletter_id: jid }, QueryIds.UNFOLLOW, XWAPaths.xwa2_newsletter_leave_v2);
        },
        newsletterMute: (jid) => {
            return executeWMexQuery({ newsletter_id: jid }, QueryIds.MUTE, XWAPaths.xwa2_newsletter_mute_v2);
        },
        newsletterUnmute: (jid) => {
            return executeWMexQuery({ newsletter_id: jid }, QueryIds.UNMUTE, XWAPaths.xwa2_newsletter_unmute_v2);
        },
        newsletterUpdateName: async (jid, name) => {
            return await newsletterUpdate(jid, { name });
        },
        newsletterUpdateDescription: async (jid, description) => {
            return await newsletterUpdate(jid, { description });
        },
        newsletterUpdatePicture: async (jid, content) => {
            const { img } = await generateProfilePicture(content);
            return await newsletterUpdate(jid, { picture: img.toString('base64') });
        },
        newsletterRemovePicture: async (jid) => {
            return await newsletterUpdate(jid, { picture: '' });
        },
        // JAP@Add: channel management (live mex queries)
        newsletterDelete: async (jid) => {
            if (!jid) {
                throw new Error('newsletterDelete needs a channel JID');
            }
            return executeWMexQuery({ newsletter_id: jid }, QueryIds.DELETE, XWAPaths.xwa2_newsletter_delete_v2);
        },
        newsletterAdminCount: async (jid) => {
            if (!jid) {
                throw new Error('newsletterAdminCount needs a channel JID');
            }
            return executeWMexQuery({ newsletter_id: jid }, QueryIds.ADMIN_COUNT, XWAPaths.xwa2_newsletter_admin_count);
        },
        // JAP@Add: EXPERIMENTAL — demote/promote variable shape is best-effort
        newsletterDemoteAdmin: async (jid, userJid) => {
            if (!jid || !userJid) {
                throw new Error('newsletterDemoteAdmin needs (channelJid, userJid)');
            }
            return executeWMexQuery({ newsletter_id: jid, user_id: userJid }, QueryIds.DEMOTE, XWAPaths.xwa2_newsletter_demote);
        },
        newsletterChangeOwner: async (jid, userJid) => {
            if (!jid || !userJid) {
                throw new Error('newsletterChangeOwner needs (channelJid, newOwnerJid)');
            }
            return executeWMexQuery({ newsletter_id: jid, user_id: userJid }, QueryIds.CHANGE_OWNER, XWAPaths.xwa2_newsletter_change_owner);
        },
        // JAP@Add: join a channel via invite code (metadata lookup + follow)
        newsletterJoinInvite: async (code) => {
            if (!code) {
                throw new Error('newsletterJoinInvite needs an invite code');
            }
            const variables = {
                fetch_creation_time: true,
                fetch_full_image: true,
                fetch_viewer_metadata: true,
                input: { key: code, type: 'INVITE' }
            };
            const meta = parseNewsletterMetadata(await executeWMexQuery(variables, QueryIds.METADATA, XWAPaths.xwa2_newsletter_metadata));
            if (!meta?.id) {
                throw new Error('newsletterJoinInvite: invite code not found');
            }
            await executeWMexQuery({ newsletter_id: meta.id }, QueryIds.FOLLOW, XWAPaths.xwa2_newsletter_join_v2);
            return meta;
        },
        newsletterReactMessage: async (jid, serverId, reaction) => {
            await query({
                tag: 'message',
                attrs: {
                    to: jid,
                    ...(reaction ? {} : { edit: '7' }),
                    type: 'reaction',
                    server_id: serverId,
                    id: generateMessageTag()
                },
                content: [
                    {
                        tag: 'reaction',
                        attrs: reaction ? { code: reaction } : {}
                    }
                ]
            });
        },
        newsletterFetchMessages: async (jid, count, since, after) => {
            // JAP@Fix (bug 61): request shape updated to match current WA protocol —
            // WA moved this from a global `messages` query (to: s.whatsapp.net, type/key based)
            // to a per-newsletter `message_updates` query (to: jid, since/after based).
            // The old shape is rejected by current WA servers.
            const messageUpdateAttrs = {
                count: count.toString()
            };
            if (typeof since === 'number') {
                messageUpdateAttrs.since = since.toString();
            }
            if (after) {
                messageUpdateAttrs.after = after.toString();
            }
            const result = await query({
                tag: 'iq',
                attrs: {
                    id: generateMessageTag(),
                    type: 'get',
                    xmlns: 'newsletter',
                    to: jid
                },
                content: [
                    {
                        tag: 'message_updates',
                        attrs: messageUpdateAttrs
                    }
                ]
            });
            // Response wrapper tag name isn't fully confirmed post-migration, so we check
            // both the legacy 'messages' wrapper and the new 'message_updates' node itself
            // to stay compatible either way, then decode identically to before.
            const messagesNode = getBinaryNodeChild(result, 'messages') || getBinaryNodeChild(result, 'message_updates') || result;
            if (!messagesNode) {
                return [];
            }
            const newsletterJid = messagesNode.attrs?.jid || jid;
            const messages = [];
            for (const child of getBinaryNodeChildren(messagesNode, 'message')) {
                const plaintextNode = getBinaryNodeChild(child, 'plaintext');
                if (!plaintextNode?.content) {
                    continue;
                }
                try {
                    const contentBuf = typeof plaintextNode.content === 'string'
                        ? Buffer.from(plaintextNode.content, 'binary')
                        : Buffer.from(plaintextNode.content);
                    const messageProto = proto.Message.decode(contentBuf).toJSON();
                    const fullMessage = proto.WebMessageInfo.fromObject({
                        key: {
                            remoteJid: newsletterJid,
                            id: child.attrs.message_id || child.attrs.server_id || child.attrs.id,
                            server_id: child.attrs.message_id || child.attrs.server_id,
                            fromMe: false
                        },
                        message: messageProto,
                        messageTimestamp: child.attrs.t ? +child.attrs.t : undefined
                    }).toJSON();
                    messages.push(fullMessage);
                }
                catch (error) {
                    logger.error({ error }, 'Failed to decode newsletter message');
                }
            }
            return messages;
        },
        subscribeNewsletterUpdates: async (jid) => {
            const result = await query({
                tag: 'iq',
                attrs: {
                    id: generateMessageTag(),
                    type: 'set',
                    xmlns: 'newsletter',
                    to: jid
                },
                content: [{ tag: 'live_updates', attrs: {}, content: [] }]
            });
            const liveUpdatesNode = getBinaryNodeChild(result, 'live_updates');
            const duration = liveUpdatesNode?.attrs?.duration;
            return duration ? { duration: duration } : null;
        },
        newsletterAdminCount: async (jid) => {
            const response = await executeWMexQuery({ newsletter_id: jid }, QueryIds.ADMIN_COUNT, XWAPaths.xwa2_newsletter_admin_count);
            return response.admin_count;
        },
        newsletterChangeOwner: async (jid, newOwnerJid) => {
            await executeWMexQuery({ newsletter_id: jid, user_id: newOwnerJid }, QueryIds.CHANGE_OWNER, XWAPaths.xwa2_newsletter_change_owner);
        },
        newsletterDemote: async (jid, userJid) => {
            await executeWMexQuery({ newsletter_id: jid, user_id: userJid }, QueryIds.DEMOTE, XWAPaths.xwa2_newsletter_demote);
        },
        newsletterDelete: async (jid) => {
            await executeWMexQuery({ newsletter_id: jid }, QueryIds.DELETE, XWAPaths.xwa2_newsletter_delete_v2);
        },
        /**
         * JAP@Add (§2.219): generic dispatcher over the membership/notification actions.
         *
         * Several community forks expose a `newsletterAction(jid, action)` helper, and bots
         * that drive channels from a config table want exactly that: an action chosen at
         * runtime rather than four named methods. This dispatches ONLY over query ids this
         * library already ships -- FOLLOW, UNFOLLOW, MUTE, UNMUTE -- so it adds no
         * unverified protocol surface. An unknown action is rejected by name rather than
         * sent to the server to fail opaquely.
         */
        newsletterAction: async (jid, action) => {
            const key = String(action || '').toUpperCase();
            const route = NEWSLETTER_ACTIONS[key];
            if (!route) {
                throw new Boom(`unknown newsletter action "${action}". Supported: ${Object.keys(NEWSLETTER_ACTIONS).join(', ')}`, { statusCode: 400 });
            }
            return executeWMexQuery({ newsletter_id: jid }, QueryIds[route.queryId], XWAPaths[route.path]);
        },
        /**
         * JAP@Add (§2.219): who may react to posts in a channel.
         *
         * This rides the same UPDATE_METADATA mutation the other newsletter settings use;
         * no new query id is invented for it. WhatsApp accepts ALL, BASIC (admins and
         * subscribers) or NONE. The value is validated here so a typo fails locally with a
         * readable message instead of being bounced by the server.
         */
        newsletterReactionMode: async (jid, mode) => {
            const value = String(mode || '').toUpperCase();
            if (!NEWSLETTER_REACTION_MODES.includes(value)) {
                throw new Boom(`unknown reaction mode "${mode}". Supported: ${NEWSLETTER_REACTION_MODES.join(', ')}`, { statusCode: 400 });
            }
            return newsletterUpdate(jid, { settings: { reaction_codes: { value } } });
        }
    };
};
