import { USyncQuery, USyncUser } from '../WAUSync/index.js';
import { makeCommunitiesSocket } from './communities.js';
import { executeWMexQuery } from './mex.js';

// JAP@Socket ---
// WhatsApp Username socket layer: check, set, pin, find, and recommend usernames.
// Query IDs below are captured from live WA Web sessions and may rotate with
// WA updates — re-capture via the proto-extract tool if a call starts failing
// with an "unexpected response structure" Boom.
export const USERNAME_QUERY_IDS = {
    CHECK: '26124072630599520', // UsernameCheck
    CHECK_MULTI: '27134626522840290', // UsernameCheckMulti
    SET: '27108705368767936', // UsernameSet
    GET: '32618050064506056', // UsernameGet
    GET_RECOMMENDATIONS: '26077456248616956', // UsernameGetRecommendationsQuery
    PIN_SET: '25529696019976770' // UsernamePinSet
};

// JAP@Add (query-id auto-rotation) --------------------------------------
// WhatsApp rotates these GraphQL query_ids server-side. Baking them into the
// package means every rotation needs an npm release. Instead, the pinned IDs
// above act as the offline fallback and `fetchLatestUsernameQueryIds()` pulls
// the freshest set from this repo's main branch (same pattern as
// fetchLatestBaileysVersion) — so a rotation only needs a git push, not a
// release. `makeWASocket({ autoRotateQueryIds: true })` applies it on
// connect automatically; manual `usernameQueryIds` overrides always win.
const QUERY_IDS_SOURCE_URL = 'https://raw.githubusercontent.com/JAPofc/baileys/main/lib/Socket/username.js';

/**
 * Fetch the freshest USERNAME_QUERY_IDS from the repo's main branch.
 * Never throws — resolves to the pinned fallback set on any failure.
 */
