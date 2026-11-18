// v2.4.7 Batch M — Carousel builder audit + JAP-branded rich one-liner aliases.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    Button,
    Carousel,
    JapBaileys,
    jap,
    japRich,
    createJapRich,
    buildJapRich,
    sendJapRich,
    getBizBinaryNode,
} from '../lib/index.js';

const JID = '12345@s.whatsapp.net';
const makeSock = () => ({ relayMessage: async () => {}, logger: { warn() {} } });
const parseBtn = (btn) => JSON.parse(btn.buttonParamsJson);

const findNativeFlow = (node) => {
    const stack = [node];
    while (stack.length) {
        const n = stack.pop();
        if (n?.tag === 'native_flow') return n;
        if (Array.isArray(n?.content)) stack.push(...n.content);
    }
    return null;
};

test('JAP-branded rich aliases build the same one-liner AIRich surface', async () => {
    const sock = makeSock();
    for (const fn of [jap, japRich, createJapRich]) {
        const rich = fn(sock, { title: 'Jap', text: 'Hello', suggestions: ['Go'] });
        assert.equal(typeof rich.addTip, 'function');
        assert.equal(typeof rich.send, 'function');
        const built = await rich.build({ forwarded: false });
        assert.ok(built.botForwardedMessage.message.richResponseMessage);
    }

    const content = await buildJapRich(sock, '# Jap Build', { forwarded: false });
    assert.ok(content.botForwardedMessage.message.richResponseMessage);
});

test('sendJapRich sends through relayMessage', async () => {
    let relayed;
    const sock = {
        relayMessage: async (jid, message, options) => {
            relayed = { jid, message, options };
        },
    };
    const sent = await sendJapRich(sock, JID, { text: 'Jap send' }, { messageId: 'jap-rich-id', forwarded: false });
    assert.equal(sent.key.id, 'jap-rich-id');
    assert.equal(relayed.jid, JID);
    assert.ok(relayed.message.botForwardedMessage.message.richResponseMessage);
});

test('JapBaileys exposes JAP-rich one-liner aliases without breaking builder aliases', async () => {
    let count = 0;
    const hub = new JapBaileys({ relayMessage: async () => { count++; }, logger: { warn() {} } });

    assert.equal(typeof hub.japRich().addText, 'function', 'no-arg japRich() stays an AIRich builder alias');
    assert.equal(typeof hub.japRich('# One-liner').send, 'function', 'arg japRich(input) is one-liner');
    assert.equal(typeof hub.jap('# Short').send, 'function');
    assert.equal(typeof hub.JapRich('# Pascal').send, 'function');

    await hub.sendJapRich(JID, { text: 'Hi' }, { messageId: 'hub-jap-rich-id', forwarded: false });
    assert.equal(count, 1);
});

test('Carousel accepts text/button-only cards built by Button.toCard()', async () => {
    const sock = makeSock();
    const card = await new Button(sock)
        .setTitle('Text card')
        .setBody('No image needed')
        .addReply('Pick', 'pick_1')
        .toCard();

    assert.equal(card.header.hasMediaAttachment, false);

    const carousel = new Carousel(sock).setBody('Choose').addCard(card);
    assert.equal(carousel.countCards(), 1);
    assert.deepEqual(carousel.validate().errors, []);

    const msg = carousel.build(JID, { messageId: 'carousel-text-id', validate: true });
    const cm = msg.message.interactiveMessage.carouselMessage;
    assert.equal(cm.messageVersion, 1);
    assert.equal(cm.carouselCardType, 0);
    assert.equal(cm.cards[0].body.text, 'No image needed');
    assert.equal(cm.cards[0].nativeFlowMessage.buttons[0].name, 'quick_reply');
});

test('Carousel.addTextCard builds quick-reply/url/webview cards directly', () => {
    const c = new Carousel(makeSock()).addTextCard({
        title: 'Actions',
        text: 'Pick an action',
        footer: 'Footer',
        buttons: [
            { id: 'yes', text: 'Yes' },
            { url: 'https://x.com', text: 'Visit' },
            { webview: 'https://x.com/app', text: 'App' },
        ],
    });
    const [card] = c.getCards();
    assert.equal(card.header.hasMediaAttachment, false);
    assert.equal(card.body.text, 'Pick an action');
    assert.equal(card.footer.text, 'Footer');
    assert.deepEqual(card.nativeFlowMessage.buttons.map((b) => b.name), ['quick_reply', 'cta_url', 'open_webview']);
    assert.equal(parseBtn(card.nativeFlowMessage.buttons[2]).link.in_app_webview, true);
});

test('Carousel validates empty cards and supports clearCards/addCards introspection', async () => {
    const c = new Carousel(makeSock());
    assert.equal(c.validate().ok, false);
    assert.match(c.validate().errors[0], /empty/);
    assert.throws(() => c.addCard({}), /requires media, text, or buttons/);

    const a = await new Button(makeSock()).setBody('A').addReply('A', 'a').toCard();
    const b = await new Button(makeSock()).setBody('B').addReply('B', 'b').toCard();
    c.addCards(a, b);
    assert.equal(c.countCards(), 2);
    assert.equal(c.getCards().length, 2);
    assert.equal(c.clearCards().countCards(), 0);
});

test('Carousel.send uses the canonical mixed native_flow biz node', async () => {
    let relayed;
    const sock = {
        relayMessage: async (jid, message, options) => {
            relayed = { jid, message, options };
        },
    };
    const card = await new Button(sock).setBody('Card').addReply('Open', 'open').toCard();
    const carousel = new Carousel(sock).addCard(card);
    const msg = carousel.build(JID);

    const node = getBizBinaryNode(msg.message);
    assert.equal(node.attrs.actual_actors, '2');
    assert.equal(findNativeFlow(node)?.attrs.name, 'mixed');

    await carousel.send(JID, { messageId: 'carousel-send-id' });
    assert.equal(relayed.options.messageId, 'carousel-send-id');
    assert.equal(relayed.options.additionalNodes[0].attrs.actual_actors, '2');
    assert.equal(findNativeFlow(relayed.options.additionalNodes[0])?.attrs.name, 'mixed');
});
