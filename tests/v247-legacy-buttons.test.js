// v2.4.7 Batch N — legacy ButtonV2/ButtonV3 builder validation + canonical relay nodes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ButtonV2, ButtonV3, getBizBinaryNode } from '../lib/index.js';

const JID = '12345@s.whatsapp.net';
const findNode = (node, tag) => {
    const stack = [node];
    while (stack.length) {
        const n = stack.pop();
        if (n?.tag === tag) return n;
        if (Array.isArray(n?.content)) stack.push(...n.content);
    }
    return null;
};
const findNativeFlow = (node) => findNode(node, 'native_flow');

test('ButtonV2 validates malformed raw buttons and caps legacy button count', () => {
    const b = new ButtonV2({});
    assert.equal(b.validate().ok, false);
    assert.match(b.validate().errors[0], /empty/);

    b.addRawButton({});
    const v = b.validate();
    assert.equal(v.ok, false);
    assert.ok(v.errors.some((e) => /missing buttonId/.test(e)), JSON.stringify(v.errors));
    assert.ok(v.errors.some((e) => /buttonText\.displayText/.test(e)), JSON.stringify(v.errors));

    b.clearButtons().addButton('A', 'a').addButton('B', 'b').addButton('C', 'c');
    assert.equal(b.countButtons(), 3);
    assert.throws(() => b.addButton('D', 'd'), /maximum of 3/);
    assert.deepEqual(b.validate().errors, []);
});

test('ButtonV2 row(), getButtons(), build({validate}) and assertValid()', async () => {
    const b = new ButtonV2({})
        .setBody('Pick')
        .row((row) => row.button('One', 'one').button('Two', 'two'));
    assert.equal(b.countButtons(), 2);
    assert.equal(b.getButtons()[0].buttonId, 'one');
    assert.equal(b.assertValid(), b);

    const msg = await b.build(JID, { messageId: 'btnv2-build-id', validate: true, viewOnce: false });
    assert.equal(msg.key.id, 'btnv2-build-id');
    assert.equal(msg.message.buttonsMessage.viewOnce, false);
    assert.equal(msg.message.buttonsMessage.buttons.length, 2);
});

test('ButtonV2.send uses canonical getBizBinaryNode envelope', async () => {
    let relayed;
    const sock = { relayMessage: async (jid, message, options) => { relayed = { jid, message, options }; } };
    const sent = await new ButtonV2(sock)
        .setBody('Pick')
        .addButton('Open', 'open')
        .send(JID, { messageId: 'btnv2-send-id' });

    assert.equal(sent.key.id, 'btnv2-send-id');
    assert.equal(relayed.jid, JID);
    const node = relayed.options.additionalNodes[0];
    assert.equal(node.attrs.actual_actors, '2');
    assert.equal(node.attrs.host_storage, '2');
    assert.equal(findNativeFlow(node).attrs.name, 'mixed');
    assert.ok(findNode(node, 'quality_control'));

    const expected = getBizBinaryNode(sent.message);
    assert.equal(findNativeFlow(expected).attrs.name, findNativeFlow(node).attrs.name);
});

test('ButtonV3 shorthands reject inert empty buttons and validate raw hydrated buttons', () => {
    const t = new ButtonV3({});
    assert.throws(() => t.addReply('', ''), /requires both/);
    assert.throws(() => t.addUrl('Open', ''), /requires both/);
    assert.throws(() => t.addCall('', '+1'), /requires both/);

    t.addButton({ quickReplyButton: { displayText: '', id: '' } });
    const v = t.validate();
    assert.equal(v.ok, false);
    assert.ok(v.errors.some((e) => /displayText required/.test(e)), JSON.stringify(v.errors));
    assert.ok(v.errors.some((e) => /id required/.test(e)), JSON.stringify(v.errors));

    t.clearButtons().addReply('Yes', 'yes').addUrl('Docs', 'https://example.com').addCall('Call', '+15551234567');
    assert.equal(t.countButtons(), 3);
    assert.throws(() => t.addReply('No', 'no'), /maximum of 3/);
    assert.deepEqual(t.validate().errors, []);
});

test('ButtonV3 build({validate}) preserves loaded template buttons and media fields', async () => {
    const existing = {
        templateMessage: {
            contextInfo: { mentionedJid: ['1@s.whatsapp.net'] },
            hydratedFourRowTemplate: {
                hydratedTitleText: 'Loaded',
                hydratedContentText: 'Body',
                hydratedFooterText: 'Foot',
                hydratedButtons: [{ index: 1, quickReplyButton: { displayText: 'OK', id: 'ok' } }],
            },
        },
    };
    const b = new ButtonV3({}).loadFrom(existing);
    assert.equal(b.countButtons(), 1);
    assert.equal(b.getButtons()[0].quickReplyButton.id, 'ok');

    const msg = await b.build(JID, { messageId: 'btnv3-build-id', validate: true });
    const tpl = msg.message.templateMessage;
    assert.equal(tpl.hydratedFourRowTemplate.hydratedTitleText, 'Loaded');
    assert.equal(tpl.hydratedFourRowTemplate.hydratedButtons[0].quickReplyButton.id, 'ok');
    assert.deepEqual(tpl.contextInfo.mentionedJid, ['1@s.whatsapp.net']);
});

test('ButtonV3.send uses canonical getBizBinaryNode and preserves caller additionalNodes', async () => {
    let relayed;
    const customNode = { tag: 'custom', attrs: { ok: '1' } };
    const sock = { relayMessage: async (jid, message, options) => { relayed = { jid, message, options }; } };
    const sent = await new ButtonV3(sock)
        .setBody('Template')
        .addReply('Open', 'open')
        .send(JID, { messageId: 'btnv3-send-id', additionalNodes: [customNode] });

    assert.equal(sent.key.id, 'btnv3-send-id');
    assert.equal(relayed.jid, JID);
    assert.equal(relayed.options.additionalNodes.length, 2);
    assert.equal(relayed.options.additionalNodes[1], customNode);
    const node = relayed.options.additionalNodes[0];
    assert.equal(node.attrs.actual_actors, '2');
    assert.equal(findNativeFlow(node).attrs.name, 'mixed');
    assert.ok(findNode(node, 'quality_control'));
});
