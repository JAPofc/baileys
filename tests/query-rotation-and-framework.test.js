import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Tests for username query-id auto-rotation + Framework typing/behavior fixes.

describe('fetchLatestUsernameQueryIds', () => {
    it('is exported from the barrel and from Socket/username.js', async () => {
        const barrel = await import('../lib/index.js');
        const direct = await import('../lib/Socket/username.js');
        assert.equal(typeof barrel.fetchLatestUsernameQueryIds, 'function');
        assert.equal(barrel.fetchLatestUsernameQueryIds, direct.fetchLatestUsernameQueryIds);
        assert.ok(barrel.USERNAME_QUERY_IDS.CHECK, 'pinned fallback exported');
    });

    it('falls back to pinned IDs (isLatest false) instead of throwing on failure', async () => {
        const { fetchLatestUsernameQueryIds, USERNAME_QUERY_IDS } = await import('../lib/Socket/username.js');
        // 1ms timeout aborts the request — must resolve, never reject
        const r = await fetchLatestUsernameQueryIds({ timeoutMs: 1 });
        assert.equal(r.isLatest, false);
        assert.deepEqual(r.queryIds, USERNAME_QUERY_IDS);
    });

    it('source parser extracts a complete ID set from the local file (same regex path)', async () => {
        const src = await readFile(new URL('../lib/Socket/username.js', import.meta.url), 'utf-8');
        const block = src.match(/USERNAME_QUERY_IDS\s*=\s*\{([\s\S]*?)\}/)?.[1];
        assert.ok(block, 'block found');
        const fresh = {};
        for (const m of block.matchAll(/([A-Z_]+)\s*:\s*'(\d+)'/g)) {
            fresh[m[1]] = m[2];
        }
        const { USERNAME_QUERY_IDS } = await import('../lib/Socket/username.js');
        for (const key of Object.keys(USERNAME_QUERY_IDS)) {
            assert.equal(fresh[key], USERNAME_QUERY_IDS[key], key);
        }
    });

    it('autoRotateQueryIds is a declared SocketConfig option', async () => {
        const dts = await readFile(new URL('../lib/Types/Socket.d.ts', import.meta.url), 'utf-8');
        assert.match(dts, /autoRotateQueryIds\?\s*:\s*boolean/);
        const impl = await readFile(new URL('../lib/Socket/username.js', import.meta.url), 'utf-8');
        assert.match(impl, /config\?\.autoRotateQueryIds/);
        // overrides must be re-applied on top of the fetched set
        assert.match(impl, /Object\.assign\(queryIds,\s*fresh,\s*config\?\.usernameQueryIds/);
    });
});

describe('Context.reply string normalization', () => {
    it('normalizes a plain string into { text } before sending', async () => {
        const { Context } = await import('../lib/Framework/Context.js');
        const sent = [];
        const fakeBot = {
            sendMessage: async (jid, content, options) => {
                sent.push({ jid, content, options });
            }
        };
        const msg = { key: { remoteJid: '628123@s.whatsapp.net' }, message: { conversation: 'yo' } };
        const ctx = new Context(fakeBot, msg);
        await ctx.reply('hello world');
        assert.equal(sent.length, 1);
        assert.deepEqual(sent[0].content, { text: 'hello world' });
        assert.equal(sent[0].options.quoted, msg);
        // object content must pass through untouched
        await ctx.reply({ text: 'obj', mentions: [] });
        assert.deepEqual(sent[1].content, { text: 'obj', mentions: [] });
    });
});

describe('Framework .d.ts typing quality', () => {
    it('Bot.d.ts uses real types (SocketConfig/AnyMessageContent/ILogger), not bare any', async () => {
        const dts = await readFile(new URL('../lib/Framework/Bot.d.ts', import.meta.url), 'utf-8');
        assert.match(dts, /Partial<SocketConfig>/);
        assert.match(dts, /AnyMessageContent/);
        assert.match(dts, /ILogger/);
        assert.match(dts, /QueuedMessage/);
        assert.ok(!/socketConfig\?\s*:\s*any/.test(dts), 'socketConfig no longer any');
    });

    it('SQLiteStore.d.ts does not import types from the optional better-sqlite3 package', async () => {
        const dts = await readFile(new URL('../lib/Framework/Store/SQLiteStore.d.ts', import.meta.url), 'utf-8');
        assert.ok(!/^\s*import\s.+from\s+'better-sqlite3'/m.test(dts), 'no hard type dependency on optional dep');
        assert.match(dts, /SQLiteDatabaseLike/);
    });
});
