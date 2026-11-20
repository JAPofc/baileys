// §2.201 — checkHtmlApp's external-reference gate missed unquoted and protocol-relative URLs.
// §2.202 — buildMemberLabelMessage defaulted its timestamp to milliseconds.
// §2.203 — the member-label length limit was 25 here and 30 everywhere else.
// §2.204 — forwardRichResponse guarded on relayMessage but called sendMessage.
// Plus characterisation for the last three modules that had no tests.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
	checkHtmlApp, prepareFileArtifact, htmlMultiplayerPrelude, withHtmlMultiplayer,
	sendHtmlDocument, HTML_APP_MULTIPLAYER_GLOBAL, HTML_MIME_TYPE
} from '../lib/Utils/html-app.js'
import {
	validateJid, isValidJid, toJid, jidKind, assertJid,
	buildMemberLabelMessage, MEMBER_LABEL_MAX_LENGTH
} from '../lib/Utils/wa-extras.js'
import {
	a2uiText, a2uiColumn, a2uiCard, a2uiButton, a2uiSurface, bloksWidget,
	chainOfThoughtSection, forwardRichResponse
} from '../lib/Builders/a2ui-fn.js'

describe('§2.201 html-app external reference gate', () => {
	const evil = 'https://jahat.id/x.js'

	test('an unquoted src is caught', () => {
		const report = checkHtmlApp(`<html><head><script src=${evil}></script></head></html>`, { allowExternal: false })
		assert.equal(report.ok, false, 'allowExternal:false must actually block this')
		assert.deepEqual(report.externalRefs, [evil])
	})

	test('a protocol-relative src is caught', () => {
		const report = checkHtmlApp('<html><head><script src="//jahat.id/x.js"></script></head></html>', { allowExternal: false })
		assert.equal(report.ok, false)
		assert.deepEqual(report.externalRefs, ['//jahat.id/x.js'])
	})

	test('quoted forms keep working, single and double, with spaces', () => {
		const html = `<html><head><link href = 'https://a.id/a.css'><img src="https://b.id/b.png"></head></html>`
		const report = checkHtmlApp(html, { allowExternal: false })
		assert.deepEqual(report.externalRefs.sort(), ['https://a.id/a.css', 'https://b.id/b.png'])
	})

	test('relative and inline references are not external', () => {
		const html = '<html><head><link href="style.css"><img src="data:image/png;base64,AAA"><a href="#top">x</a></head></html>'
		const report = checkHtmlApp(html, { allowExternal: false })
		assert.deepEqual(report.externalRefs, [], 'local assets must not trip the gate')
		assert.equal(report.ok, true)
	})

	test('external refs are a warning, not an error, when allowed', () => {
		const report = checkHtmlApp(`<html><head><script src=${evil}></script></head></html>`)
		assert.equal(report.ok, true)
		assert.equal(report.warnings.some(w => w.includes('external reference')), true)
	})
})

