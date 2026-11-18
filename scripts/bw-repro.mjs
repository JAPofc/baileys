// Batch BT repro — §2.132: a wire code that Boom refuses used to destroy the disconnect
// that was being reported, from inside the handler meant to close the socket.
import { Boom } from '@hapi/boom';
import { getErrorCodeFromStreamError, toBoomStatusCode } from '../lib/Utils/generics.js';
import { extractGroupMetadata } from '../lib/Socket/groups.js';

const streamError = code => ({ tag: 'stream:error', attrs: code === undefined ? {} : { code }, content: [{ tag: 'conflict', attrs: {} }] });

console.log('--- the raw Boom contract (unchanged, this is what bit us) ---');
for (const sc of [401, 0, 200, NaN]) {
    try { console.log(`  new Boom(_, { statusCode: ${sc} }) ->`, new Boom('x', { statusCode: sc }).output.statusCode) }
    catch (e) { console.log(`  new Boom(_, { statusCode: ${sc} }) -> THROWS: ${e.message}`) }
}

console.log('--- §2.132 CB:stream:error ---');
for (const code of ['401', 'conflict', '0', '200', undefined]) {
    const { reason, statusCode } = getErrorCodeFromStreamError(streamError(code));
    const boom = new Boom(`Stream Errored (${reason})`, { statusCode });
    console.log(`  code=${JSON.stringify(code)} -> statusCode=${statusCode}, Boom ok (before: NaN/0/200 threw and end() never ran)`, boom.output.statusCode);
}

console.log('--- §2.132 CB:failure (same clamp, used by socket.js) ---');
for (const reason of ['401', 'conflict', '0', undefined]) {
    const sc = toBoomStatusCode(reason, 500);
    console.log(`  reason=${JSON.stringify(reason)} -> old: ${+(reason || 500)} | new: ${sc} ->`, new Boom('Connection Failure', { statusCode: sc }).output.statusCode);
}

console.log('--- §2.132 extractGroupMetadata keeps the server text ---');
for (const code of ['403', 'not-authorized', undefined]) {
    const result = { tag: 'iq', attrs: {}, content: [{ tag: 'error', attrs: { ...(code ? { code } : {}), text: 'not authorized' }, content: [] }] };
    try { extractGroupMetadata(result) }
    catch (e) { console.log(`  code=${JSON.stringify(code)} -> "${e.message}" (statusCode ${e.output.statusCode}) — before: "First argument must be a number (400+)"`) }
}
