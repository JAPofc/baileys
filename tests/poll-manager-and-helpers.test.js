import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'crypto';
import {
    createPollManager,
    partition, zip,
    formatCountdown,
    wordCount, ellipsisMiddle,
    jidType,
    randomString,
    isNumeric,
    firstEmoji,
    maskJid
} from '../lib/index.js';

const hashOf = (name) => createHash('sha256').update(Buffer.from(name)).digest(); // raw Buffer, like WA sends

describe('createPollManager', () => {
    const pollMsg = { key: { id: 'POLL1', remoteJid: 'g@g.us', fromMe: true }, message: { pollCreationMessage: { options: [{ optionName: 'Pizza' }, { optionName: 'Sushi' }, { optionName: 'Salad' }], selectableOptionsCount: 1 } } };

    it('registers and tallies votes by option name', () => {
        const p = createPollManager();
        assert.equal(p.register(pollMsg), 'POLL1');
        assert.equal(p.has('POLL1'), true);
        p.applyVote('POLL1', 'a@s.whatsapp.net', ['Pizza']);
        p.applyVote('POLL1', 'b@s.whatsapp.net', ['Sushi']);
        p.applyVote('POLL1', 'c@s.whatsapp.net', ['Pizza']);
        const t = p.tally('POLL1');
        assert.deepEqual(t.map(r => [r.name, r.count]), [['Pizza', 2], ['Sushi', 1], ['Salad', 0]]);
        assert.deepEqual(p.winner('POLL1'), { winners: ['Pizza'], count: 2 });
        assert.equal(p.totalVoters('POLL1'), 3);
    });

    it('a voter changing their mind is counted once (latest wins)', () => {
        const p = createPollManager();
        p.register(pollMsg);
        p.applyVote('POLL1', 'a@s.whatsapp.net', ['Pizza']);
        p.applyVote('POLL1', 'a@s.whatsapp.net', ['Sushi']); // changed
        const t = p.tally('POLL1');
        assert.equal(t.find(r => r.name === 'Pizza').count, 0);
        assert.equal(t.find(r => r.name === 'Sushi').count, 1);
        assert.equal(p.totalVoters('POLL1'), 1);
        assert.deepEqual(p.getVoterChoice('POLL1', 'a@s.whatsapp.net'), ['Sushi']);
    });

    it('accepts raw sha256 hash buffers (as WhatsApp sends) and empty selection retracts', () => {
        const p = createPollManager();
        p.register(pollMsg);
        p.applyUpdate('POLL1', { pollUpdateMessageKey: { participant: 'x@s.whatsapp.net', fromMe: false }, vote: { selectedOptions: [hashOf('Salad')] } });
        assert.equal(p.tally('POLL1').find(r => r.name === 'Salad').count, 1);
        p.applyVote('POLL1', 'x@s.whatsapp.net', []); // retract
        assert.equal(p.totalVoters('POLL1'), 0);
        assert.equal(p.winner('POLL1'), null);
    });

    it('renders a bar chart and handles unknown polls gracefully', () => {
        const p = createPollManager();
        p.register(pollMsg);
        p.applyVote('POLL1', 'a', ['Pizza']);
        assert.match(p.render('POLL1'), /Pizza[\s\S]*100%/);
        assert.equal(p.applyVote('NOPE', 'a', ['x']), null);
        assert.deepEqual(p.tally('NOPE'), []);
    });
});

describe('array helpers', () => {
    it('partition splits by predicate', () => {
        assert.deepEqual(partition([1, 2, 3, 4], n => n % 2 === 0), [[2, 4], [1, 3]]);
    });
    it('zip stops at the shortest', () => {
        assert.deepEqual(zip([1, 2, 3], ['a', 'b']), [[1, 'a'], [2, 'b']]);
        assert.deepEqual(zip(), []);
    });
});

describe('formatCountdown', () => {
    it('formats HH:MM:SS and days', () => {
        assert.equal(formatCountdown(0), '00:00:00');
        assert.equal(formatCountdown(-5000), '00:00:00');
        assert.equal(formatCountdown((1 * 3600 + 2 * 60 + 3) * 1000), '01:02:03');
        assert.equal(formatCountdown((25 * 3600) * 1000), '1d 01:00:00');
    });
});

describe('text helpers', () => {
    it('wordCount', () => {
        assert.equal(wordCount('  hello   world  '), 2);
        assert.equal(wordCount(''), 0);
    });
    it('ellipsisMiddle keeps both ends', () => {
        assert.equal(ellipsisMiddle('abcdefgh', 5), 'ab…gh');
        assert.equal(ellipsisMiddle('short', 20), 'short');
    });
});

describe('jidType', () => {
    it('classifies servers', () => {
        assert.equal(jidType('628@s.whatsapp.net'), 'user');
        assert.equal(jidType('123@g.us'), 'group');
        assert.equal(jidType('status@broadcast'), 'status');
        assert.equal(jidType('1@newsletter'), 'newsletter');
        assert.equal(jidType('9@lid'), 'lid');
        assert.equal(jidType('nope'), 'unknown');
    });
});

describe('randomString', () => {
    it('respects length and alphabet with injectable RNG', () => {
        assert.equal(randomString(8).length, 8);
        assert.equal(randomString(5, 'AB', { random: () => 0 }), 'AAAAA');
        assert.equal(randomString(0), '');
    });
});

describe('isNumeric', () => {
    it('validates numbers and numeric strings', () => {
        assert.equal(isNumeric(12), true);
        assert.equal(isNumeric(' 12.5 '), true);
        assert.equal(isNumeric(''), false);
        assert.equal(isNumeric('1a'), false);
        assert.equal(isNumeric(NaN), false);
    });
});

describe('firstEmoji', () => {
    it('returns the first emoji or null', () => {
        assert.equal(firstEmoji('hi 😀 there 🎉'), '😀');
        assert.equal(firstEmoji('no emoji'), null);
    });
});

describe('maskJid', () => {
    it('masks the user part but keeps the server', () => {
        const masked = maskJid('628123456789@s.whatsapp.net');
        assert.match(masked, /^628\*+89@s\.whatsapp\.net$/);
        assert.equal(maskJid('12@g.us'), '**@g.us');
        assert.equal(maskJid('nojid'), 'nojid');
    });
});
