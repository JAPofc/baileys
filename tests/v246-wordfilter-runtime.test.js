// Upgrade: word-filter gains runtime allowlist management, an auto-delete
// toggle, and match/delete counters — parity with the already-runtime word list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWordFilter } from '../lib/Utils/word-filter.js';

const mk = (chat, text) => ({
    key: { remoteJid: chat, id: String(Math.random()), participant: 'u@s.whatsapp.net' },
    message: { conversation: text }
});

test('word-filter: runtime allowlist exempts a chat, unallow re-includes it', async () => {
    const filter = createWordFilter({ words: ['judol'] });
    const hits = [];
    filter.onMatch((h) => hits.push(h.chat));

    // baseline: matches everywhere
    await filter.handler({ messages: [mk('a@g.us', 'main judol lagi')] });
    assert.equal(hits.length, 1);

    // allow a chat → its messages are skipped
    assert.equal(filter.allow('a@g.us'), 1);
    assert.equal(filter.isAllowed('a@g.us'), true);
    assert.deepEqual(filter.getAllowlist(), ['a@g.us']);
    await filter.handler({ messages: [mk('a@g.us', 'judol terus')] });
    assert.equal(hits.length, 1, 'allowlisted chat produced no new match');

    // unallow → matches again
    assert.equal(filter.unallow('a@g.us'), 0);
    assert.equal(filter.isAllowed('a@g.us'), false);
    await filter.handler({ messages: [mk('a@g.us', 'judol judol')] });
    assert.equal(hits.length, 2);
});

test('word-filter: setAutoDelete toggles delete-for-everyone at runtime + counters', async () => {
    const filter = createWordFilter({ words: ['spam'] });
    assert.equal(filter.autoDelete, false);

    const deletes = [];
    const sock = { sendMessage: async (chat, content) => { deletes.push(content); return {}; } };

    // off by default → matched but not deleted
    let last;
    filter.onMatch((h) => { last = h; });
    await filter.handler({ messages: [mk('a@g.us', 'this is spam')] }, sock);
    assert.equal(last.deleted, false);
    assert.equal(deletes.length, 0);

    // toggle on → next match deletes
    assert.equal(filter.setAutoDelete(true), true);
    assert.equal(filter.autoDelete, true);
    await filter.handler({ messages: [mk('a@g.us', 'more spam here')] }, sock);
    assert.equal(last.deleted, true);
    assert.equal(deletes.length, 1);
    assert.ok(deletes[0].delete, 'sent a delete revoke');

    assert.deepEqual(filter.stats, { matches: 2, deleted: 1 });
});

test('word-filter: allow() accepts multiple jids and arrays', () => {
    const filter = createWordFilter();
    assert.equal(filter.allow('a@g.us', ['b@g.us', 'c@g.us']), 3);
    assert.equal(filter.getAllowlist().length, 3);
    assert.equal(filter.unallow(['a@g.us', 'b@g.us']), 1);
    assert.deepEqual(filter.getAllowlist(), ['c@g.us']);
});
