// Batch BP repro -- §2.120 (w:mex error handling) and §2.121/§2.122 (link preview)
import { executeWMexQuery } from '../lib/Socket/mex.js';
import { getUrlInfo } from '../lib/Utils/link-preview.js';

const mkQuery = body => async () => ({
    tag: 'iq',
    attrs: {},
    content: [{ tag: 'result', attrs: {}, content: Buffer.from(body) }]
});
const tag = () => '1';

console.log('--- §2.120 w:mex error codes ---');
for (const code of [0, 200, 'INTERNAL_ERROR', 401, undefined]) {
    const body = JSON.stringify({ errors: [{ message: 'server says no', extensions: { error_code: code } }] });
    try {
        await executeWMexQuery({}, 'q1', 'xwa2_thing', mkQuery(body), tag);
        console.log(`error_code=${JSON.stringify(code)} -> returned (unexpected)`);
    } catch (e) {
        console.log(`error_code=${JSON.stringify(code)} -> ${e.constructor.name}: ${e.message} | statusCode=${e.output?.statusCode} errorCode=${JSON.stringify(e.errorCode)}`);
    }
}
try {
    await executeWMexQuery({}, 'q2', 'xwa2_thing', mkQuery('<html>502 Bad Gateway</html>'), tag);
} catch (e) {
    console.log(`non-JSON body -> ${e.constructor.name}: ${e.message}`);
}

console.log('--- §2.121/§2.122 link preview without an image ---');
const fetcher = async () => ({ url: 'https://example.com/', title: 'A page with no picture', description: 'd', mediaType: 'website', contentType: 'text/html' });
const uploadImage = async () => { throw new Error('upload must not be attempted without an image'); };
const info = await getUrlInfo('https://example.com/', {
    thumbnailWidth: 192,
    fetchOpts: { timeout: 3000, checkDns: false },
    uploadImage,
    fetcher
});
console.log('preview =>', JSON.stringify(info));

console.log('--- §2.121 non-Error throw ---');
try {
    await getUrlInfo('https://example.com/', { fetchOpts: { checkDns: false }, fetcher: async () => { throw 'plain string failure'; } });
} catch (e) {
    console.log('rethrown as:', typeof e, JSON.stringify(e));
}
