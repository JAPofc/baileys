/**
 * Repro for BUGREPORT 2.76 -- the AIRich one-liner silently drops every primitive it has
 * no key for, and then happily builds and sends an EMPTY card.
 *
 * `applyOneLiner()` destructures a fixed list of keys. AIRich itself can render latex,
 * tasks, widgets, progress/thinking status, quota upsells, bloks, reels, posts, products,
 * social entities and inline video -- none of them reachable from the one-liner, and a
 * typo'd key behaves exactly the same way: no error, no content.
 *
 * Run: node scripts/al-repro.mjs
 */
import { jap } from '../lib/index.js'

const relayed = []
const sock = {
	user: { id: '1@s.whatsapp.net' },
	authState: { creds: { me: { id: '1@s.whatsapp.net' } } },
	logger: { warn() {}, debug() {} },
	relayMessage: async (jid, message, opts) => { relayed.push({ jid, message, opts }); return opts }
}

const CASES = {
	'{ markdown: "# hi" }': { markdown: '# hi' },
	'{ latex: "E = mc^2" }': { latex: 'E = mc^2' },
	'{ task: {…} }': { task: { title: 'build' } },
	'{ widget: {…} }': { widget: { title: 'w' } },
	'{ thinking: "…" }': { thinking: 'figuring it out' },
	'{ product: {…} }': { product: { title: 'Kopi' } },
	'{ markdown, tabel: [[…]] }': { markdown: 'x', tabel: [['a', 'b']] },
	'{} (nothing at all)': {}
}

const report = async (label, input) => {
	relayed.length = 0
	let items = '-'
	let outcome
	try {
		const rich = jap(sock, structuredClone(input))
		items = rich.items?.length ?? 0
		await rich.send('628@s.whatsapp.net')
		const sub = relayed[0]?.message
		const json = JSON.stringify(sub ?? {})
		outcome = items === 0
			? `SENT AN EMPTY CARD (${json.length} bytes of envelope, no content)`
			: `ok, ${items} primitive(s) on the card`
	} catch (err) {
		outcome = `rejected -> ${err.message.slice(0, 90)}`
	}

	console.log(`  ${label.padEnd(28)} items=${String(items).padEnd(3)} ${outcome}`)
}

console.log('one-liner input -> what the recipient actually gets:\n')
for (const [label, input] of Object.entries(CASES)) {
	await report(label, input)
}

// the builder still lets you start empty and chain; it is the fire-and-forget path that refuses
import { sendJapRich } from '../lib/index.js'
try {
	await sendJapRich(sock, '628@s.whatsapp.net', {})
	console.log('\nsendJapRich(sock, jid, {})  -> SENT AN EMPTY CARD')
} catch (err) {
	console.log(`\nsendJapRich(sock, jid, {})  -> rejected: ${err.message.slice(0, 60)}…`)
}

const supported = ['addLatex', 'addTask', 'addWidget', 'addProgressStatus', 'addThinkingStatus',
	'addQuotaUpsell', 'addBloks', 'addReels', 'addPost', 'addProduct', 'addSocialEntity',
	'addInlineVideo', 'addContentItems', 'addGenerating']
const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(jap(sock, '# x')))
const present = supported.filter(m => proto.includes(m))
console.log(`\nAIRich can render ${present.length} further primitives (${present.slice(0, 4).join(', ')}, …).`)

// AFTER: every one of them now has a one-liner key, and the socket can send them directly
import { ONE_LINER_KEYS } from '../lib/index.js'
const keys = ['latex', 'task', 'widget', 'progressStatus', 'thinking', 'quotaUpsell', 'bloks',
	'reels', 'post', 'product', 'socialEntity', 'inlineVideo', 'contentItems', 'generating']
console.log(`one-liner keys covering them: ${keys.filter(k => ONE_LINER_KEYS.has(k)).length}/${keys.length}`)

const sendSource = await (await import('fs/promises')).readFile(new URL('../lib/Socket/messages-send.js', import.meta.url), 'utf8')
const helpers = ['sendJapRich', 'sendJapTable', 'sendJapLatex', 'sendRich', 'sendTable', 'sendLatex']
console.log(`socket helpers present: ${helpers.filter(h => sendSource.includes(`${h}: async`)).join(', ')}`)
console.log(`sendMessage routes { table } / { latex } / { rich } / { jap }: ${/resolveJapRichInput/.test(sendSource)}`)
