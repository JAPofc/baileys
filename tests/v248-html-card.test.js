/**
 * tests/v248-html-card.test.js — v2.4.8
 *
 * The experimental HTML/CSS/JS card primitive inside WhatsApp's rich-response surface.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
	assessHtmlCard,
	assertHtmlCard,
	buildHtmlPrimitiveSection,
	buildHtmlUnifiedResponse,
	HTML_PRIMITIVE_TYPENAME,
	MAX_HTML_CARD_BYTES
} from '../lib/Utils/index.js';
import { generateWAMessageContent } from '../lib/Utils/messages.js';
import { RichSubMessageType } from '../lib/Types/RichType.js';

const HTML = '<!doctype html><html><body><div class="card">hi</div><script>let n=0</script></body></html>';
const unifiedOf = (content) => JSON.parse(Buffer.from(content.botForwardedMessage.message.richResponseMessage.unifiedResponse.data).toString());

describe('html card primitives', () => {
	it('names the primitive the client looks for', () => {
		assert.equal(HTML_PRIMITIVE_TYPENAME, 'FOAHtmlPrimitiveDemoDONOTUSE');
		const section = buildHtmlPrimitiveSection(HTML);
		assert.equal(section.view_model.primitive.__typename, HTML_PRIMITIVE_TYPENAME);
		assert.equal(section.view_model.__typename, 'GenAISingleLayoutViewModel');
		assert.equal(section.__typename, 'GenAIUnifiedResponseSection');
	});

	it('carries the markup verbatim', () => {
		assert.equal(buildHtmlPrimitiveSection(HTML).view_model.primitive.payload, HTML);
	});

	it('defaults trusted_sources to an empty list and accepts overrides', () => {
		assert.deepEqual(buildHtmlPrimitiveSection(HTML).view_model.primitive.trusted_sources, []);
		assert.deepEqual(
			buildHtmlPrimitiveSection(HTML, { trustedSources: ['https://example.com'] }).view_model.primitive.trusted_sources,
			['https://example.com']
		);
		assert.deepEqual(buildHtmlPrimitiveSection(HTML, { trustedSources: 'nope' }).view_model.primitive.trusted_sources, []);
	});

	it('validates the markup instead of shipping junk', () => {
		assert.deepEqual(assessHtmlCard(HTML).ok, true);
		assert.equal(assessHtmlCard('').ok, false);
		assert.equal(assessHtmlCard('   ').ok, false);
		assert.equal(assessHtmlCard(undefined).ok, false);
		assert.equal(assessHtmlCard(42).ok, false);
		assert.match(assessHtmlCard(42).reason, /string/);
		assert.throws(() => assertHtmlCard(''), /html card: html must not be empty/);
	});

	it('counts bytes, not characters, against the limit', () => {
		assert.equal(assessHtmlCard('<p>é</p>').bytes, 9);
		const big = '<p>' + 'a'.repeat(MAX_HTML_CARD_BYTES) + '</p>';
		const over = assessHtmlCard(big);
		assert.equal(over.ok, false);
		assert.match(over.reason, /over the \d+-byte limit/);
		assert.equal(assessHtmlCard(big, { maxBytes: big.length + 1 }).ok, true);
	});

	it('builds a unified response from one or many documents', () => {
		const one = buildHtmlUnifiedResponse(HTML, { uuid: 'u-1' });
		assert.equal(one.__typename, 'GenAIUnifiedResponse');
		assert.equal(one.response_id, 'u-1');
		assert.equal(one.sections.length, 1);
		assert.equal(buildHtmlUnifiedResponse([HTML, HTML]).sections.length, 2);
		assert.match(buildHtmlUnifiedResponse(HTML).response_id, /^[0-9a-f-]{36}$/);
		assert.throws(() => buildHtmlUnifiedResponse([]), /at least one document/);
	});
});

describe('sendMessage({ html }) wiring', () => {
	it('produces a bot-forwarded rich response carrying the card', async () => {
		const content = await generateWAMessageContent({ html: HTML }, {});
		const rich = content.botForwardedMessage.message.richResponseMessage;
		const unified = unifiedOf(content);
		assert.equal(unified.sections.length, 1);
		assert.equal(unified.sections[0].view_model.primitive.__typename, HTML_PRIMITIVE_TYPENAME);
		assert.equal(unified.sections[0].view_model.primitive.payload, HTML);
		assert.equal(rich.contextInfo.isForwarded, true);
		assert.equal(rich.contextInfo.forwardOrigin, 4);
	});

	it('keeps html out of the protobuf submessages (no field can carry it)', async () => {
		const content = await generateWAMessageContent({ html: HTML }, {});
		assert.equal(content.botForwardedMessage.message.richResponseMessage.submessages.length, 0);
	});

	it('still pairs botResponseId with the unified response id', async () => {
		const content = await generateWAMessageContent({ html: HTML }, {});
		assert.equal(content.messageContextInfo.botMetadata.botResponseId, unifiedOf(content).response_id);
	});

	it('accepts several cards and a trustedSources list', async () => {
		const content = await generateWAMessageContent({ html: [HTML, HTML], trustedSources: ['https://a.test'] }, {});
		const unified = unifiedOf(content);
		assert.equal(unified.sections.length, 2);
		assert.deepEqual(unified.sections[1].view_model.primitive.trusted_sources, ['https://a.test']);
	});

	it('mixes with the other primitives through richResponse[]', async () => {
		const content = await generateWAMessageContent({ richResponse: [{ text: 'play:' }, { html: HTML }] }, {});
		const unified = unifiedOf(content);
		assert.deepEqual(
			unified.sections.map((s) => s.view_model.primitive.__typename),
			['GenAIMarkdownTextUXPrimitive', HTML_PRIMITIVE_TYPENAME]
		);
		assert.equal(content.botForwardedMessage.message.richResponseMessage.submessages.length, 1, 'only the text survives into protobuf');
	});

	it('rejects invalid markup up front', async () => {
		await assert.rejects(() => generateWAMessageContent({ html: '' }, {}), /html card/);
		await assert.rejects(() => generateWAMessageContent({ html: [HTML, 123] }, {}), /html card/);
	});

	it('exposes the enum member used internally', () => {
		assert.equal(RichSubMessageType.HTML, 10);
		assert.equal(RichSubMessageType[10], 'HTML');
	});

	it('does not disturb a plain rich response', async () => {
		const content = await generateWAMessageContent({ code: 'const a = 1', language: 'javascript' }, {});
		const unified = unifiedOf(content);
		assert.equal(unified.sections[0].view_model.primitive.__typename, 'GenAICodeUXPrimitive');
		assert.ok(content.botForwardedMessage.message.richResponseMessage.submessages.length >= 1);
	});
});
