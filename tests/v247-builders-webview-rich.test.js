// v2.4.7 Batch L — Builders/WebView/Flows/Rich one-liner regression locks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    Button,
    Rich,
    buildRich,
    sendRich,
    JapBaileys,
    generateWAMessage,
    validateSendInteractiveMessagePayload,
} from '../lib/index.js';

const JID = '12345@s.whatsapp.net';
const OPTS = { userJid: '1@s.whatsapp.net' };
const parseBtn = (btn) => JSON.parse(btn.buttonParamsJson);
const richData = (content) => JSON.parse(Buffer.from(
    content.botForwardedMessage.message.richResponseMessage.unifiedResponse.data,
    'base64'
).toString('utf8'));

test('cta_url still carries webview_interaction compatibility flag', () => {
    const b = new Button({}).addUrl('Open', 'https://x.com/app', true);
    assert.equal(b._buttons[0].name, 'cta_url');
    const p = parseBtn(b._buttons[0]);
    assert.equal(p.url, 'https://x.com/app');
    assert.equal(p.merchant_url, 'https://x.com/app');
    assert.equal(p.webview_interaction, true);
});

test('addOpenWebview emits link.in_app_webview and preserves link.url', () => {
    const b = new Button({}).addOpenWebview('Docs', 'https://x.com/docs', {
        inAppWebview: false,
        link: { ref: 'abc' },
        mode: 'compact',
    });
    assert.equal(b._buttons[0].name, 'open_webview');
    const p = parseBtn(b._buttons[0]);
    assert.equal(p.title, 'Docs');
    assert.equal(p.mode, 'compact');
    assert.equal(p.link.url, 'https://x.com/docs');
    assert.equal(p.link.ref, 'abc');
    assert.equal(p.link.in_app_webview, false);
});

test('nativeFlow flow shortcut emits real flow button name + auto token', async () => {
    const m = await generateWAMessage(JID, {
        text: 'Start flow',
        nativeFlow: [{ buttonText: 'Open Flow', flow: { id: 'F1', screen: 'WELCOME' } }],
    }, OPTS);
    const btn = m.message.interactiveMessage.nativeFlowMessage.buttons[0];
    assert.equal(btn.name, 'flow');
    const p = parseBtn(btn);
    assert.equal(p.flow_id, 'F1');
    assert.equal(p.flow_cta, 'Open Flow');
    assert.equal(p.flow_action, 'navigate');
    assert.equal(p.flow_action_payload.screen, 'WELCOME');
    assert.equal(typeof p.flow_token, 'string');
    assert.ok(p.flow_token.length > 0);
});

test('nativeFlow flow shorthand accepts a string flow id', async () => {
    const m = await generateWAMessage(JID, {
        text: 'Start flow',
        nativeFlow: [{ text: 'Run', flow: 'F2' }],
    }, OPTS);
    const btn = m.message.interactiveMessage.nativeFlowMessage.buttons[0];
    assert.equal(btn.name, 'flow');
    assert.equal(parseBtn(btn).flow_id, 'F2');
});

test('interactive sender validation accepts canonical flow button', () => {
    const res = validateSendInteractiveMessagePayload({
        text: 'Open',
        interactiveButtons: [{
            name: 'flow',
            buttonParamsJson: JSON.stringify({ flow_id: 'F3', flow_cta: 'Open', flow_token: 'tok' }),
        }],
    });
    assert.equal(res.valid, true, JSON.stringify(res.errors));
    assert.deepEqual(res.errors, []);
});

test('Rich one-liner object builds an AIRich card with actions + suggestions', async () => {
    const content = await buildRich({ logger: { warn() {} } }, {
        title: 'Menu',
        markdown: '# Hello\nWorld',
        actions: { text: 'Docs', url: 'https://x.com/docs' },
        suggestions: ['Yes', 'No'],
    }, { forwarded: false });
    assert.equal(content.messageContextInfo.botMetadata.messageDisclaimerText, 'Menu');
    const data = richData(content);
    const json = JSON.stringify(data);
    assert.ok(data.sections.length >= 3);
    assert.ok(json.includes('Hello'));
    assert.ok(json.includes('Docs'));
    assert.ok(json.includes('Yes'));
});

test('Rich alias and sendRich one-liner send through relayMessage', async () => {
    let relayed;
    const sock = {
        relayMessage: async (jid, message, options) => {
            relayed = { jid, message, options };
        },
    };
    const shortcut = Rich(sock, '# Hi');
    assert.equal(typeof shortcut.send, 'function');
    assert.equal(typeof shortcut.addTip, 'function');
    const sent = await sendRich(sock, JID, { text: 'Plain rich text' }, { messageId: 'fixed-id', forwarded: false });
    assert.equal(sent.key.id, 'fixed-id');
    assert.equal(relayed.jid, JID);
    assert.equal(relayed.options.messageId, 'fixed-id');
    assert.ok(relayed.message.botForwardedMessage.message.richResponseMessage);
});

test('JapBaileys hub exposes rich one-liner helpers', async () => {
    let sent = 0;
    const jap = new JapBaileys({ relayMessage: async () => { sent++; } });
    const shortcut = jap.rich({ text: 'Hi' });
    assert.equal(typeof shortcut.send, 'function');
    assert.equal(typeof shortcut.addTip, 'function');
    await jap.sendRich(JID, '## Hi', { messageId: 'hub-id', forwarded: false });
    assert.equal(sent, 1);
});
