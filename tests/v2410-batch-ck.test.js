// A family of the same mistake: an async call started with `void` (or from a timer) whose
// rejection had nowhere to go. Since Node 15 an unhandled rejection terminates the process by
// default, so each of these is a library function that can kill the host bot.
//
// §2.196 — media-set groupLabel(): documented as swallowing errors, actually crashed.
// §2.197 — scheduling: a throwing onSent/onFailed escaped the interval.
// §2.198 — button-sender: the local echo upsert rejected into nothing.
// §2.199 — auto-update: a throwing onError handler crashed the process it reports for.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { groupLabel, groupSetMemberLabel } from '../lib/Utils/media-set.js'
import { MessageScheduler } from '../lib/Utils/scheduling.js'
import { enableAutoUpdate, disableAutoUpdate } from '../lib/Builders/auto-update.js'
import { sendInteractiveMessage } from '../lib/Utils/button-sender.js'

/**
 * Runs `fn` while watching for an unhandled rejection. node:test installs its own handler, so
 * we take it off for the duration and put it back afterwards.
 */
const watchUnhandled = async (fn, settleMs = 60) => {
	const existing = process.listeners('unhandledRejection')
	for (const l of existing) {
		process.off('unhandledRejection', l)
	}
	const caught = []
	const spy = err => caught.push(err)
	process.on('unhandledRejection', spy)
	try {
		await fn()
		await new Promise(r => setTimeout(r, settleMs))
	} finally {
		process.off('unhandledRejection', spy)
		for (const l of existing) {
			process.on('unhandledRejection', l)
		}
	}
	return caught
}

describe('§2.196 media-set fire-and-forget', () => {
	test('a failing relay does not crash the process', async () => {
		const sock = { relayMessage: async () => { throw new Error('relay gagal') } }

		const caught = await watchUnhandled(async () => {
			await groupLabel('1@g.us', 'label', sock)
		})

		assert.deepEqual(caught.map(e => e.message), [],
			'`void asyncThing()` inside try/catch catches nothing — the rejection used to escape')
	})

	test('it still returns without throwing, as documented', async () => {
		const sock = { relayMessage: async () => { throw new Error('relay gagal') } }
		await assert.doesNotReject(groupLabel('1@g.us', 'label', sock))
	})

	test('the awaiting sibling still surfaces failures to its caller', async () => {
		const sock = { relayMessage: async () => { throw new Error('relay gagal') } }
		await assert.rejects(groupSetMemberLabel('1@g.us', 'label', sock), /relay gagal/,
			'groupSetMemberLabel is the variant you use when you want to know')
	})

	test('the label is truncated to WhatsApp\'s 30 characters', async () => {
		const sent = []
		const sock = { relayMessage: async (jid, content) => { sent.push(content); return 'ok' } }
		await groupSetMemberLabel('1@g.us', 'x'.repeat(50), sock)
		assert.equal(sent[0].protocolMessage.memberLabel.label.length, 30)
	})

	test('the label timestamp is in seconds, not milliseconds', async () => {
		const sent = []
		const sock = { relayMessage: async (jid, content) => { sent.push(content); return 'ok' } }
		await groupSetMemberLabel('1@g.us', 'label', sock)
		const ts = Number(sent[0].protocolMessage.memberLabel.labelTimestamp)
		const nowSeconds = Math.floor(Date.now() / 1000)
		assert.ok(Math.abs(ts - nowSeconds) < 60, `expected unix seconds, got ${ts}`)
	})
})

