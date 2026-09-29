/**
 * lib/Socket/username.js
 * Author: J.AP (@japofc/baileys)
 *
 * WhatsApp username socket layer — availability checks, set/reserve/delete,
 * pinning, recommendations, and USync-based lookups.
 *
 * The GraphQL query_ids below are captured from live WA Web sessions. WhatsApp
 * rotates them server-side, so they double as an offline fallback:
 *   - override any id at runtime via `makeWASocket({ usernameQueryIds: {...} })`
 *   - or enable `autoRotateQueryIds: true` to refresh them from this repo on
 *     connect (a rotation then only needs a git push, not an npm release).
 */

import { USyncQuery, USyncUser } from '../WAUSync/index.js';
import { makeCommunitiesSocket } from './communities.js';
import { executeWMexQuery } from './mex.js';

/** Pinned query_ids — offline fallback / default set. */
export const USERNAME_QUERY_IDS = {
    CHECK: '26124072630599520', // UsernameCheck
    CHECK_MULTI: '27134626522840290', // UsernameCheckMulti
    SET: '27108705368767936', // UsernameSet
    GET: '32618050064506056', // UsernameGet
    GET_RECOMMENDATIONS: '26077456248616956', // UsernameGetRecommendationsQuery
    PIN_SET: '25529696019976770' // UsernamePinSet
};

const QUERY_IDS_SOURCE_URL = 'https://raw.githubusercontent.com/JAPofc/baileys/main/lib/Socket/username.js';

/**
 * Pull the freshest USERNAME_QUERY_IDS from the repo's main branch. Never
 * throws — resolves to the pinned fallback set (with `isLatest: false`) on any
 * failure or malformed response.
 * @param {{ timeoutMs?: number, dispatcher?: any }} [options]
 */
export const fetchLatestUsernameQueryIds = async (options = {}) => {
    const fallback = () => ({ queryIds: { ...USERNAME_QUERY_IDS }, isLatest: false });
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
        const response = await fetch(QUERY_IDS_SOURCE_URL, {
            method: 'GET',
            signal: controller.signal,
            dispatcher: options.dispatcher
        }).finally(() => clearTimeout(timer));
        if (!response.ok) return fallback();

        const block = (await response.text()).match(/USERNAME_QUERY_IDS\s*=\s*\{([\s\S]*?)\}/)?.[1];
        if (!block) return fallback();

        const fresh = {};
        for (const m of block.matchAll(/([A-Z_]+)\s*:\s*'(\d+)'/g)) {
            fresh[m[1]] = m[2];
        }
        // a valid set must contain every key the fallback has
        const complete = Object.keys(USERNAME_QUERY_IDS).every((k) => typeof fresh[k] === 'string' && fresh[k].length > 0);
        return complete ? { queryIds: fresh, isLatest: true } : fallback();
    }
    catch {
        return fallback();
    }
};

export const USERNAME_CHECK_RESULT = {
    SUCCESS: 'SUCCESS',
    INVALID: 'INVALID'
};

export const USERNAME_SOURCE = {
    FB: 'FB',
    IG: 'IG',
    USER_INPUT: 'USER_INPUT',
    SUGGESTION: 'SUGGESTION'
};

