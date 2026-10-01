// Tests for the v2.4.5 AIRich additions: addSocialEntity() + addCompact().
// These build the reverse-engineered Meta-AI "social entity" / compact-card
// primitives (the same shapes used by igstalk-style profile-lookup bots).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const makeStubClient = () => ({
    logger: { warn() {}, info() {}, debug() {} },
    user: { id: '628000000000@s.whatsapp.net' },
    async sendMessage() {},
    async relayMessage() {}
});

// dig out the primitive(s) of the last pushed section, regardless of Single/Row layout
const lastPrimitives = (rich) => {
    const section = rich._sections[rich._sections.length - 1];
    const vm = section.view_model;
    return vm.primitive ? [vm.primitive] : vm.primitives;
};

describe('AIRich.addSocialEntity', () => {
    it('builds the captured GenAISocialEntityItem action-row shape', async () => {
        const { AIRich } = await import('../lib/Builders/index.js');
        const rich = new AIRich(makeStubClient());
        const ret = rich.addSocialEntity({
            username: 'jkt48.freya',
            full_name: 'Freya Jayawardana',
            picture_url: 'https://example.com/freya.jpg',
            url: 'https://www.instagram.com/jkt48.freya',
            is_verified: true
        });

        assert.equal(ret, rich, 'returns this for chaining');

        const section = rich._sections.at(-1);
        assert.equal(section.view_model.__typename, 'GenAIActionRowLayoutViewModel');

        const prims = section.view_model.primitives;
        // spacer, markdown-text, spacer
        assert.deepEqual(prims.map(p => p.__typename), [
            'GenAISpacerPrimitive',
            'GenAIMarkdownTextUXPrimitive',
            'GenAISpacerPrimitive'
        ]);

        const md = prims[1];
        assert.equal(md.text, '# {{social_entity_1}}See results{{/social_entity_1}}');
        const ent = md.inline_entities[0];
        assert.equal(ent.key, 'social_entity_1');
        assert.equal(ent.metadata.__typename, 'GenAISocialEntityItem');
        assert.equal(ent.metadata.entity_id, 'jkt48.freya');
        assert.equal(ent.metadata.entity_name, 'jkt48.freya');
        assert.equal(ent.metadata.entity_full_name, 'Freya Jayawardana');
        assert.equal(ent.metadata.entity_url, 'https://www.instagram.com/jkt48.freya');
        assert.equal(ent.metadata.entity_type, 'IG_PROFILE');
        assert.equal(ent.metadata.is_verified, true);

        // submessage text fallback pushed
        assert.ok(rich._submessages.some(s => s.messageText === 'See results'));
    });

    it('honors custom label, key, type, heading=false and verified alias', async () => {
        const { AIRich } = await import('../lib/Builders/index.js');
        const rich = new AIRich(makeStubClient());
        rich.addSocialEntity({
            username: 'meta',
            type: 'FB_PROFILE',
            label: 'View profile',
            key: 'ent_x',
            heading: false,
            verified: true
        });
        const md = rich._sections.at(-1).view_model.primitives[1];
        assert.equal(md.text, '{{ent_x}}View profile{{/ent_x}}'); // no leading "# "
        assert.equal(md.inline_entities[0].metadata.entity_type, 'FB_PROFILE');
        assert.equal(md.inline_entities[0].metadata.is_verified, true);
    });

    it('throws without a username / entity id', async () => {
        const { AIRich } = await import('../lib/Builders/index.js');
        const rich = new AIRich(makeStubClient());
        assert.throws(() => rich.addSocialEntity({}), /username/);
        assert.throws(() => rich.addSocialEntity([]), /plain object/);
    });
});

describe('AIRich.addCompact', () => {
    it('builds a compact card primitive with the captured fields', async () => {
        const { AIRich } = await import('../lib/Builders/index.js');
        const rich = new AIRich(makeStubClient());
        const ret = rich.addCompact({
            title: 'RennZSync ig stlak',
            subtitle: 'RennZSync',
            secondary_subtitle: '',
            image: 'https://example.com/logo.jpg',
            entity_id: 'jkt48.freya',
            entity_url: 'https://whatsapp.com/channel/xyz',
            entity_type: 'WEBSITE',
            action_type: 'OPEN_URL',
            is_verified: true
        });
        assert.equal(ret, rich);

        const prim = lastPrimitives(rich)[0];
        assert.equal(prim.__typename, 'GenAICompactCardPrimitive');
        assert.equal(prim.title, 'RennZSync ig stlak');
        assert.equal(prim.subtitle, 'RennZSync');
        assert.equal(prim.entity_url, 'https://whatsapp.com/channel/xyz');
        assert.equal(prim.entity_type, 'WEBSITE');
        assert.equal(prim.action_type, 'OPEN_URL');
        assert.equal(prim.is_verified, true);
        assert.ok(rich._submessages.some(s => s.messageText === 'RennZSync ig stlak'));
    });

    it('applies sensible defaults and requires a title', async () => {
        const { AIRich } = await import('../lib/Builders/index.js');
        const rich = new AIRich(makeStubClient());
        rich.addCompact({ title: 'Only title' });
        const prim = lastPrimitives(rich)[0];
        assert.equal(prim.entity_type, 'WEBSITE');
        assert.equal(prim.action_type, 'OPEN_URL');
        assert.equal(prim.is_verified, false);

        assert.throws(() => rich.addCompact({}), /title/);
        assert.throws(() => rich.addCompact('x'), /plain object/);
    });
});

