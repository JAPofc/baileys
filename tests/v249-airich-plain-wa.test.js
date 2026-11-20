// §2.99 --- AIRich on plain WhatsApp / WhatsApp Business + real bot-proof support.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	AIRich,
	botMetadataCertificate,
	isParsableCertificateChain,
	verifyBotSignature,
	renderAIRichSectionsAsText,
	buildPlainAIRichContent,
	resolveAIRichCompatMode,
	AIRICH_COMPAT_MODES,
} from '../lib/index.js';

const makeSock = () => {
	const sent = [];
	const warnings = [];
	return {
		sent,
		warnings,
		user: { id: '1@s.whatsapp.net' },
		logger: { warn: (a, b) => warnings.push(typeof b === 'string' ? b : a), debug() {} },
		relayMessage: async () => {},
		sendMessage: async (jid, content, options) => {
			sent.push({ jid, content, options });
			return { key: { id: `M${sent.length}`, remoteJid: jid, fromMe: true }, message: content };
		},
	};
};

test('§2.99 botMetadataCertificate emits a parsable DER SEQUENCE header', () => {
	for (const length of [685, 892, 64]) {
		const cert = botMetadataCertificate(length);
		assert.equal(cert.length, length);
		assert.equal(cert[0], 0x30);
		assert.equal(cert[1], 0x82);
		assert.equal((cert[2] << 8) | cert[3], length - 4, 'declared length must match the real body');
	}
	assert.equal(isParsableCertificateChain([botMetadataCertificate(), botMetadataCertificate(892)]), true);
});

test('§2.99 a default card no longer carries an unparsable chain', async () => {
	const sock = makeSock();
	const rich = new AIRich(sock).addText('halo');
	const msg = await rich.build({});
	const proof = msg.messageContextInfo.botMetadata.verificationMetadata.proofs[0];
	assert.equal(isParsableCertificateChain(proof.certificateChain), true);
	assert.notEqual(verifyBotSignature({ message: msg }).reason, 'unparsable certificate chain');
});

test('§2.99 setBotSignature swaps in a real proof and flips aiVerification', async () => {
	const sock = makeSock();
	const rich = new AIRich(sock).addText('halo');
	assert.equal(rich.aiVerification, 'placeholder');

	const chain = [Buffer.alloc(8, 1)];
	const signature = Buffer.alloc(64, 2);
	rich.setBotSignature({ certificateChain: chain, signature, useCase: 3 });
	assert.equal(rich.aiVerification, 'signed');

	const proof = (await rich.build({})).messageContextInfo.botMetadata.verificationMetadata.proofs[0];
	assert.deepEqual(proof.certificateChain, chain);
	assert.deepEqual(proof.signature, signature);
	assert.equal(proof.useCase, 3);
	assert.equal(proof.version, 1);

	rich.setBotSignature(null);
	assert.equal(rich.aiVerification, 'placeholder');

	assert.throws(() => rich.setBotSignature({ signature }), /certificateChain/);
	assert.throws(() => rich.setBotSignature({ certificateChain: chain, signature: Buffer.alloc(10) }), /64-byte/);
});

test('§2.99 the placeholder proof warns exactly once per client', async () => {
	const sock = makeSock();
	const rich = new AIRich(sock).addText('halo');
	await rich.send('62@s.whatsapp.net');
	await rich.send('62@s.whatsapp.net');
	await new AIRich(sock).addText('lagi').send('62@s.whatsapp.net');
	const placeholderWarnings = sock.warnings.filter(w => typeof w === 'string' && w.includes('placeholder'));
	assert.equal(placeholderWarnings.length, 1);
});

test('§2.99 sections flatten into WhatsApp formatting', async () => {
	const sock = makeSock();
	const rich = new AIRich(sock)
		.addHeading('Cuaca Jakarta')
		.addText('Hujan **ringan**, 27 derajat')
		.addCode('js', 'let a = 1')
		.addLinks([{ title: 'BMKG', url: 'https://bmkg.go.id' }]);

	const { text } = await rich.buildPlain();
	assert.match(text, /^\*Cuaca Jakarta\*/);
	assert.match(text, /Hujan \*ringan\*, 27 derajat/);
	assert.match(text, /```let a = 1```/);
	assert.match(text, /https:\/\/bmkg\.go\.id/);
	assert.ok(!text.includes('{{'), 'citation placeholders must be resolved');

	assert.equal(renderAIRichSectionsAsText([], { title: 'T' }), '*T*');
});

test('§2.99 suggestions become nativeFlow buttons in interactive mode', async () => {
	const sock = makeSock();
	const rich = new AIRich(sock).addText('isi').addSuggest(['Besok?', 'Minggu ini?']);
	const plain = await rich.buildPlain({ mode: 'auto' });

	assert.equal(plain.mode, 'interactive');
	assert.equal(plain.buttons.length, 2);
	const buttons = plain.content.interactiveMessage.nativeFlowMessage.buttons;
	assert.equal(buttons[0].name, 'quick_reply');
	assert.equal(JSON.parse(buttons[0].buttonParamsJson).display_text, 'Besok?');
	assert.equal(plain.content.interactiveMessage.body.text, plain.text);
});

test('§2.99 compat modes resolve predictably', () => {
	assert.deepEqual(AIRICH_COMPAT_MODES, ['rich', 'plain', 'interactive', 'auto']);
	assert.equal(resolveAIRichCompatMode('rich').mode, 'rich');
	assert.equal(resolveAIRichCompatMode('plain').mode, 'plain');
	assert.equal(resolveAIRichCompatMode('interactive', { supportsInteractive: false }).mode, 'plain');
	assert.equal(resolveAIRichCompatMode('auto', { hasButtons: true }).mode, 'interactive');
	assert.equal(resolveAIRichCompatMode('auto', { hasButtons: false }).mode, 'plain');
	assert.equal(resolveAIRichCompatMode('auto', { hasButtons: true, supportsInteractive: false }).mode, 'plain');
	assert.throws(() => resolveAIRichCompatMode('nope'), /unknown mode/);
	assert.throws(() => buildPlainAIRichContent(''), /empty string/);
});

test('§2.99 send({ compat }) goes through sendMessage, default stays rich', async () => {
	const sock = makeSock();
	const rich = new AIRich(sock).addText('isi').addSuggest('Lanjut?');

	const plain = await rich.send('62@s.whatsapp.net', { compat: 'plain' });
	assert.equal(plain.mode, 'plain');
	assert.equal(typeof sock.sent[0].content.text, 'string');
	assert.equal(rich._lastMessageKey.id, 'M1');

	const interactive = await rich.send('62@s.whatsapp.net', { compat: 'interactive' });
	assert.equal(interactive.mode, 'interactive');
	assert.ok(sock.sent[1].content.interactiveMessage);

	const forced = await rich.send('62@s.whatsapp.net', { compat: 'interactive', supportsInteractive: false });
	assert.equal(forced.mode, 'plain');

	// default: still the Meta-AI rich path, nothing goes through sendMessage
	const before = sock.sent.length;
	const richSend = await rich.send('62@s.whatsapp.net');
	assert.equal(sock.sent.length, before);
	assert.ok(richSend.message.botForwardedMessage, 'default send() must keep the rich payload');
	assert.equal(richSend.mode, undefined);
});
