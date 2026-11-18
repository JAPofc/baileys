// §2.133 — a `t` attribute off the wire must not become 1970 or an Invalid Date.
// §2.134 — picture/business details for a whole batch in one usync query.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { USyncStatusProtocol } from '../lib/WAUSync/Protocols/USyncStatusProtocol.js'
import { USyncDisappearingModeProtocol } from '../lib/WAUSync/Protocols/USyncDisappearingModeProtocol.js'
import { USyncPictureProtocol, USyncBusinessProtocol, USyncQuery, USyncUser } from '../lib/index.js'

const statusNode = attrs => ({ tag: 'status', attrs, content: Buffer.from('hi') })

test('§2.133 a missing or unusable status timestamp is undefined, not 1970', () => {
	const p = new USyncStatusProtocol()
	assert.equal(p.parser(statusNode({})).setAt, undefined)
	assert.equal(p.parser(statusNode({ t: 'abc' })).setAt, undefined)
	assert.equal(p.parser(statusNode({ t: '' })).setAt, undefined)
	assert.equal(p.parser(statusNode({ t: '0' })).setAt, undefined)
})

test('§2.133 a real status timestamp is unchanged and safe to serialise', () => {
	const out = new USyncStatusProtocol().parser(statusNode({ t: '1700000000' }))
	assert.equal(out.setAt.toISOString(), '2023-11-14T22:13:20.000Z')
	assert.equal(out.status, 'hi')
})

test('§2.133 disappearing mode reports no duration instead of NaN', () => {
	const p = new USyncDisappearingModeProtocol()
	const node = attrs => ({ tag: 'disappearing_mode', attrs })
	assert.equal(p.parser(node({ t: '1700000000' })).duration, undefined)
	assert.equal(p.parser(node({ duration: 'soon' })).duration, undefined)
	assert.equal(p.parser(node({ duration: '604800' })).duration, 604800)
	assert.equal(p.parser(node({ duration: '604800' })).setAt, undefined)
})

test('§2.134 the picture protocol asks for a url and reads one back', () => {
	const p = new USyncPictureProtocol('image')
	assert.deepEqual(p.getQueryElement(), { tag: 'picture', attrs: { type: 'image', query: 'url' } })
	assert.equal(p.getUserElement({}), null)
	assert.deepEqual(p.getUserElement({ pictureId: 17 }), { tag: 'picture', attrs: { id: '17' } })
	const parsed = p.parser({ tag: 'picture', attrs: { id: '172', url: 'https://x/1.jpg', direct_path: '/1.jpg', hash: 'h' } })
	assert.deepEqual(parsed, { id: '172', url: 'https://x/1.jpg', directPath: '/1.jpg', hash: 'h', type: 'image' })
	assert.equal(p.parser({ tag: 'picture', attrs: {} }), null, 'an empty picture node is not a result')
	assert.equal(p.parser({ tag: 'status', attrs: {} }), null)
})

test('§2.134 an unknown picture type falls back to preview', () => {
	assert.equal(new USyncPictureProtocol('full').type, 'preview')
	assert.equal(new USyncPictureProtocol().type, 'preview')
})

test('§2.134 the business protocol reads name, hours, address and flags', () => {
	const p = new USyncBusinessProtocol()
	const node = {
		tag: 'business',
		attrs: { pn_jid: '62811@s.whatsapp.net' },
		content: [
			{ tag: 'verified_name', attrs: { verified_level: 'high' }, content: Buffer.from('Toko Kopi') },
			{
				tag: 'profile',
				attrs: { tag: 'v1', catalog_exists: 'true', cart_enabled: 'false' },
				content: [
					{ tag: 'address', attrs: {}, content: Buffer.from('Jl. Sudirman 1') },
					{
						tag: 'business_hours',
						attrs: { timezone: 'Asia/Jakarta' },
						content: [{ tag: 'business_hours_config', attrs: { day_of_week: 'mon', open_time: '0900', close_time: '1700', mode: 'specific_hours' } }]
					}
				]
			}
		]
	}
	const out = p.parser(node)
	assert.equal(out.verifiedName, 'Toko Kopi')
	assert.equal(out.verifiedLevel, 'high')
	assert.equal(out.address, 'Jl. Sudirman 1')
	assert.equal(out.catalogExists, true)
	assert.equal(out.cartEnabled, false)
	assert.equal(out.businessHours.timezone, 'Asia/Jakarta')
	assert.equal(out.businessHours.config[0].openTime, '0900')
	assert.equal(out.pnJid, '62811@s.whatsapp.net')
})

test('§2.134 missing business fields are null rather than invented', () => {
	const out = new USyncBusinessProtocol().parser({ tag: 'business', attrs: {}, content: [] })
	assert.deepEqual(out, {
		verifiedName: null,
		verifiedLevel: null,
		profileTag: null,
		address: null,
		businessHours: null,
		catalogExists: null,
		cartEnabled: null,
		pnJid: null
	})
})

test('§2.135 a parser that reads `this` is still invoked bound to its protocol', () => {
	const q = new USyncQuery().withPictureProtocol('image')
	const result = {
		tag: 'iq',
		attrs: { type: 'result' },
		content: [{
			tag: 'usync', attrs: {}, content: [{
				tag: 'list', attrs: {}, content: [
					// no `type` attribute: the parser has to fall back to its own this.type
					{ tag: 'user', attrs: { jid: '1@s.whatsapp.net' }, content: [{ tag: 'picture', attrs: { id: '9', url: 'https://x/b.jpg' } }] }
				]
			}]
		}]
	}
	const out = q.parseUSyncQueryResult(result)
	assert.equal(out.list[0].picture.type, 'image')
})

test('§2.134 both protocols ride in one query and parse per user', () => {
	const q = new USyncQuery()
		.withPictureProtocol('image')
		.withBusinessProtocol()
		.withUsers(new USyncUser().withId('62811@s.whatsapp.net'), new USyncUser().withId('62822@s.whatsapp.net'))
	assert.equal(q.protocols.length, 2)
	const result = {
		tag: 'iq',
		attrs: { type: 'result' },
		content: [{
			tag: 'usync', attrs: {}, content: [{
				tag: 'list', attrs: {}, content: [
					{ tag: 'user', attrs: { jid: '62811@s.whatsapp.net' }, content: [{ tag: 'picture', attrs: { id: '1', url: 'https://x/a.jpg' } }] },
					{ tag: 'user', attrs: { jid: '62822@s.whatsapp.net' }, content: [{ tag: 'picture', attrs: { error: 'not-authorized', code: '401' } }] }
				]
			}]
		}]
	}
	const out = q.parseUSyncQueryResult(result)
	assert.equal(out.list.length, 2)
	assert.equal(out.list[0].picture.url, 'https://x/a.jpg')
	assert.equal(out.list[1].picture, undefined, "a refused picture must not sink the other user's result")
	assert.equal(out.list[1].id, '62822@s.whatsapp.net')
})
