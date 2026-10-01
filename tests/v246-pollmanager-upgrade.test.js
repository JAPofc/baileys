// Upgrade: poll-manager gains close/reopen/isOpen (freeze voting),
// selectableCount enforcement, and getVotersFor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPollManager } from '../lib/Utils/poll-manager.js';

const mkPoll = (id, values, selectableCount = 0) => ({
    key: { id, fromMe: true },
    message: { pollCreationMessage: { options: values.map(v => ({ optionName: v })), selectableOptionsCount: selectableCount } }
});

test('poll-manager upgrade: close freezes voting, reopen resumes', () => {
    const pm = createPollManager();
    const id = pm.register(mkPoll('p1', ['Pizza', 'Sushi']));
    pm.applyVote(id, 'a@s', ['Pizza']);
    assert.equal(pm.isOpen(id), true);

    assert.equal(pm.close(id), true);
    assert.equal(pm.isOpen(id), false);
    // votes after close are ignored
    pm.applyVote(id, 'b@s', ['Sushi']);
    assert.equal(pm.totalVoters(id), 1, 'closed poll ignored the new vote');
    // an existing voter can't change their pick either
    pm.applyVote(id, 'a@s', ['Sushi']);
    assert.deepEqual(pm.getVoterChoice(id, 'a@s'), ['Pizza']);

    assert.equal(pm.reopen(id), true);
    pm.applyVote(id, 'b@s', ['Sushi']);
    assert.equal(pm.totalVoters(id), 2, 'reopened poll accepts votes again');

    assert.equal(pm.close('nope'), false);
    assert.equal(pm.isOpen('nope'), false);
});

test('poll-manager upgrade: selectableCount caps recorded picks', () => {
    const pm = createPollManager();
    const id = pm.register(mkPoll('p2', ['A', 'B', 'C'], 1)); // single-select
    // an over-selection (e.g. malformed client) records only the first, in poll order
    pm.applyVote(id, 'a@s', ['B', 'C']);
    assert.deepEqual(pm.getVoterChoice(id, 'a@s'), ['B']);

    // multi-select poll: within the limit is untouched
    const id2 = pm.register(mkPoll('p3', ['A', 'B', 'C'], 2));
    pm.applyVote(id2, 'a@s', ['A', 'C']);
    assert.deepEqual(pm.getVoterChoice(id2, 'a@s'), ['A', 'C']);
    // over the limit → capped to first 2 in poll order
    pm.applyVote(id2, 'b@s', ['C', 'B', 'A']);
    assert.deepEqual(pm.getVoterChoice(id2, 'b@s'), ['A', 'B']);
});

test('poll-manager upgrade: getVotersFor by name and by index', () => {
    const pm = createPollManager();
    const id = pm.register(mkPoll('p4', ['Pizza', 'Sushi']));
    pm.applyVote(id, 'a@s', ['Pizza']);
    pm.applyVote(id, 'b@s', ['Pizza']);
    pm.applyVote(id, 'c@s', ['Sushi']);

    assert.deepEqual(pm.getVotersFor(id, 'Pizza').sort(), ['a@s', 'b@s']);
    assert.deepEqual(pm.getVotersFor(id, 0).sort(), ['a@s', 'b@s']); // index 0 = Pizza
    assert.deepEqual(pm.getVotersFor(id, 1), ['c@s']);               // index 1 = Sushi
    assert.deepEqual(pm.getVotersFor(id, 'Unknown'), []);
    assert.deepEqual(pm.getVotersFor('missing', 0), []);
});
