// §2.126 — group-admin gates must not be skipped in a private chat.
// §2.127 — handle() never throws, whatever a callback or resolver does.
// §2.128 — the group-admin resolver cache is bounded and TTL-pruned.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CommandRouter, CommandOutcome, PermissionReason, createGroupAdminResolver } from '../lib/Framework/CommandRouter.js'

const quiet = { error: () => {}, warn: () => {}, info: () => {}, debug: () => {}, trace: () => {}, child: () => quiet }
const router = opts => new CommandRouter({ prefixes: '!', logger: quiet, ...opts })

test('§2.126 an adminOnly command is refused in a DM instead of running', async () => {
	let ran = 0
	const r = router({ isAdmin: async () => false })
	r.command({ name: 'kick', adminOnly: true, handler: async () => { ran++ } })
	const out = await r.handle({ text: '!kick @x', isGroup: false, sender: '1@s.whatsapp.net' })
	assert.equal(ran, 0)
	assert.equal(out.outcome, CommandOutcome.PERMISSION)
	assert.equal(out.reason, PermissionReason.GROUP)
})

test('§2.126 a botAdmin command is refused in a DM too', async () => {
	const r = router({ isBotAdmin: async () => true })
	r.command({ name: 'promote', botAdmin: true, handler: async () => assert.fail('must not run') })
	const out = await r.handle({ text: '!promote', isGroup: false, sender: '1@s.whatsapp.net' })
	assert.equal(out.reason, PermissionReason.GROUP)
})

test('§2.126 the group path is unchanged: admins run, non-admins are denied', async () => {
	let ran = 0
	const r = router({ isAdmin: async ctx => ctx.sender === 'boss@s.whatsapp.net' })
	r.command({ name: 'kick', adminOnly: true, handler: async () => { ran++ } })
	const denied = await r.handle({ text: '!kick', isGroup: true, sender: 'rando@s.whatsapp.net' })
	assert.equal(denied.reason, PermissionReason.ADMIN)
	const ok = await r.handle({ text: '!kick', isGroup: true, sender: 'boss@s.whatsapp.net' })
	assert.equal(ok.outcome, CommandOutcome.OK)
	assert.equal(ran, 1)
})

test('§2.126 an ungated command still works in a DM', async () => {
	const r = router()
	r.command('ping', async ctx => ctx.replied = true)
	const ctx = { text: '!ping', isGroup: false, sender: 'a@s.whatsapp.net' }
	assert.equal((await r.handle(ctx)).outcome, CommandOutcome.OK)
	assert.equal(ctx.replied, true)
})

test('§2.127 a throwing onUnknown does not escape and does not change the outcome', async () => {
	const r = router({ onUnknown: () => { throw new Error('boom') } })
	const out = await r.handle({ text: '!nope', sender: 'a@s.whatsapp.net' })
	assert.equal(out.outcome, CommandOutcome.UNKNOWN)
	assert.equal(out.command, 'nope')
})

test('§2.127 a throwing onPermissionDenied keeps the permission outcome', async () => {
	const r = router({ ownerJids: ['owner@s.whatsapp.net'], onPermissionDenied: async () => { throw new Error('boom') } })
	r.command({ name: 'shutdown', ownerOnly: true, handler: async () => assert.fail('must not run') })
	const out = await r.handle({ text: '!shutdown', sender: 'rando@s.whatsapp.net' })
	assert.equal(out.outcome, CommandOutcome.PERMISSION)
	assert.equal(out.reason, PermissionReason.OWNER)
})

test('§2.127 a throwing isAdmin refuses the command and reports it', async () => {
	const r = router({ isAdmin: async () => { throw new Error('metadata fetch failed') } })
	r.command({ name: 'x', adminOnly: true, handler: async () => assert.fail('must not run') })
	const out = await r.handle({ text: '!x', isGroup: true, sender: 'a@s.whatsapp.net' })
	assert.equal(out.outcome, CommandOutcome.ERROR)
	assert.equal(out.command, 'x')
	assert.equal(out.executed, false)
	assert.match(out.error.message, /metadata fetch failed/)
})

test('§2.127 a throwing custom permission is contained as well', async () => {
	const r = router()
	r.command({ name: 'x', permission: () => { throw new Error('nope') }, handler: async () => assert.fail('must not run') })
	const out = await r.handle({ text: '!x', sender: 'a@s.whatsapp.net' })
	assert.equal(out.outcome, CommandOutcome.ERROR)
})

test('§2.127 a throwing onCooldown keeps the cooldown outcome', async () => {
	let t = 1000
	const r = router({ now: () => t, onCooldown: () => { throw new Error('boom') } })
	r.command({ name: 'slow', cooldownMs: 5000, handler: async () => {} })
	assert.equal((await r.handle({ text: '!slow', sender: 'a@s.whatsapp.net' })).outcome, CommandOutcome.OK)
	t += 1000
	const out = await r.handle({ text: '!slow', sender: 'a@s.whatsapp.net' })
	assert.equal(out.outcome, CommandOutcome.COOLDOWN)
	assert.equal(out.remainingMs, 4000)
})

test('§2.127 middleware() still calls next() for unmatched text after a callback throws', async () => {
	const r = router({ onUnknown: () => { throw new Error('boom') } })
	let nexted = 0
	await r.middleware()({ text: '!nope', sender: 'a@s.whatsapp.net' }, async () => { nexted++ })
	assert.equal(nexted, 1)
})

test('§2.128 the resolver cache is capped at maxEntries', async () => {
	const sock = { groupMetadata: async () => ({ participants: [] }) }
	const resolve = createGroupAdminResolver(sock, { cacheMs: 600000, maxEntries: 50 })
	for (let i = 0; i < 400; i++) await resolve({ remoteJid: `${i}@g.us`, sender: 'a@s.whatsapp.net' })
	assert.ok(resolve.cacheSize <= 50, `cacheSize ${resolve.cacheSize}`)
	resolve.clearCache()
	assert.equal(resolve.cacheSize, 0)
})

test('§2.128 stale entries are dropped and a live entry is still served from cache', async () => {
	let calls = 0
	const sock = {
		groupMetadata: async () => {
			calls++
			return { participants: [{ id: 'boss@s.whatsapp.net', admin: 'superadmin' }] }
		}
	}
	const resolve = createGroupAdminResolver(sock, { cacheMs: 600000 })
	const ctx = { remoteJid: 'g@g.us', sender: 'boss@s.whatsapp.net' }
	assert.equal(await resolve(ctx), true)
	assert.equal(await resolve(ctx), true)
	assert.equal(calls, 1)
	assert.equal(resolve.cacheSize, 1)
	assert.equal(await resolve({ remoteJid: 'g@g.us', sender: 'rando@s.whatsapp.net' }), false)
})

test('§2.128 a failing groupMetadata still resolves to false', async () => {
	const resolve = createGroupAdminResolver({ groupMetadata: async () => { throw new Error('offline') } })
	assert.equal(await resolve({ remoteJid: 'g@g.us', sender: 'a@s.whatsapp.net' }), false)
})
