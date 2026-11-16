// Tests for the v2.4.6 AIRich additions: addHStack() / addVStack() layout
// primitives, plus a regression lock on the GenAITableUXPrimitive typename fix
// (was the mis-spelled GenATableUXPrimitive, which blocked native table render).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const makeStubClient = () => ({
    logger: { warn() {}, info() {}, debug() {} },
    user: { id: '628000000000@s.whatsapp.net' },
    async sendMessage() {},
    async relayMessage() {}
});

describe('AIRich.addHStack / addVStack', () => {
    it('addHStack emits GenAIHStackLayoutViewModel with a primitives array', async () => {
        const { AIRich } = await import('../lib/Builders/index.js');
        const rich = new AIRich(makeStubClient());
        const ret = rich.addHStack(['left', 'right']);
        assert.equal(ret, rich, 'chainable');
        const vm = rich._sections.at(-1).view_model;
        assert.equal(vm.__typename, 'GenAIHStackLayoutViewModel');
        assert.equal(vm.primitives.length, 2);
        assert.deepEqual(vm.primitives.map(p => p.__typename), [
            'GenAIMarkdownTextUXPrimitive', 'GenAIMarkdownTextUXPrimitive'
        ]);
        assert.equal(vm.primitives[0].text, 'left');
    });

    it('addVStack emits GenAIVStackLayoutViewModel', async () => {
        const { AIRich } = await import('../lib/Builders/index.js');
        const rich = new AIRich(makeStubClient());
        rich.addVStack([{ text: 'Title', heading: true }, { text: 'body' }]);
        const vm = rich._sections.at(-1).view_model;
        assert.equal(vm.__typename, 'GenAIVStackLayoutViewModel');
        assert.equal(vm.primitives[0].text, '# Title', 'heading prefixes #');
        assert.equal(vm.primitives[1].text, 'body');
    });

    it('coerces mixed item specs (image / spacer / divider / raw primitive)', async () => {
        const { AIRich } = await import('../lib/Builders/index.js');
        const rich = new AIRich(makeStubClient());
        rich.addHStack([
            { image: 'https://x/y.jpg', tapLinkUrl: 'https://x', alignment: 'start' },
            { spacer: true },
            { divider: true },
            { primitive: { __typename: 'GenAICustomThing', foo: 1 } }
        ]);
        const prims = rich._sections.at(-1).view_model.primitives;
        assert.deepEqual(prims.map(p => p.__typename), [
            'GenAIInlineImageUXPrimitive', 'GenAISpacerPrimitive',
            'GenAIDividerPrimitive', 'GenAICustomThing'
        ]);
        assert.equal(prims[0].image_url, 'https://x/y.jpg');
        assert.equal(prims[0].tap_link_url, 'https://x');
        assert.equal(prims[0].alignment, 'start');
    });

    it('drops null/invalid items and throws when nothing valid remains', async () => {
        const { AIRich } = await import('../lib/Builders/index.js');
        const rich = new AIRich(makeStubClient());
        rich.addHStack(['ok', null, {}, { nope: true }]);
        assert.equal(rich._sections.at(-1).view_model.primitives.length, 1);
        assert.throws(() => rich.addVStack([null, {}]), /at least one valid item/);
        assert.throws(() => rich.addHStack('notarray'), /must be an array/);
    });

    it('pushes a plain-text submessage fallback from item text', async () => {
        const { AIRich } = await import('../lib/Builders/index.js');
        const rich = new AIRich(makeStubClient());
        const before = rich._submessages.length;
        rich.addHStack(['hello', { text: 'world' }, { spacer: true }]);
        assert.equal(rich._submessages.length, before + 1);
        assert.equal(rich._submessages.at(-1).messageText, 'hello world');
    });

    it('stack children are read back by readRichMessage (reader walks primitives)', async () => {
        const { AIRich } = await import('../lib/Builders/index.js');
        const { readRichMessage } = await import('../lib/index.js');
        const built = await new AIRich(makeStubClient())
            .addVStack([{ text: 'Alpha', heading: true }, 'Beta'])
            .build({});
        const parsed = readRichMessage(built);
        assert.equal(parsed.found, true);
        const texts = parsed.blocks.filter(b => b.type === 'text' || b.type === 'heading').map(b => b.text);
        assert.ok(texts.some(t => t.includes('Beta')), 'child markdown read back');
    });
});

describe('AIRich table typename fix (GenAITableUXPrimitive)', () => {
    it('addTable emits the correctly-spelled GenAI (not GenA) typename', async () => {
        const { AIRich } = await import('../lib/Builders/index.js');
        const rich = new AIRich(makeStubClient());
        rich.addTable([['H1', 'H2'], ['a', 'b']]);
        const vm = rich._sections.at(-1).view_model;
        assert.equal(vm.primitive.__typename, 'GenAITableUXPrimitive');
        assert.notEqual(vm.primitive.__typename, 'GenATableUXPrimitive');
    });

    it('reader parses the correctly-named table primitive into a table block', async () => {
        const { AIRich } = await import('../lib/Builders/index.js');
        const { readRichMessage } = await import('../lib/index.js');
        const built = await new AIRich(makeStubClient())
            .addTable([['H1', 'H2'], ['x', 'y']])
            .build({});
        const parsed = readRichMessage(built);
        assert.equal(parsed.found, true);
        const table = parsed.blocks.find(b => b.type === 'table');
        assert.ok(table, 'table block parsed from correctly-named primitive');
        assert.deepEqual(table.rows[0], ['H1', 'H2']);
    });
});
