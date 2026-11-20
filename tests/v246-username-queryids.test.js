// Tests for the v2.4.6 username query_id rotation upgrades.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    USERNAME_QUERY_IDS,
    parseUsernameQueryIds,
    fetchLatestUsernameQueryIds
} from '../lib/Socket/username.js';

test('parseUsernameQueryIds extracts a complete id map', () => {
    const src = `
        export const USERNAME_QUERY_IDS = {
            CHECK: '11111111111111111', // UsernameCheck
            CHECK_MULTI: '22222222222222222',
            SET: '33333333333333333',
            GET: '44444444444444444',
            GET_RECOMMENDATIONS: '55555555555555555',
            PIN_SET: '66666666666666666'
        };
    `;
    const parsed = parseUsernameQueryIds(src);
    assert.equal(parsed.CHECK, '11111111111111111');
    assert.equal(parsed.PIN_SET, '66666666666666666');
    // every key the pinned set has must be present
    assert.deepEqual(Object.keys(parsed).sort(), Object.keys(USERNAME_QUERY_IDS).sort());
});

test('parseUsernameQueryIds returns null for incomplete/missing blocks', () => {
    assert.equal(parseUsernameQueryIds("USERNAME_QUERY_IDS = { CHECK: '123' }"), null);
    assert.equal(parseUsernameQueryIds('no block here at all'), null);
    assert.equal(parseUsernameQueryIds(''), null);
    assert.equal(parseUsernameQueryIds(undefined), null);
});

test('fetchLatestUsernameQueryIds never throws and always returns a complete set', async () => {
    // Force a fast failure path (unreachable host) so the test is offline-safe.
    const res = await fetchLatestUsernameQueryIds({ timeoutMs: 1 });
    assert.ok(res && typeof res.isLatest === 'boolean');
    assert.deepEqual(Object.keys(res.queryIds).sort(), Object.keys(USERNAME_QUERY_IDS).sort());
    // JAP@Fix (Batch CN): the only real assertion here used to sit behind `if (!res.isLatest)`.
    // That is the offline path -- which is what CI hits, so it normally ran -- but on a machine
    // that CAN reach the endpoint the whole check was skipped silently. Assert on both paths.
    for (const [name, id] of Object.entries(res.queryIds)) {
        assert.match(String(id), /^\d{6,}$/, `${name} must be a numeric query id, got ${id}`);
    }
    if (!res.isLatest) {
        assert.deepEqual(res.queryIds, USERNAME_QUERY_IDS, 'the fallback path must return the pinned defaults verbatim');
    }
    // (no extra assertion for the isLatest path: the result carries no provenance field to
    // check, and fresh ids may legitimately equal the pinned ones. The unconditional checks
    // above -- complete key set, every value numeric -- are what holds on BOTH paths.)
});
