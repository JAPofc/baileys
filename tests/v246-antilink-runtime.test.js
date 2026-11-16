// Fix: the anti-link www. branch required a leading whitespace/start, so
// bare-domain links glued to punctuation slipped past the guard.
// Upgrade: runtime allowlist + allowed-domain management, an auto-delete
// toggle, and detect/delete counters.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractLinks, createAntiLinkGuard } from '../lib/Utils/anti-link.js';

const mk = (chat, text) => ({
    key: { remoteJid: chat, id: String(Math.random()), participant: 'u@s.whatsapp.net' },
    message: { conversation: text }
});

test('anti-link fix: punctuation-glued www links are no longer a bypass', () => {
    assert.deepEqual(extractLinks('cek(www.judi88.com) ya'), ['www.judi88.com']);
    assert.deepEqual(extractLinks('link:www.slot.com'), ['www.slot.com']);
    assert.deepEqual(extractLinks('main →www.judol.net skrg'), ['www.judol.net']);
    // still catches whitespace/start-preceded links
    assert.deepEqual(extractLinks('www.start.com di awal'), ['www.start.com']);
    assert.deepEqual(extractLinks('a https://ok.com b www.spam.com'), ['https://ok.com', 'www.spam.com']);
    // does NOT over-match: fused token / email host stay clear
    assert.deepEqual(extractLinks('xwww.notalink.com'), []);
    assert.deepEqual(extractLinks('mail user@www.host.com'), []);
});

test('anti-link upgrade: runtime allowlist exempts a group, unallow re-includes it', async () => {
    const guard = createAntiLinkGuard({ inviteLinksOnly: false });
    const hits = [];
    guard.onDetected((d) => hits.push(d.chat));

    await guard.handler({ messages: [mk('a@g.us', 'spam www.x.com')] });
    assert.equal(hits.length, 1);

    assert.equal(guard.allow('a@g.us'), 1);
    assert.equal(guard.isAllowed('a@g.us'), true);
    assert.deepEqual(guard.getAllowlist(), ['a@g.us']);
    await guard.handler({ messages: [mk('a@g.us', 'more www.y.com')] });
    assert.equal(hits.length, 1, 'allowlisted group produced no new detection');

    assert.equal(guard.unallow('a@g.us'), 0);
    await guard.handler({ messages: [mk('a@g.us', 'again www.z.com')] });
    assert.equal(hits.length, 2);
});

test('anti-link upgrade: runtime allowed-domain management', async () => {
    const guard = createAntiLinkGuard({ inviteLinksOnly: false });
    const hits = [];
    guard.onDetected((d) => hits.push(d.links));

    assert.equal(guard.allowDomain('github.com'), 1);
    assert.deepEqual(guard.getAllowedDomains(), ['github.com']);
    // allowed domain (and its subdomain) do not trigger
    await guard.handler({ messages: [mk('a@g.us', 'see https://github.com/x and https://gist.github.com/y')] });
    assert.equal(hits.length, 0);
    // a non-allowed link still triggers
    await guard.handler({ messages: [mk('a@g.us', 'https://github.com/ok but www.evil.com')] });
    assert.deepEqual(hits, [['www.evil.com']]);

    assert.equal(guard.disallowDomain('github.com'), 0);
    await guard.handler({ messages: [mk('a@g.us', 'https://github.com/now')] });
    assert.equal(hits.length, 2);
});

test('anti-link upgrade: setAutoDelete toggle + counters', async () => {
    const guard = createAntiLinkGuard({ inviteLinksOnly: false });
    assert.equal(guard.autoDelete, false);
    const deletes = [];
    const sock = { sendMessage: async (_c, content) => { deletes.push(content); return {}; } };

    let last;
    guard.onDetected((d) => { last = d; });
    await guard.handler({ messages: [mk('a@g.us', 'link www.a.com')] }, sock);
    assert.equal(last.deleted, false);
    assert.equal(deletes.length, 0);

    assert.equal(guard.setAutoDelete(true), true);
    assert.equal(guard.autoDelete, true);
    await guard.handler({ messages: [mk('a@g.us', 'link www.b.com')] }, sock);
    assert.equal(last.deleted, true);
    assert.ok(deletes[0].delete, 'sent a delete revoke');

    assert.deepEqual(guard.stats, { detected: 2, deleted: 1 });
});