describe('html-app (characterisation)', () => {
	test('size, structure and script detection are reported', () => {
		const report = checkHtmlApp('<html><head><title>t</title><meta name="viewport" content="width=device-width"></head><body>hi</body></html>')
		assert.equal(report.ok, true)
		assert.deepEqual(report.warnings, [])
		assert.equal(report.hasScript, false)
		assert.equal(report.bytes > 0, true)
		assert.match(report.sha256, /^[0-9a-f]{64}$/)
	})

	test('loose markup earns warnings but still passes', () => {
		const report = checkHtmlApp('<div>hi</div>')
		assert.equal(report.ok, true)
		assert.equal(report.warnings.length, 3, 'no <html>, no <title>, no viewport')
	})

	test('an oversized bundle is an error', () => {
		const report = checkHtmlApp('<html>' + 'x'.repeat(5000) + '</html>', { maxBytes: 1000 })
		assert.equal(report.ok, false)
		assert.match(report.errors[0], /over the 1000 byte limit/)
	})

	test('empty or non-text input is rejected by name', () => {
		assert.throws(() => checkHtmlApp('   '), /the HTML is empty/)
		assert.throws(() => checkHtmlApp(42), /pass the HTML as a string or a Buffer/)
	})

	test('prepareFileArtifact infers the html mime from the file name', () => {
		const art = prepareFileArtifact('<html></html>', { fileName: 'invoice.html' })
		assert.equal(art.mimetype, HTML_MIME_TYPE)
		assert.equal(art.fileLength, 13)
		assert.ok(Buffer.isBuffer(art.document))

		assert.equal(prepareFileArtifact(Buffer.from('x'), { fileName: 'a.bin' }).mimetype, 'application/octet-stream')
		assert.throws(() => prepareFileArtifact(''), /pass a Buffer, a string/)
	})

	test('the multiplayer prelude escapes < so it cannot break out of the script tag', () => {
		const { script } = htmlMultiplayerPrelude({ sessionId: 'a</script><script>alert(1)', participants: [] })
		assert.ok(!script.includes('</script><script>alert(1)'), 'must not close the tag early')
		assert.ok(script.includes('\\u003c'))
		assert.equal(script.match(/<\/script>/g).length, 1)
	})

	test('maxPlayers is validated against the participant list', () => {
		assert.throws(() => htmlMultiplayerPrelude({ maxPlayers: 1 }), /must be an integer >= 2/)
		assert.throws(() => htmlMultiplayerPrelude({ participants: ['a', 'b', 'c'], maxPlayers: 2 }), /exceeds maxPlayers/)
	})

	test('injecting the prelude twice replaces it rather than stacking', () => {
		let html = '<html><head></head><body>hi</body></html>'
		html = withHtmlMultiplayer(html, { sessionId: 's1' }).html
		const second = withHtmlMultiplayer(html, { sessionId: 's2' })

		const occurrences = second.html.match(new RegExp(`${HTML_APP_MULTIPLAYER_GLOBAL}=`, 'g'))
		assert.equal(occurrences.length, 1, 'documented as idempotent')
		assert.equal(second.sessionId, 's2')
		assert.ok(second.html.includes('<body>hi</body>'))
	})

	test('sendHtmlDocument refuses an invalid bundle before sending', async () => {
		const sent = []
		const sock = { sendMessage: async (jid, content) => { sent.push(content); return { key: { id: 'M1' } } } }

		await assert.rejects(
			sendHtmlDocument(sock, '1@s.whatsapp.net', '<html>' + 'x'.repeat(3_000_000) + '</html>'),
			/over the .* byte limit/
		)
		assert.deepEqual(sent, [], 'nothing may go out when validation failed')

		await sendHtmlDocument(sock, '1@s.whatsapp.net', '<html><body>ok</body></html>', { fileName: 'a.html' })
		assert.equal(sent[0].mimetype, HTML_MIME_TYPE)
		assert.equal(sent[0].fileName, 'a.html')
	})
})

describe('§2.202/§2.203 member labels', () => {
	test('the label timestamp is unix seconds, like every other caller', () => {
		const ts = Number(buildMemberLabelMessage('Admin').protocolMessage.memberLabel.labelTimestamp)
		const nowSeconds = Math.floor(Date.now() / 1000)
		assert.ok(Math.abs(ts - nowSeconds) < 60, `expected unix seconds, got ${ts} (ms would be ~${Date.now()})`)
	})

	test('an explicit timestamp is still honoured', () => {
		const msg = buildMemberLabelMessage('Admin', { timestamp: 1757000000 })
		assert.equal(Number(msg.protocolMessage.memberLabel.labelTimestamp), 1757000000)
	})

	test('the length limit agrees with the send path', () => {
		assert.equal(MEMBER_LABEL_MAX_LENGTH, 30, 'messages-send.js and media-set.js both cut at 30')
		assert.doesNotThrow(() => buildMemberLabelMessage('x'.repeat(28)),
			'a 28-character label used to be rejected here and accepted everywhere else')
		assert.throws(() => buildMemberLabelMessage('x'.repeat(31)), /at most 30 characters/)
	})

	test('an empty label clears it', () => {
		assert.equal(buildMemberLabelMessage('').protocolMessage.memberLabel.label, '')
	})
})