export const fetchLatestUsernameQueryIds = async (options = {}) => {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
        const response = await fetch(QUERY_IDS_SOURCE_URL, {
            method: 'GET',
            signal: controller.signal,
            dispatcher: options.dispatcher
        }).finally(() => clearTimeout(timer));
        if (!response.ok) {
            return { queryIds: { ...USERNAME_QUERY_IDS }, isLatest: false };
        }
        const source = await response.text();
        const block = source.match(/USERNAME_QUERY_IDS\s*=\s*\{([\s\S]*?)\}/)?.[1];
        if (!block) {
            return { queryIds: { ...USERNAME_QUERY_IDS }, isLatest: false };
        }
        const fresh = {};
        for (const m of block.matchAll(/([A-Z_]+)\s*:\s*'(\d+)'/g)) {
            fresh[m[1]] = m[2];
        }
        // sanity: a valid set must contain every key the fallback has
        const complete = Object.keys(USERNAME_QUERY_IDS).every((k) => typeof fresh[k] === 'string' && fresh[k].length > 0);
        if (!complete) {
            return { queryIds: { ...USERNAME_QUERY_IDS }, isLatest: false };
        }
        return { queryIds: fresh, isLatest: true };
    }
    catch {
        return { queryIds: { ...USERNAME_QUERY_IDS }, isLatest: false };
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

    // JAP@Fix: the mex query_ids above are captured from live WA Web sessions and
    // WhatsApp rotates them server-side — when that happens every username call
    // fails with an opaque "GraphQL server error: Bad Request". Two mitigations:
    //   1. `usernameQueryIds` in the socket config overrides any/all IDs at
    //      runtime, so users can hot-patch a rotated ID without a package update:
    //        makeWASocket({ usernameQueryIds: { CHECK: '<fresh-id>' } })
    //   2. Bad Request failures are re-thrown with an actionable message
    //      instead of the bare server error.
    const queryIds = { ...USERNAME_QUERY_IDS, ...(config?.usernameQueryIds ?? {}) };
    // JAP@Add (auto-rotation): when enabled, refresh the IDs from the repo in
    // the background at socket creation. Manual usernameQueryIds overrides are
    // re-applied on top so they always win. Fire-and-forget + never throws.
    if (config?.autoRotateQueryIds) {
        void fetchLatestUsernameQueryIds()
            .then(({ queryIds: fresh, isLatest }) => {
                if (isLatest) {
                    Object.assign(queryIds, fresh, config?.usernameQueryIds ?? {});
                }
            })
            .catch(() => { });
    }

    /** Internal helper — wraps executeWMexQuery with this socket's query/tag */
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
                        'Update to the latest @japofc/baileys, or hot-patch it via the socket config: ' +
                        "makeWASocket({ usernameQueryIds: { /* e.g. CHECK: '<fresh-id>' */ } }). " +
                        'Fresh IDs can be captured from a live WA Web session (DevTools → WS frames → xmlns="w:mex").'),
                    { cause: err, output: err?.output }
                );
            }
            throw err;
        }
    };

    // 1. Check username availability
    const checkUsername = async (username, includeSuggestions = true) => {
        if (!queryIds.CHECK) {
            throw new Error('Username CHECK query_id not configured — capture a live WA session to obtain it');
        }
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

    // 2. Check multiple usernames at once
    const checkUsernameMulti = async (usernames) => {
        if (!queryIds.CHECK_MULTI) {
            throw new Error('Username CHECK_MULTI query_id not configured');
        }
        return mexQuery({ usernames }, queryIds.CHECK_MULTI, 'xwa2_username_check_multi');
    };

    // 3. Set username
    const setUsername = async (username, options = {}) => {
        if (!queryIds.SET) {
            throw new Error('Username SET query_id not configured — capture a live WA session to obtain it');
        }
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

    // 2b. Reserve a username (WA 2026 reservation flow — same endpoint, `reserved: true`)
    const reserveUsername = async (username, options = {}) => {
        return setUsername(username, { ...options, reserved: true });
    };

    // 4. Delete / unset username
    const deleteUsername = async () => {
        if (!queryIds.SET) {
            throw new Error('Username SET query_id not configured — capture a live WA session to obtain it');
        }
        return mexQuery({ username: null }, queryIds.SET, 'xwa2_username_delete');
    };

    // 5. Get own username
    const getMyUsername = async () => {
        if (!queryIds.GET) {
            throw new Error('Username GET query_id not configured — capture a live WA session to obtain it');
        }
        const data = await mexQuery({}, queryIds.GET, 'xwa2_username_get');
        return data?.username ?? null;
    };

    // 6. Pin/unpin username (requires PIN)
    const setUsernamePin = async (pin) => {
        if (!queryIds.PIN_SET) {
            throw new Error('Username PIN_SET query_id not configured — capture a live WA session to obtain it');
        }
        return mexQuery({ pin }, queryIds.PIN_SET, 'xwa2_username_pin_set');
    };

    // 7. Find user by username (USync)
    const findUserByUsername = async (username, pin) => {
        const usyncQuery = new USyncQuery().withContactProtocol();
        const user = new USyncUser().withUsername(username);
        if (pin) user.withUsernameKey(pin);
        usyncQuery.withUser(user);
        const result = await executeUSyncQuery(usyncQuery);
        if (!result?.list?.length) return null;
        const entry = result.list[0];
        if (!entry) return null;
        return {
            jid: entry.id,
            contact: Boolean(entry.contact)
        };
    };

    // 8. Fetch usernames of known contacts (USync)
    const fetchContactUsernames = async (...jids) => {
        const usyncQuery = new USyncQuery().withUsernameProtocol();
        for (const jid of jids) {
            usyncQuery.withUser(new USyncUser().withId(jid));
        }
        const result = await executeUSyncQuery(usyncQuery);
        return result?.list ?? [];
    };

    // 9. Get username recommendations
    const getUsernameRecommendations = async (source = null) => {
        const variables = {};
        if (source) variables.source = source;
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
