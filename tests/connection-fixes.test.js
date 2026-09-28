import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('WIN_HYBRID web sub-platform fix', () => {
    it('generateLoginNode advertises WIN_HYBRID (5), never retired WIN32 (4), for Windows Desktop', async () => {
        const { generateLoginNode, proto } = await import('../lib/index.js');
        const node = generateLoginNode('628123456789:1@s.whatsapp.net', {
            version: [2, 3000, 0],
            browser: ['Windows', 'Desktop', '10'],
            syncFullHistory: true,
            countryCode: 'ID'
        });
        assert.equal(node.webInfo.webSubPlatform, proto.ClientPayload.WebInfo.WebSubPlatform.WIN_HYBRID);
        assert.notEqual(node.webInfo.webSubPlatform, proto.ClientPayload.WebInfo.WebSubPlatform.WIN32);
    });
    it('macOS Desktop still advertises DARWIN; non-Desktop stays WEB_BROWSER', async () => {
        const { generateLoginNode, proto } = await import('../lib/index.js');
        const mac = generateLoginNode('628123456789:1@s.whatsapp.net', {
            version: [2, 3000, 0], browser: ['Mac OS', 'Desktop', '10'], syncFullHistory: true, countryCode: 'ID'
        });
        assert.equal(mac.webInfo.webSubPlatform, proto.ClientPayload.WebInfo.WebSubPlatform.DARWIN);
        const chrome = generateLoginNode('628123456789:1@s.whatsapp.net', {
            version: [2, 3000, 0], browser: ['Ubuntu', 'Chrome', '110'], syncFullHistory: true, countryCode: 'ID'
        });
        assert.equal(chrome.webInfo.webSubPlatform, proto.ClientPayload.WebInfo.WebSubPlatform.WEB_BROWSER);
    });
});

describe('profile picture tctoken nesting fix', () => {
    it('buildProfilePictureQueryContent without token: bare picture node', async () => {
        const { buildProfilePictureQueryContent } = await import('../lib/Socket/chats.js');
        assert.deepEqual(buildProfilePictureQueryContent('preview'), [
            { tag: 'picture', attrs: { type: 'preview', query: 'url' } }
        ]);
    });
    it('nests tctoken INSIDE the picture node, not as a sibling', async () => {
        const { buildProfilePictureQueryContent } = await import('../lib/Socket/chats.js');
        const tcToken = { tag: 'tctoken', attrs: { t: '1770000000' }, content: Buffer.from([4, 1, 33]) };
        const content = buildProfilePictureQueryContent('image', [tcToken]);
        assert.equal(content.length, 1, 'must be a single node');
        assert.equal(content[0].tag, 'picture');
        assert.deepEqual(content[0].content, [tcToken], 'tctoken must be nested inside <picture>');
    });
    it('buildTcTokenFromJid emits the token issue time as the t attr', async () => {
        const { buildTcTokenFromJid } = await import('../lib/Utils/tc-token-utils.js');
        const token = Buffer.from([1, 2, 3]);
        const now = Math.floor(Date.now() / 1000); // stored in seconds
        const authState = {
            keys: { get: async () => ({ '628@s.whatsapp.net': { token, timestamp: now } }) }
        };
        const result = await buildTcTokenFromJid({
            authState, jid: '628@s.whatsapp.net', getLIDForPN: async () => null
        });
        assert.equal(result.length, 1);
        assert.equal(result[0].tag, 'tctoken');
        assert.equal(result[0].attrs.t, String(now), 't attr must carry the issue timestamp');
        assert.equal(result[0].content, token);
    });
    it('refuses to advertise a token that has no timestamp', async () => {
        const { buildTcTokenFromJid } = await import('../lib/Utils/tc-token-utils.js');
        const authState = {
            keys: {
                get: async () => ({ '628@s.whatsapp.net': { token: Buffer.from([1]) } }),
                set: async () => {}
            }
        };
        const result = await buildTcTokenFromJid({
            authState, jid: '628@s.whatsapp.net', getLIDForPN: async () => null
        });
        assert.equal(result, undefined, 'timestamp-less token must not be advertised');
    });
});
