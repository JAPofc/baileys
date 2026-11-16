// §2.93 — the group sender-key memory is committed only after the stanza is sent, and can
// be inspected/cleared through a supported API.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { clearSenderKeyMemory, readSenderKeyMemory, forgetSenderKeyDevices } from '../lib/index.js'

const GROUP = '120363000@g.us'
const DEV_A = '628a@s.whatsapp.net:0'
const DEV_B = '628b@s.whatsapp.net:0'

const fakeKeys = (initial = {}) => {
	const store = structuredClone(initial)
	return {
		store,
		get: async (type, ids) => {
			assert.equal(type, 'sender-key-memory')
			return Object.fromEntries(ids.map(id => [id, store[id]]))
		},
		set: async data => {
			for (const [jid, value] of Object.entries(data['sender-key-memory'])) {
				if (value === null) delete store[jid]
				else store[jid] = value
			}
		}
	}
}

test('§2.93 the memory is persisted after the send, not before it', () => {
	const src = readFileSync(new URL('../lib/Socket/messages-send.js', import.meta.url), 'utf8')
	const lines = src.split('\n')
	const markAt = lines.findIndex(line => /senderKeyMap\[deviceJid\] = true/.test(line))
	const sendAt = lines.findIndex((line, i) => i > markAt && line.includes('await sendNode(stanza);'))
	const persistAt = lines.findIndex(line => /'sender-key-memory': \{/.test(line))
	assert.ok(markAt > 0 && sendAt > markAt, 'could not locate the group send path')
	assert.ok(persistAt > sendAt, `sender-key-memory is persisted at line ${persistAt + 1}, before the send at ${sendAt + 1}`)
	const code = src.split('\n').filter(line => !/^\s*(\*|\/\/|\/\*)/.test(line)).join('\n')
	assert.match(code, /pendingSenderKeyMemory = \{ jid, senderKeyMap \};/)
	assert.match(code, /if \(pendingSenderKeyMemory\) \{/)
})

test('§2.93 readSenderKeyMemory reports what the session believes', async () => {
	const keys = fakeKeys({ [GROUP]: { [DEV_A]: true, [DEV_B]: true } })
	assert.deepEqual(await readSenderKeyMemory(keys, GROUP), { [GROUP]: { [DEV_A]: true, [DEV_B]: true } })
	assert.deepEqual(await readSenderKeyMemory(keys, 'status@broadcast'), { 'status@broadcast': {} })
	assert.deepEqual(await readSenderKeyMemory(keys, [GROUP, 'status@broadcast']), {
		[GROUP]: { [DEV_A]: true, [DEV_B]: true },
		'status@broadcast': {}
	})
	await assert.rejects(readSenderKeyMemory(keys, []), /at least one group jid/)
	await assert.rejects(readSenderKeyMemory(keys, '628@s.whatsapp.net'), /is not a group jid/)
})

test('§2.93 clearSenderKeyMemory resets a group and reports what it dropped', async () => {
	const keys = fakeKeys({ [GROUP]: { [DEV_A]: true, [DEV_B]: true }, 'other@g.us': { [DEV_A]: true } })
	assert.deepEqual(await clearSenderKeyMemory(keys, GROUP), { cleared: 1, devices: 2 })
	assert.equal(keys.store[GROUP], undefined)
	assert.deepEqual(keys.store['other@g.us'], { [DEV_A]: true }, 'other groups must be untouched')
	// clearing a group we never keyed is a no-op, not an error
	assert.deepEqual(await clearSenderKeyMemory(keys, GROUP), { cleared: 1, devices: 0 })
	assert.deepEqual(await clearSenderKeyMemory(keys, [GROUP, 'other@g.us']), { cleared: 2, devices: 1 })
	assert.deepEqual(keys.store, {})
})

test('§2.93 forgetSenderKeyDevices only drops the devices you name', async () => {
	const keys = fakeKeys({ [GROUP]: { [DEV_A]: true, [DEV_B]: true } })
	assert.deepEqual(await forgetSenderKeyDevices(keys, GROUP, DEV_A), { removed: 1, remaining: 1 })
	assert.deepEqual(keys.store[GROUP], { [DEV_B]: true })
	// a device that was never there is reported honestly
	assert.deepEqual(await forgetSenderKeyDevices(keys, GROUP, 'nobody@s.whatsapp.net:0'), { removed: 0, remaining: 1 })
	assert.deepEqual(await forgetSenderKeyDevices(keys, GROUP, [DEV_B, 'nobody@s.whatsapp.net:0']), { removed: 1, remaining: 0 })
	await assert.rejects(forgetSenderKeyDevices(keys, GROUP, []), /at least one device jid/)
	await assert.rejects(forgetSenderKeyDevices(keys, '628@s.whatsapp.net', DEV_A), /is not a group jid/)
})

test('§2.93 the socket exposes all three, and they are typed', () => {
	const src = readFileSync(new URL('../lib/Socket/messages-send.js', import.meta.url), 'utf8')
	for (const name of ['clearSenderKeyMemory', 'readSenderKeyMemory', 'forgetSenderKeyDevices']) {
		assert.match(src, new RegExp(`\\n\\s+${name}: async `), name)
		for (const file of ['../lib/Socket/messages-send.d.ts', '../lib/Socket/index.d.ts']) {
			assert.match(readFileSync(new URL(file, import.meta.url), 'utf8'), new RegExp(`${name}:`), `${name} in ${file}`)
		}
	}
})
