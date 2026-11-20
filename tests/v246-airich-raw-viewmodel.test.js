// Tests for the v2.4.6 AIRich raw/custom view_model escape hatches
// (addViewModel / addRawPrimitive / AIRich.primitive), the RichAI brand alias,
// and the META_RICH_PREFIX protocol constant.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const makeStubClient = () => ({
    logger: { warn() {}, info() {}, debug() {} },
    user: { id: '628000000000@s.whatsapp.net' },
    async sendMessage() {},
    async relayMessage() {}
});

describe('RichAI brand alias + META_RICH_PREFIX', () => {
    it('RichAI is the same class as AIRich, exported from the root barrel', async () => {
        const { AIRich, RichAI, META_RICH_PREFIX } = await import('../lib/index.js');
        assert.equal(RichAI, AIRich, 'RichAI === AIRich');
        assert.equal(META_RICH_PREFIX, 'GenAI', 'Meta protocol prefix is preserved on the wire');
        const r = new RichAI(makeStubClient());
        assert.ok(typeof r.addViewModel === 'function');
    });
});

describe('AIRich.primitive() spec coercion', () => {
    it('string → markdown text primitive with the Meta prefix', async () => {
        const { AIRich } = await import('../lib/Builders/index.js');
        const p = AIRich.primitive('hello');
        assert.equal(p.__typename, 'GenAIMarkdownTextUXPrimitive');
        assert.equal(p.text, 'hello');
    });
    it('bare typename gets the Meta prefix; fully-qualified is left as-is', async () => {
        const { AIRich } = await import('../lib/Builders/index.js');
        assert.equal(AIRich.primitive({ typename: 'SpacerPrimitive' }).__typename, 'GenAISpacerPrimitive');
        assert.equal(AIRich.primitive({ __typename: 'GenAIDividerPrimitive' }).__typename, 'GenAIDividerPrimitive');
    });
    it('preserves arbitrary props and passes through prefix-less objects', async () => {
        const { AIRich } = await import('../lib/Builders/index.js');
        const p = AIRich.primitive({ typename: 'FooPrimitive', a: 1, b: 'x' });
        assert.deepEqual(p, { a: 1, b: 'x', __typename: 'GenAIFooPrimitive' });
        assert.deepEqual(AIRich.primitive({ a: 1 }), { a: 1 });
        assert.equal(AIRich.primitive(null), null);
    });
});

describe('AIRich.addViewModel (raw custom view_model)', () => {
    it('array of specs → primitives; bare typename gets prefixed', async () => {
        const { AIRich } = await import('../lib/Builders/index.js');
        const rich = new AIRich(makeStubClient());
        const ret = rich.addViewModel('HStackLayoutViewModel', ['a', { typename: 'SpacerPrimitive' }], { fallback: 'hi' });
        assert.equal(ret, rich, 'chainable');
        const vm = rich._sections.at(-1).view_model;
        assert.equal(vm.__typename, 'GenAIHStackLayoutViewModel');
        assert.deepEqual(vm.primitives.map(p => p.__typename), [
            'GenAIMarkdownTextUXPrimitive', 'GenAISpacerPrimitive'
        ]);
        assert.equal(rich._submessages.at(-1).messageText, 'hi', 'fallback submessage pushed');
    });

    it('single spec → primitive (not primitives); merges extra + viewModel fields', async () => {
        const { AIRich } = await import('../lib/Builders/index.js');
        const rich = new AIRich(makeStubClient());
        rich.addViewModel('SingleLayoutViewModel', { typename: 'CustomThing', foo: 1 }, {
            extra: { section_id: 's1' },
            viewModel: { layout_hint: 'wide' }
        });
        const section = rich._sections.at(-1);
        assert.equal(section.section_id, 's1');
        assert.equal(section.view_model.layout_hint, 'wide');
        assert.equal(section.view_model.primitive.__typename, 'GenAICustomThing');
        assert.equal(section.view_model.primitive.foo, 1);
        assert.equal(section.view_model.primitives, undefined);
    });

    it('accepts a fully-qualified typename without double-prefixing', async () => {
        const { AIRich } = await import('../lib/Builders/index.js');
        const rich = new AIRich(makeStubClient());
        rich.addViewModel('GenAIActionRowLayoutViewModel', ['x']);
        assert.equal(rich._sections.at(-1).view_model.__typename, 'GenAIActionRowLayoutViewModel');
    });

    it('validates typename and empty primitive arrays', async () => {
        const { AIRich } = await import('../lib/Builders/index.js');
        const rich = new AIRich(makeStubClient());
        assert.throws(() => rich.addViewModel('', ['x']), /typename must be a non-empty string/);
        assert.throws(() => rich.addViewModel('XLayoutViewModel', []), /at least one valid primitive/);
    });
});

describe('AIRich.addRawPrimitive', () => {
    it('wraps one raw primitive in a SingleLayoutViewModel', async () => {
        const { AIRich } = await import('../lib/Builders/index.js');
        const rich = new AIRich(makeStubClient());
        rich.addRawPrimitive('FancyNewPrimitive', { headline: 'Hi', count: 3 });
        const vm = rich._sections.at(-1).view_model;
        assert.equal(vm.__typename, 'GenAISingleLayoutViewModel');
        assert.equal(vm.primitive.__typename, 'GenAIFancyNewPrimitive');
        assert.equal(vm.primitive.headline, 'Hi');
        assert.equal(vm.primitive.count, 3);
    });

    it('a raw custom primitive is read back by readRichMessage as an unknown block', async () => {
        const { AIRich } = await import('../lib/Builders/index.js');
        const { readRichMessage } = await import('../lib/index.js');
        const built = await new AIRich(makeStubClient())
            .addRawPrimitive('TotallyNewPrimitive', { data: 'z' })
            .build({});
        const parsed = readRichMessage(built);
        assert.equal(parsed.found, true);
        const unknown = parsed.blocks.find(b => b.type === 'unknown');
        assert.ok(unknown, 'unrecognized primitive surfaces as an unknown block');
        assert.equal(unknown.typename, 'GenAITotallyNewPrimitive');
    });
});