export const makeUsernameSocket = (config) => {
    const sock = makeCommunitiesSocket(config);
    const { query, generateMessageTag, executeUSyncQuery } = sock;

    // Manual overrides always win over the pinned defaults.
    const queryIds = { ...USERNAME_QUERY_IDS, ...(config?.usernameQueryIds ?? {}) };

    // Optional background refresh — re-apply manual overrides on top so they
    // remain authoritative. Fire-and-forget; never throws.
    if (config?.autoRotateQueryIds) {
        void fetchLatestUsernameQueryIds()
            .then(({ queryIds: fresh, isLatest }) => {
                if (isLatest) Object.assign(queryIds, fresh, config?.usernameQueryIds ?? {});
            })
            .catch(() => { });
    }

    /** Run a w:mex GraphQL query, turning a rotated-id 400 into an actionable error. */
    const mexQuery = async (variables, queryId, dataPath) => {
        try {
            return await executeWMexQuery(variables, queryId, dataPath, query, generateMessageTag);
        }
        catch (err) {
            const status = err?.output?.statusCode;
            const msg = String(err?.message ?? '');
            if (status === 400 || /bad request/i.test(msg)) {
                throw Object.assign(
                    new Error(`${msg} — WhatsApp likely rotated this GraphQL query_id (${queryId}). ` +
                        'Update @japofc/baileys, or hot-patch it via the socket config: ' +
                        "makeWASocket({ usernameQueryIds: { /* e.g. CHECK: '<fresh-id>' */ } }). " +
                        'Fresh IDs can be captured from a live WA Web session (DevTools → WS frames → xmlns="w:mex").'),
                    { cause: err, output: err?.output }
                );
            }
            throw err;
        }
    };

    const requireId = (key, action) => {
        if (!queryIds[key]) {
            throw new Error(`Username ${key} query_id not configured — capture a live WA session to obtain it (${action})`);
        }
    };

    /** Check whether a single username is available. */
    const checkUsername = async (username, includeSuggestions = true) => {
        requireId('CHECK', 'checkUsername');
        const data = await mexQuery({ username, include_suggestions: includeSuggestions }, queryIds.CHECK, 'xwa2_username_check');
        if (data?.result === USERNAME_CHECK_RESULT.SUCCESS) {
            return { available: true, username };
        }
        return {
            available: false,
            username,
            suggestions: data?.suggestions ?? [],
            rejectionReasons: data?.rejection_reasons ?? [],
            suggestionsEligible: data?.suggestions_eligible ?? true
        };
    };

    /** Check several usernames in one round-trip. */
    const checkUsernameMulti = async (usernames) => {
        requireId('CHECK_MULTI', 'checkUsernameMulti');
        return mexQuery({ usernames }, queryIds.CHECK_MULTI, 'xwa2_username_check_multi');
    };

    /** Set (or reserve) a username. */
    const setUsername = async (username, options = {}) => {
        requireId('SET', 'setUsername');
        const { source = USERNAME_SOURCE.USER_INPUT, sessionId, pin, reserved = false } = options;
        const variables = {
            username,
            reserved,
            source,
            ...(sessionId ? { session_id: sessionId } : {}),
            ...(pin ? { pin } : {})
        };
        return mexQuery(variables, queryIds.SET, 'xwa2_username_set');
    };

    /** Reserve a username (WA 2026 reservation flow — same endpoint, `reserved: true`). */
    const reserveUsername = async (username, options = {}) => setUsername(username, { ...options, reserved: true });

    /** Remove the current username. */
    const deleteUsername = async () => {
        requireId('SET', 'deleteUsername');
        return mexQuery({ username: null }, queryIds.SET, 'xwa2_username_delete');
    };

    /** Fetch the account's own username, or null. */
    const getMyUsername = async () => {
        requireId('GET', 'getMyUsername');
        const data = await mexQuery({}, queryIds.GET, 'xwa2_username_get');
        return data?.username ?? null;
    };

    /** Set the username PIN. */
    const setUsernamePin = async (pin) => {
        requireId('PIN_SET', 'setUsernamePin');
        return mexQuery({ pin }, queryIds.PIN_SET, 'xwa2_username_pin_set');
    };

    /** Resolve a JID from a username (via USync contact protocol). */
    const findUserByUsername = async (username, pin) => {
        const user = new USyncUser().withUsername(username);
        if (pin) user.withUsernameKey(pin);
        const result = await executeUSyncQuery(new USyncQuery().withContactProtocol().withUser(user));
        const entry = result?.list?.[0];
        if (!entry) return null;
        return { jid: entry.id, contact: Boolean(entry.contact) };
    };

    /** Fetch usernames for a set of known contacts (via USync username protocol). */
    const fetchContactUsernames = async (...jids) => {
        const usyncQuery = new USyncQuery().withUsernameProtocol();
        for (const jid of jids) usyncQuery.withUser(new USyncUser().withId(jid));
        const result = await executeUSyncQuery(usyncQuery);
        return result?.list ?? [];
    };

    /** Ask WhatsApp for username recommendations. */
    const getUsernameRecommendations = async (source = null) => {
        const variables = source ? { source } : {};
        return mexQuery(variables, queryIds.GET_RECOMMENDATIONS, 'xwa2_username_get_recommendations');
    };

    return {
        ...sock,
        checkUsername,
        checkUsernameMulti,
        setUsername,
        reserveUsername,
        deleteUsername,
        getMyUsername,
        setUsernamePin,
        findUserByUsername,
        fetchContactUsernames,
        getUsernameRecommendations,
        USERNAME_QUERY_IDS: queryIds,
        USERNAME_CHECK_RESULT,
        USERNAME_SOURCE
    };
};
