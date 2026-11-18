import { Boom } from '@hapi/boom';
import { getBinaryNodeChild, S_WHATSAPP_NET } from '../WABinary/index.js';
const wMexQuery = (variables, queryId, query, generateMessageTag) => {
    return query({
        tag: 'iq',
        attrs: {
            id: generateMessageTag(),
            type: 'get',
            to: S_WHATSAPP_NET,
            xmlns: 'w:mex'
        },
        content: [
            {
                tag: 'query',
                attrs: { query_id: queryId },
                content: Buffer.from(JSON.stringify({ variables }), 'utf-8')
            }
        ]
    });
};
// JAP@Fix (§2.120): `new Boom(msg, { statusCode })` *itself* throws
// "First argument must be a number (400+)" when the code is not a number >= 400.
// WhatsApp's w:mex layer happily returns `error_code: 0`, `error_code: 200` or a
// symbolic string, so the real server error used to be replaced by that assertion
// -- thrown from inside the catch-less error path, with the GraphQL message lost.
const toBoomStatus = (code) => {
    const numeric = typeof code === 'number' ? code : Number(code);
    return Number.isInteger(numeric) && numeric >= 400 && numeric <= 599 ? numeric : 400;
};
export const executeWMexQuery = async (variables, queryId, dataPath, query, generateMessageTag) => {
    const result = await wMexQuery(variables, queryId, query, generateMessageTag);
    const child = getBinaryNodeChild(result, 'result');
    if (child?.content) {
        // JAP@Fix (§2.120): a non-JSON body (HTML error page, truncated frame) used to
        // escape as a bare SyntaxError with no context about the query that produced it.
        let data;
        const raw = child.content.toString();
        try {
            data = JSON.parse(raw);
        }
        catch (error) {
            throw new Boom(`Failed to parse w:mex response for query ${queryId}: ${error?.message || error}`, { statusCode: 400, data: { queryId, dataPath, raw: raw.slice(0, 512) } });
        }
        if (Array.isArray(data?.errors) && data.errors.length > 0) {
            const errorMessages = data.errors.map((err) => err?.message || 'Unknown error').join(', ');
            const firstError = data.errors[0];
            const rawCode = firstError?.extensions?.error_code;
            const err = new Boom(`GraphQL server error: ${errorMessages}`, {
                statusCode: toBoomStatus(rawCode),
                data: firstError
            });
            // keep the original, unclamped code reachable for callers that switch on it
            err.errorCode = rawCode;
            throw err;
        }
        const response = dataPath ? data?.data?.[dataPath] : data?.data;
        if (typeof response !== 'undefined') {
            return response;
        }
    }
    const action = (dataPath || '').startsWith('xwa2_')
        ? dataPath.substring(5).replace(/_/g, ' ')
        : dataPath?.replace(/_/g, ' ');
    throw new Boom(`Failed to ${action}, unexpected response structure.`, { statusCode: 400, data: result });
};
