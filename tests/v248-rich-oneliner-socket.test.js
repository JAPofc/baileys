import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'fs'
import { jap, createJapRich, sendJapRich, ONE_LINER_KEYS } from '../lib/index.js'

const fakeClient = () => {
	const relayed = []
	return {
		relayed,
		user: { id: '1@s.whatsapp.net' },
		authState: { creds: { me: { id: '1@s.whatsapp.net' } } },
		logger: { warn() {}, debug() {} },
		relayMessage: async (jid, message, opts) => { relayed.push({ jid, message }); return opts },
		sendMessage: async () => ({})
	}
}

test('§2.76 every AIRich primitive the one-liner advertises actually lands on the card', () => {
	const cases = {
		latex: { latex: 'E = mc^2' },
		task: { task: { title: 'build' } },
		thinking: { thinking: 'figuring it out' },
		progressStatus: { progressStatus: 'uploading' },
		product: { product: { title: 'Kopi' } },
		post: { post: { title: 'Post' } },
		contentItems: { contentItems: [{ title: 'a' }] },
		generating: { generating: true }
	}

	for (const [label, input] of Object.entries(cases)) {
		const rich = jap(fakeClient(), input)
		assert.ok(rich.items.length > 0, `${label} produced an empty card`)
	}
})

test('§2.76 latex really reaches the wire', async () => {
	const client = fakeClient()
	await createJapRich(client, { latex: 'E = mc^2' }).send('628@s.whatsapp.net')
	assert.match(JSON.stringify(client.relayed[0].message), /latex/i)
})

test('§2.76 a table one-liner reaches the wire as table metadata', async () => {
	const client = fakeClient()
	await createJapRich(client, { table: [['Item', 'Qty'], ['Kopi', '12']] }).send('628@s.whatsapp.net')
	const json = JSON.stringify(client.relayed[0].message)
	assert.match(json, /tableMetadata/)
	assert.match(json, /Kopi/)
})

test('§2.76 an unknown key is rejected, with a suggestion for a near miss', () => {
	assert.throws(
		() => jap(fakeClient(), { markdown: 'x', tabel: [['a']] }),
		err => /unknown key/i.test(err.message) && /did you mean 'table'/.test(err.message)
	)
	assert.throws(() => jap(fakeClient(), { markdown: 'x', completelyMadeUp: 1 }), /unknown key/i)
})

test('§2.76 allowUnknown restores the permissive behaviour', () => {
	const rich = jap(fakeClient(), { markdown: 'x', myOwnField: 1, allowUnknown: true })
	assert.equal(rich.items.length, 1)
})

test('§2.76 the key registry cannot drift from what the reader destructures', () => {
	const src = readFileSync('lib/Builders/Rich.js', 'utf8')
	const block = src.slice(src.indexOf('const {', src.indexOf('function applyOneLiner')), src.indexOf('} = input;'))
	const destructured = block
		.split('\n')
		.map(line => line.replace(/\/\/.*$/, '').trim().replace(/,$/, ''))
		.filter(name => /^[a-zA-Z][a-zA-Z0-9]*$/.test(name) && name !== 'const')
	assert.ok(destructured.length > 40, `expected the full key list, parsed ${destructured.length}`)
	for (const name of destructured) {
		assert.ok(ONE_LINER_KEYS.has(name), `'${name}' is read but missing from ONE_LINER_KEYS`)
	}
})

test('§2.76 sending nothing is refused, but chaining off an empty builder still works', async () => {
	await assert.rejects(() => sendJapRich(fakeClient(), '628@s.whatsapp.net', {}), /no content to send/)
	const rich = jap(fakeClient(), {})
	assert.equal(rich.addText('later').items.length, 1)
})

test('§2.76 the socket exposes rich helpers under JAP names plus neutral aliases', () => {
	const src = readFileSync('lib/Socket/messages-send.js', 'utf8')
	for (const name of ['sendJapRich', 'sendJapTable', 'sendJapLatex', 'sendRich', 'sendTable', 'sendLatex']) {
		assert.match(src, new RegExp(`\\b${name}: async`), `${name} is not a socket method`)
	}

	// the aliases must delegate, not duplicate the logic
	assert.match(src, /sendRich: async \(jid, input = \{\}, options = \{\}\) => messagesSocket\.sendJapRich/)
	assert.match(src, /sendTable: async \(jid, table, options = \{\}\) => messagesSocket\.sendJapTable/)
	assert.match(src, /sendLatex: async \(jid, expression, options = \{\}\) => messagesSocket\.sendJapLatex/)
})

test('§2.76 sendMessage routes { table } / { latex } / { rich } / { jap }', () => {
	const src = readFileSync('lib/Socket/messages-send.js', 'utf8')
	assert.match(src, /const resolveJapRichInput = \(content\) => \{/)
	assert.match(src, /if \(content\.rich != null\) return content\.rich;/)
	assert.match(src, /if \(content\.jap != null\) return content\.jap;/)
	assert.match(src, /if \(content\.table != null \|\| content\.latex != null\)/)
	assert.match(src, /resolveJapRichInput\(content\)\) \{[\s\S]*?messagesSocket\.sendJapRich\(jid, resolveJapRichInput\(content\), options\)/)
})

test('§2.76 the rich helpers are typed on the socket surface', () => {
	const dts = readFileSync('lib/Socket/messages-send.d.ts', 'utf8')
	for (const name of ['sendJapRich', 'sendJapTable', 'sendJapLatex', 'sendRich', 'sendTable', 'sendLatex']) {
		assert.ok(dts.includes(`${name}:`), `${name} missing from messages-send.d.ts`)
	}
})
