// Tests for createPollManager (poll-manager) — stateful, dedup-by-voter poll
// tallying. Previously uncovered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createPollManager } from '../lib/Utils/poll-manager.js';

const hashName = (n) => createHash('sha256').update(Buffer.from(n)).digest('hex');

const sentPoll = (id = 'P1') => ({
    key: { id, fromMe: true },
    message: { pollCreationMessage: { options: [{ optionName: 'Pizza' }, { optionName: 'Sushi' }], selectableOptionsCount: 1 } }
});

test('register from a sent WAMessage returns the poll id', () => {
    const pm = createPollManager();
    assert.equal(pm.register(sentPoll('P1')), 'P1');
    assert.equal(pm.has('P1'), true);
    assert.deepEqual(pm.list(), ['P1']);
});

test('register from a plain { id, options } object; null without options', () => {
    const pm = createPollManager();
    assert.equal(pm.register({ id: 'P2', options: ['A', 'B'] }), 'P2');
    assert.equal(pm.register({ id: 'x' }), null);
    assert.equal(pm.register({ options: ['A'] }), null); // no id
});

test('a voter changing their mind is not double-counted', () => {
    const pm = createPollManager();
    pm.register(sentPoll('P1'));
    pm.applyVote('P1', 'a@s', ['Pizza']);
    pm.applyVote('P1', 'b@s', ['Sushi']);
    pm.applyVote('P1', 'a@s', ['Sushi']); // a switches
    const t = pm.tally('P1');
    assert.equal(t[0].count, 0); // Pizza
    assert.equal(t[1].count, 2); // Sushi
    assert.equal(pm.totalVoters('P1'), 2);
});

test('an empty selection retracts the vote', () => {
    const pm = createPollManager();
    pm.register(sentPoll('P1'));
    pm.applyVote('P1', 'a@s', ['Pizza']);
    pm.applyVote('P1', 'a@s', []);
    assert.equal(pm.totalVoters('P1'), 0);
    assert.deepEqual(pm.getVoterChoice('P1', 'a@s'), []);
});

test('votes accepted as option name, sha256 hex, or hash Buffer', () => {
    const pm = createPollManager();
    pm.register(sentPoll('P1'));
    pm.applyVote('P1', 'byName', ['Pizza']);
    pm.applyVote('P1', 'byHex', [hashName('Pizza')]);
    pm.applyVote('P1', 'byBuf', [Buffer.from(hashName('Pizza'), 'hex')]);
    assert.equal(pm.tally('P1')[0].count, 3);
});

test('winner reports leader; ties return every leader; null when no votes', () => {
    const pm = createPollManager();
    pm.register({ id: 'P2', options: ['A', 'B'] });
    assert.equal(pm.winner('P2'), null);
    pm.applyVote('P2', 'x', ['A']);
    pm.applyVote('P2', 'y', ['B']);
    const w = pm.winner('P2');
    assert.deepEqual(w.winners.sort(), ['A', 'B']);
    assert.equal(w.count, 1);
});

test('unknown polls are ignored, not thrown', () => {
    const pm = createPollManager();
    assert.equal(pm.applyVote('NOPE', 'z', ['A']), null);
    assert.equal(pm.winner('NOPE'), null);
    assert.deepEqual(pm.tally('NOPE'), []);
    assert.equal(pm.totalVoters('NOPE'), 0);
});

test('applyUpdate pulls voter + selection from a decrypted update', () => {
    const pm = createPollManager({ meId: 'me@s' });
    pm.register({ id: 'P3', options: ['A', 'B'] });
    pm.applyUpdate('P3', { voterJid: 'v@s', vote: { selectedOptions: ['A'] } });
    assert.equal(pm.tally('P3')[0].count, 1);
});

test('render produces one labelled bar per option', () => {
    const pm = createPollManager();
    pm.register({ id: 'P2', options: ['A', 'B'] });
    pm.applyVote('P2', 'x', ['A']);
    const out = pm.render('P2');
    assert.match(out, /A\n[█░]+ 1 \(100%\)/);
    assert.match(out, /B\n[█░]+ 0 \(0%\)/);
});

test('reset forgets one poll or all', () => {
    const pm = createPollManager();
    pm.register({ id: 'P1', options: ['A'] });
    pm.register({ id: 'P2', options: ['A'] });
    pm.reset('P1');
    assert.equal(pm.has('P1'), false);
    assert.equal(pm.has('P2'), true);
    pm.reset();
    assert.deepEqual(pm.list(), []);
});
