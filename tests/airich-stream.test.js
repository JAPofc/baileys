import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// AIRich.streamText — progressive "AI typing" reveal via EDIT protocolMessages.

const makeStubClient = () => {
    const relayed = [];
    return {
        relayed,
        logger: { warn() { }, info() { }, debug() { } },
        user: { id: '628000000000@s.whatsapp.net' },
        async sendMessage() { throw new Error('streamText must not send extra messages'); },
        async relayMessage(jid, msg, opts) { relayed.push({ jid, msg, opts }); return {}; }
    };
};

const TEXT = 'The quick brown fox jumps over the lazy dog and keeps running far away into the night woods.';

describe('AIRich.streamText', () => {
    it('sends once then patches the same bubble with EDIT protocolMessages', async () => {
        const { AIRich } = await import('../lib/Builders/index.js');
        const stub = makeStubClient();
        const rich = new AIRich(stub);
        const res = await rich.streamText('628xx@s.whatsapp.net', TEXT, { chunkSize: 30, intervalMs: 300 });

        assert.ok(stub.relayed.length >= 3, `expected >=3 relays, got ${stub.relayed.length}`);
        assert.equal(res.edits, stub.relayed.length - 1);

        const firstId = stub.relayed[0].opts.messageId;
        assert.ok(firstId, 'first send pins its own messageId');
        for (let i = 1; i < stub.relayed.length; i++) {
            const pm = stub.relayed[i].msg?.protocolMessage;
            assert.ok(pm, `relay ${i} is a protocolMessage`);
            assert.equal(pm.key?.id, firstId, `edit ${i} targets the original bubble`);
        }
        // returned key = the visible message, so sendEdit() keeps working afterwards
        assert.equal(res.key.id, firstId);
        assert.equal(res.text, TEXT);
    });

    it('never duplicates the streamed block and strips the cursor at the end', async () => {
        const { AIRich } = await import('../lib/Builders/index.js');
        const stub = makeStubClient();
        await new AIRich(stub).streamText('628xx@s.whatsapp.net', TEXT, { chunkSize: 30, intervalMs: 300 });

        const finalJson = JSON.stringify(stub.relayed[stub.relayed.length - 1].msg);
        const occurrences = (finalJson.match(/night woods\./g) || []).length;
        assert.equal(occurrences, 1, 'streamed text appears exactly once in the final edit');
        assert.ok(!finalJson.includes('\u258d'), 'cursor removed in the final edit');
    });

    it('single chunk needs no edits; array input streams chunk by chunk', async () => {
        const { AIRich } = await import('../lib/Builders/index.js');
        const one = makeStubClient();
        const r1 = await new AIRich(one).streamText('a@s.whatsapp.net', 'short', {});
        assert.equal(r1.edits, 0);
        assert.equal(one.relayed.length, 1);

        const arr = makeStubClient();
        const r2 = await new AIRich(arr).streamText('a@s.whatsapp.net', ['Hello ', 'World', '!'], { intervalMs: 300 });
        assert.equal(r2.text, 'Hello World!');
        assert.equal(r2.edits, 2);
    });

    it('validates its inputs', async () => {
        const { AIRich } = await import('../lib/Builders/index.js');
        const stub = makeStubClient();
        await assert.rejects(new AIRich(stub).streamText(undefined, 'x'), TypeError);
        await assert.rejects(new AIRich(stub).streamText('a@s.whatsapp.net', ''), TypeError);
    });

    it('word-boundary splitting never cuts a word in half', async () => {
        const { AIRich } = await import('../lib/Builders/index.js');
        const stub = makeStubClient();
        const words = 'alpha bravo charlie delta echo foxtrot golf hotel india juliett kilo lima';
        const res = await new AIRich(stub).streamText('a@s.whatsapp.net', words, { chunkSize: 20, intervalMs: 300 });
        assert.equal(res.text, words, 'reassembled text is byte-identical');
        // every intermediate reveal ends on a word boundary: the cursor is
        // always preceded by a space (chunks keep their trailing space), never
        // glued onto a half-word
        for (let i = 0; i < stub.relayed.length - 1; i++) {
            // JSON.stringify keeps non-ASCII chars literal, so the cursor char
            // is directly searchable in the serialized message
            const json = JSON.stringify(stub.relayed[i].msg);
            assert.ok(!/[a-z]\u258d/u.test(json), `relay ${i} must not end mid-word`);
        }
    });
});
