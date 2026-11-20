import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// readRichMessage — the reader counterpart to the AIRich builder.
// Proven by full roundtrip: build a card with our own builder, parse it back,
// assert every block survives.

const makeStubClient = () => ({
    logger: { warn() { }, info() { }, debug() { } },
    user: { id: '628000000000@s.whatsapp.net' },
    async sendMessage() { },
    async relayMessage() { }
});

describe('readRichMessage roundtrip (unified response path)', () => {
    it('parses every core block type back out of a built card', async () => {
        const { AIRich } = await import('../lib/Builders/index.js');
        const { readRichMessage } = await import('../lib/index.js');
        const built = await new AIRich(makeStubClient())
            .addHeading('Head')
            .addText('Body [link](https://x.com)')
            .addCode('python', 'x = 1')
            .addTable([['A', 'B'], ['1', '2']])
            .addDivider()
            .addSuggest('Tap me')
            .addLatex('E = mc^2')
            .build({});

        const r = readRichMessage(built);
        assert.equal(r.found, true);
        assert.deepEqual(r.blocks.map((b) => b.type), ['heading', 'text', 'code', 'table', 'divider', 'suggestion', 'latex']);
        assert.equal(r.blocks[0].text, 'Head');
        // inline link entity marker resolved back to readable markdown
        assert.equal(r.blocks[1].text, 'Body [link](https://x.com)');
        assert.equal(r.blocks[1].entities[0].url, 'https://x.com');
        // code re-joined from syntax-highlight spans
        assert.equal(r.blocks[2].language, 'python');
        assert.equal(r.blocks[2].code, 'x = 1');
        // table rows + header detection
        assert.deepEqual(r.blocks[3].rows, [['A', 'B'], ['1', '2']]);
        assert.deepEqual(r.blocks[3].headerRows, [0]);
        assert.deepEqual(r.suggestions, ['Tap me']);
        assert.equal(r.blocks[6].expression, 'E = mc^2');
        assert.ok(r.responseId, 'unified response_id extracted');
        assert.ok(r.botResponseId, 'botMetadata.botResponseId extracted');
    });

    it('renders a flat text version of the card', async () => {
        const { AIRich } = await import('../lib/Builders/index.js');
        const { readRichMessage } = await import('../lib/index.js');
        const built = await new AIRich(makeStubClient())
            .addHeading('T')
            .addCode('js', 'a=1')
            .addTable([['X'], ['9']])
            .build({});
        const r = readRichMessage(built);
        assert.match(r.text, /# T/);
        assert.match(r.text, /```js\na=1\n```/);
        assert.match(r.text, /X\n9/);
    });

    it('accepts a full WebMessageInfo wrapper', async () => {
        const { AIRich } = await import('../lib/Builders/index.js');
        const { readRichMessage } = await import('../lib/index.js');
        const built = await new AIRich(makeStubClient()).addText('hi').build({});
        const r = readRichMessage({ key: { id: 'ABC', remoteJid: 'a@s.whatsapp.net' }, message: built });
        assert.equal(r.found, true);
        assert.equal(r.blocks[0].text, 'hi');
    });
});

describe('readRichMessage fallback (proto submessages path)', () => {
    it('parses text/code/table from submessages when unifiedResponse is absent', async () => {
        const { AIRich } = await import('../lib/Builders/index.js');
        const { readRichMessage } = await import('../lib/index.js');
        const built = await new AIRich(makeStubClient())
            .addText('Only submsg')
            .addCode('js', 'a=1')
            .addTable([['X'], ['9']])
            .build({ includesUnifiedResponse: false });
        const r = readRichMessage(built);
        assert.equal(r.found, true);
        assert.deepEqual(r.blocks.map((b) => b.type), ['text', 'code', 'table']);
        assert.equal(r.blocks[0].text, 'Only submsg');
        assert.equal(r.blocks[1].code, 'a=1');
        assert.deepEqual(r.blocks[2].rows, [['X'], ['9']]);
    });
});

describe('readRichMessage safety', () => {
    it('returns found:false for non-rich input and never throws', async () => {
        const { readRichMessage } = await import('../lib/index.js');
        assert.equal(readRichMessage(null).found, false);
        assert.equal(readRichMessage(undefined).found, false);
        assert.equal(readRichMessage('nope').found, false);
        assert.equal(readRichMessage({ conversation: 'plain text' }).found, false);
        assert.equal(readRichMessage({ message: { extendedTextMessage: { text: 'x' } } }).found, false);
        // corrupt base64 in unifiedResponse falls back gracefully
        const r = readRichMessage({ richResponseMessage: { unifiedResponse: { data: '!!!not-base64!!!' }, submessages: [{ messageType: 2, messageText: 'fallback works' }] } });
        assert.equal(r.found, true);
        assert.equal(r.blocks[0].text, 'fallback works');
    });

    it('unknown primitives are preserved, not dropped', async () => {
        const { readRichMessage } = await import('../lib/index.js');
        const unified = { response_id: 'r1', sections: [{ view_model: { primitive: { __typename: 'GenAISomethingNewPrimitive', mystery: 1 } } }] };
        const data = Buffer.from(JSON.stringify(unified)).toString('base64');
        const r = readRichMessage({ richResponseMessage: { unifiedResponse: { data } } });
        assert.equal(r.found, true);
        assert.equal(r.blocks[0].type, 'unknown');
        assert.equal(r.blocks[0].typename, 'GenAISomethingNewPrimitive');
        assert.equal(r.blocks[0].raw.mystery, 1);
    });

    it('is exported from the barrel with its types', async () => {
        const m = await import('../lib/index.js');
        assert.equal(typeof m.readRichMessage, 'function');
        const { readFile } = await import('node:fs/promises');
        const dts = await readFile(new URL('../lib/Utils/rich-reader.d.ts', import.meta.url), 'utf-8');
        assert.match(dts, /export function readRichMessage\(msg: any\): ReadRichMessageResult;/);
    });
});