describe('wa-extras jid helpers (characterisation)', () => {
	test('validateJid names what is wrong', () => {
		assert.equal(validateJid('62811@s.whatsapp.net').valid, true)
		assert.equal(validateJid('bukan-jid').reason, 'no @server part')
		assert.equal(validateJid('62811@contoh.com').reason, 'unknown server "contoh.com"')
		assert.equal(validateJid('abc@s.whatsapp.net').reason, 'phone JIDs must be 5–16 digits')
		assert.equal(validateJid(42).reason, 'not a string')
		assert.equal(isValidJid('120@g.us'), true)
	})

	test('toJid builds from digits, +numbers and existing jids', () => {
		assert.equal(toJid('62811234567'), '62811234567@s.whatsapp.net')
		assert.equal(toJid('+62 811-234-567'), '62811234567@s.whatsapp.net')
		assert.equal(toJid('120@g.us'), '120@g.us')
		assert.equal(toJid({ user: '62811', server: 'lid' }), '62811@lid')
		assert.throws(() => toJid('   '), /nothing to build a JID from/)
		assert.throws(() => toJid('halo'), /has no digits/)
	})

	test('jidKind separates the chat types', () => {
		assert.equal(jidKind('120@g.us'), 'group')
		assert.equal(jidKind('status@broadcast'), 'status')
		assert.equal(jidKind('62811@lid'), 'lid')
		assert.equal(jidKind('62811@s.whatsapp.net'), 'user')
		assert.equal(jidKind('apa@pun.com'), 'unknown')
	})

	test('assertJid throws with the reason attached', () => {
		assert.throws(() => assertJid('abc@s.whatsapp.net', 'target'), /target: .* 5–16 digits/)
		assert.equal(assertJid('62811234567@s.whatsapp.net'), '62811234567@s.whatsapp.net')
	})
})

describe('§2.204 forwardRichResponse', () => {
	const rich = { key: { id: 'M1' }, message: { richResponseMessage: { messageVersion: 1 } } }

	test('a socket that can send is accepted', async () => {
		const sent = []
		const sock = { sendMessage: async (jid, content, options) => { sent.push([content, options]); return 'ok' } }

		await forwardRichResponse(sock, '1@g.us', rich)

		assert.equal(sent.length, 1, 'the guard used to demand relayMessage and reject this socket')
		assert.ok(sent[0][0].forward.message)
	})

	test('options go to the options argument, not into the message content', async () => {
		const sent = []
		const sock = { sendMessage: async (jid, content, options) => { sent.push([content, options]); return 'ok' } }

		await forwardRichResponse(sock, '1@g.us', rich, { quoted: { key: { id: 'Q' } } })

		assert.deepEqual(Object.keys(sent[0][0]), ['forward'], 'quoted used to be spread into the content too')
		assert.ok(sent[0][1].quoted, 'and it must still reach sendMessage as an option')
	})

	test('a message without a rich response is refused', async () => {
		const sock = { sendMessage: async () => 'ok' }
		await assert.rejects(
			forwardRichResponse(sock, '1@g.us', { key: { id: 'M1' }, message: { conversation: 'halo' } }),
			/does not contain a rich response/
		)
	})
})

describe('a2ui-fn builders (characterisation)', () => {
	test('a tree becomes a flat bloks widget payload', () => {
		const widget = bloksWidget(a2uiCard(a2uiColumn([
			a2uiText('Judul', { variant: 'title' }),
			a2uiButton(a2uiText('Kirim'), { action: 'submit' })
		])))

		assert.ok(widget.uuid, 'a widget carries an id')
		assert.equal(typeof widget.data, 'string', 'data is the serialised component list')
		assert.equal(widget.type, 'im_a2ui')
		assert.ok(widget.data.includes('Judul'))
	})

	test('a bare node and an array are both accepted as a surface', () => {
		assert.ok(bloksWidget(a2uiText('halo')).data)
		assert.ok(bloksWidget([a2uiText('a'), a2uiText('b')]).data)
	})

	test('an empty surface and a nested Surface are rejected', () => {
		assert.throws(() => bloksWidget(a2uiSurface([])), /no children to render/)
		assert.throws(() => bloksWidget(a2uiSurface([a2uiSurface([a2uiText('x')])])), /cannot be nested/)
	})

	test('a non-node in the tree is named, not silently dropped', () => {
		assert.throws(() => bloksWidget(a2uiColumn([{ component: 'Text' }])), /expected an a2ui node, got object/)
		assert.throws(() => bloksWidget(a2uiColumn([null])), /expected an a2ui node, got null/)
	})

	test('chainOfThoughtSection accepts strings or objects', () => {
		const section = chainOfThoughtSection(['baca', { title: 'hitung', status: 'running' }])
		assert.equal(section.thinking.steps.length, 2)
		assert.deepEqual(section.tasks.map(t => t.status), ['done', 'running'])
		assert.equal(section.thinking.collapsed, true)
		assert.throws(() => chainOfThoughtSection([]), /at least one step/)
	})
})
