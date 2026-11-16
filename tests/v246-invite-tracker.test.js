// Fix: a duplicate/replayed 'add' for a still-present member double-credited
//   the inviter (double invite reward + impossible active > 1).
// Upgrade: cross-chat aggregation — getGlobalCount / getGlobalLeaderboard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInviteTracker } from '../lib/Utils/invite-tracker.js';

const add = (id, author, ...members) => ({ id, action: 'add', author, participants: members });
const remove = (id, author, ...members) => ({ id, action: 'remove', author, participants: members });

test('invite-tracker fix: duplicate add of a present member is not re-credited', () => {
    const it = createInviteTracker();
    let rewards = 0;
    it.onInvite(() => rewards++);

    it.handler(add('g@g.us', 'A@s', 'B@s'));
    it.handler(add('g@g.us', 'A@s', 'B@s')); // replayed/duplicate event
    assert.equal(rewards, 1, 'onInvite fires once for one real membership');
    assert.deepEqual(it.getCount('g@g.us', 'A@s'), { total: 1, active: 1 });

    // a genuine re-add AFTER a leave still credits again
    it.handler(remove('g@g.us', 'A@s', 'B@s'));
    it.handler(add('g@g.us', 'A@s', 'B@s'));
    assert.equal(rewards, 2, 're-add after leave credits again');
    assert.deepEqual(it.getCount('g@g.us', 'A@s'), { total: 2, active: 1 }, 'active reflects single current membership');
});

test('invite-tracker fix: someone already present cannot be re-attributed to another inviter', () => {
    const it = createInviteTracker();
    it.handler(add('g@g.us', 'A@s', 'B@s'));
    it.handler(add('g@g.us', 'C@s', 'B@s')); // B already present — no-op
    assert.equal(it.getInviter('g@g.us', 'B@s'), 'A@s');
    assert.deepEqual(it.getCount('g@g.us', 'C@s'), { total: 0, active: 0 });
});

test('invite-tracker upgrade: getGlobalCount / getGlobalLeaderboard aggregate across chats', () => {
    const it = createInviteTracker();
    it.handler(add('g1@g.us', 'A@s', 'x@s', 'y@s')); // A: +2 in g1
    it.handler(add('g2@g.us', 'A@s', 'z@s'));        // A: +1 in g2
    it.handler(add('g1@g.us', 'B@s', 'w@s'));        // B: +1 in g1
    it.handler(remove('g2@g.us', 'A@s', 'z@s'));     // A active -1 (total stays)

    assert.deepEqual(it.getGlobalCount('A@s'), { total: 3, active: 2 });
    assert.deepEqual(it.getGlobalCount('B@s'), { total: 1, active: 1 });
    assert.deepEqual(it.getGlobalCount('nobody@s'), { total: 0, active: 0 });

    const board = it.getGlobalLeaderboard();
    assert.equal(board[0].inviter, 'A@s');
    assert.deepEqual(board[0], { inviter: 'A@s', total: 3, active: 2 });
    assert.equal(board[1].inviter, 'B@s');
    assert.equal(board.length, 2);
});