describe('§2.197 scheduler callbacks', () => {
	test('a throwing onFailed does not take the process down', async () => {
		const errors = []
		const scheduler = new MessageScheduler(
			async () => { throw new Error('kirim gagal') },
			{
				checkInterval: 10,
				onFailed: () => { throw new Error('callback pengguna melempar') },
				onError: err => errors.push(err)
			}
		)

		const caught = await watchUnhandled(async () => {
			scheduler.schedule('1@s.whatsapp.net', { text: 'hai' }, new Date(Date.now() + 20))
			await new Promise(r => setTimeout(r, 120))
		})
		scheduler.stop()

		assert.deepEqual(caught.map(e => e.message), [])
		assert.deepEqual(errors.map(e => e.message), ['callback pengguna melempar'],
			'and the failure is reported rather than silently dropped')
	})

	test('a throwing onSent is contained too', async () => {
		const errors = []
		const scheduler = new MessageScheduler(
			async () => ({ key: { id: 'M1' } }),
			{ checkInterval: 10, onSent: () => { throw new Error('onSent melempar') }, onError: e => errors.push(e) }
		)

		const caught = await watchUnhandled(async () => {
			scheduler.schedule('1@s.whatsapp.net', { text: 'hai' }, new Date(Date.now() + 20))
			await new Promise(r => setTimeout(r, 120))
		})
		scheduler.stop()

		assert.deepEqual(caught.map(e => e.message), [])
		assert.deepEqual(errors.map(e => e.message), ['onSent melempar'])
	})

	test('§2.200 a throwing onSent does not turn a delivered message into a failure', () => new Promise(resolve => {
		// the nasty one: the message WAS sent. A logging hiccup in onSent used to land in the
		// send's own catch, mark the item 'failed' and call onFailed -- so anyone who retries
		// on failure sent the message twice.
		const failures = []
		const scheduler = new MessageScheduler(
			async () => ({ key: { id: 'M1' } }),
			{
				checkInterval: 10,
				onSent: () => { throw new Error('logging gagal') },
				onFailed: (sched, err) => failures.push([sched.status, err.message]),
				onError: () => {}
			}
		)
		scheduler.schedule('1@s.whatsapp.net', { text: 'hai' }, new Date(Date.now() + 20))
		setTimeout(() => {
			scheduler.stop()
			assert.deepEqual(failures, [], 'a delivered message must never be reported as failed')
			resolve()
		}, 120)
	}))

	test('a normal send still reports through onSent and clears the queue', async () => {
		const sent = []
		const scheduler = new MessageScheduler(
			async () => ({ key: { id: 'M1' } }),
			{ checkInterval: 10, onSent: s => sent.push(s.jid) }
		)
		scheduler.schedule('1@s.whatsapp.net', { text: 'hai' }, new Date(Date.now() + 20))
		await new Promise(r => setTimeout(r, 120))
		scheduler.stop()

		assert.deepEqual(sent, ['1@s.whatsapp.net'])
		assert.equal(scheduler.queue.size, 0)
	})
})

describe('§2.199 auto-update error reporting', () => {
	test('a throwing onError handler does not crash the process it reports for', async () => {
		const caught = await watchUnhandled(async () => {
			enableAutoUpdate({
				url: 'https://contoh.invalid/defs.json',
				intervalMs: 300_000,
				fetchImpl: async () => { throw new Error('jaringan mati') },
				onError: () => { throw new Error('onError pengguna melempar') }
			})
			await new Promise(r => setTimeout(r, 80))
		})
		disableAutoUpdate()

		assert.deepEqual(caught.map(e => e.message), [])
	})

	test('a well-behaved onError still receives the fetch failure', async () => {
		const seen = []
		enableAutoUpdate({
			url: 'https://contoh.invalid/defs.json',
			intervalMs: 300_000,
			fetchImpl: async () => { throw new Error('jaringan mati') },
			onError: err => seen.push(err.message)
		})
		await new Promise(r => setTimeout(r, 80))
		disableAutoUpdate()

		assert.deepEqual(seen, ['jaringan mati'])
	})
})

describe('§2.198 button-sender local echo', () => {
	const mkSock = (upsert) => ({
		logger: { warn() {}, error() {}, info() {}, debug() {} },
		config: { emitOwnEvents: true },
		authState: { creds: { me: { id: '62811:1@s.whatsapp.net' } } },
		relayMessage: async () => 'ok',
		processingMutex: { mutex: fn => Promise.resolve().then(fn) },
		upsertMessage: upsert
	})
	const content = {
		text: 'Pilih aksi',
		interactiveButtons: [
			{ name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'Halo', id: 'halo' }) }
		],
		footer: 'Footer'
	}

	test('a failing local echo does not crash the process', async () => {
		const sock = mkSock(async () => { throw new Error('upsert gagal') })

		const caught = await watchUnhandled(async () => {
			const msg = await sendInteractiveMessage(sock, '1@s.whatsapp.net', content)
			assert.ok(msg?.key?.id, 'the send itself still succeeds')
		})

		assert.deepEqual(caught.map(e => e.message), [],
			'the echo is best-effort; its rejection used to escape into nothing')
	})

	test('a working local echo is still performed', async () => {
		const echoed = []
		const sock = mkSock(async (msg, type) => { echoed.push(type) })
		await sendInteractiveMessage(sock, '1@s.whatsapp.net', content)
		await new Promise(r => setTimeout(r, 20))
		assert.deepEqual(echoed, ['append'])
	})
})