describe('readRichMessage parity (build → read roundtrip)', () => {
    it('parses a compact card block back out', async () => {
        const { AIRich } = await import('../lib/Builders/index.js');
        const { readRichMessage } = await import('../lib/index.js');
        const built = await new AIRich(makeStubClient())
            .addCompact({
                title: 'RennZSync ig stlak',
                subtitle: 'RennZSync',
                image: 'https://example.com/logo.jpg',
                entity_url: 'https://whatsapp.com/channel/xyz',
                is_verified: true
            })
            .build({});

        const r = readRichMessage(built);
        assert.equal(r.found, true);
        const compact = r.blocks.find((b) => b.type === 'compact');
        assert.ok(compact, 'compact block parsed');
        assert.equal(compact.title, 'RennZSync ig stlak');
        assert.equal(compact.subtitle, 'RennZSync');
        assert.equal(compact.entityUrl, 'https://whatsapp.com/channel/xyz');
        assert.equal(compact.isVerified, true);
    });

    it('parses a social-entity embed back out and lists it in socialEntities', async () => {
        const { AIRich } = await import('../lib/Builders/index.js');
        const { readRichMessage } = await import('../lib/index.js');
        const built = await new AIRich(makeStubClient())
            .addSocialEntity({
                username: 'jkt48.freya',
                full_name: 'Freya Jayawardana',
                picture_url: 'https://example.com/freya.jpg',
                url: 'https://www.instagram.com/jkt48.freya',
                is_verified: true
            })
            .build({});

        const r = readRichMessage(built);
        assert.equal(r.found, true);
        assert.equal(r.socialEntities.length, 1);
        const se = r.socialEntities[0];
        assert.equal(se.type, 'IG_PROFILE');
        assert.equal(se.fullName, 'Freya Jayawardana');
        assert.equal(se.url, 'https://www.instagram.com/jkt48.freya');
        assert.equal(se.isVerified, true);
        // and the entity resolved into a markdown link inside the text block
        const textBlock = r.blocks.find((b) => b.type === 'text' && /See results/.test(b.text || ''));
        assert.ok(textBlock, 'social entity text block present');
        assert.ok(/\]\(https:\/\/www\.instagram\.com\/jkt48\.freya\)/.test(textBlock.text), 'resolved to a link');
    });
});

describe('AIRich.addProfileCard (v2.4.6 convenience)', () => {
    it('builds compact + divider + social-entity in one call', async () => {
        const { AIRich } = await import('../lib/Builders/index.js');
        const rich = new AIRich(makeStubClient());
        const ret = rich.addProfileCard({
            username: 'jkt48.freya',
            full_name: 'Freya Jayawardana',
            picture_url: 'https://example.com/freya.jpg',
            url: 'https://www.instagram.com/jkt48.freya',
            is_verified: true
        });
        assert.equal(ret, rich);
        // compact, divider, social-entity → 3 sections
        assert.equal(rich._sections.length, 3);
        const compact = rich._sections[0].view_model.primitive;
        assert.equal(compact.__typename, 'GenAICompactCardPrimitive');
        assert.equal(compact.title, 'jkt48.freya · ig lookup'); // IG_PROFILE → "ig"
        assert.equal(compact.is_verified, true);
        assert.equal(rich._sections[1].view_model.primitive.__typename, 'GenAIDividerPrimitive');
        assert.equal(rich._sections[2].view_model.__typename, 'GenAIActionRowLayoutViewModel');
    });

    it('divider:false skips the divider; requires username', async () => {
        const { AIRich } = await import('../lib/Builders/index.js');
        const rich = new AIRich(makeStubClient());
        rich.addProfileCard({ username: 'x', url: 'https://y' }, { divider: false });
        assert.equal(rich._sections.length, 2); // no divider
        assert.throws(() => rich.addProfileCard({}), /username/);
        assert.throws(() => rich.addProfileCard([]), /plain object/);
    });

    it('roundtrips through readRichMessage', async () => {
        const { AIRich } = await import('../lib/Builders/index.js');
        const { readRichMessage } = await import('../lib/index.js');
        const built = await new AIRich(makeStubClient())
            .addProfileCard({
                username: 'meta',
                full_name: 'Meta',
                url: 'https://instagram.com/meta',
                is_verified: true
            })
            .build({});
        const r = readRichMessage(built);
        assert.equal(r.found, true);
        assert.ok(r.blocks.some((b) => b.type === 'compact'));
        assert.equal(r.socialEntities.length, 1);
        assert.equal(r.socialEntities[0].url, 'https://instagram.com/meta');
    });
});

describe('AIRich method registration', () => {
    it('marks both new methods EXPERIMENTAL', async () => {
        const { AIRich } = await import('../lib/Builders/index.js');
        assert.ok(AIRich.EXPERIMENTAL_METHODS.has('addSocialEntity'));
        assert.ok(AIRich.EXPERIMENTAL_METHODS.has('addCompact'));
        assert.ok(AIRich.EXPERIMENTAL_METHODS.has('addProfileCard'));
        assert.equal(AIRich.isExperimental('addSocialEntity'), true);
        assert.equal(AIRich.isExperimental('addCompact'), true);
        assert.equal(AIRich.isExperimental('addProfileCard'), true);
    });

    it('chains together like the igstalk usage', async () => {
        const { AIRich } = await import('../lib/Builders/index.js');
        const rich = new AIRich(makeStubClient());
        const ret = rich
            .addCompact({ title: 'IG Lookup', image: 'https://x/y.jpg', entity_url: 'https://wa.me' })
            .addDivider()
            .addSocialEntity({ username: 'someone', full_name: 'Some One', url: 'https://instagram.com/someone' });
        assert.equal(ret, rich);
        assert.equal(rich._sections.length, 3);
    });
});
