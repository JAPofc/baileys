// §2.115 — catalogue/order parsing: real availability, no NaN.
// §2.116 — a failed catalogue-image upload must not leak its temp file.
// §2.117 — getCatalogAll() walks the cursor; the parsers are exported.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { Readable } from 'node:stream'
import { readFileSync } from 'node:fs'
import { parseCatalogNode, parseOrderDetailsNode, parseProductNode, uploadingNecessaryImages } from '../lib/index.js'

const text = v => Buffer.from(v)
const child = (tag, value) => ({ tag, attrs: {}, content: text(value) })
const productNode = (id, pairs, attrs = {}) => ({
	tag: 'product', attrs,
	content: [child('id', id), ...pairs.map(([t, v]) => child(t, v))]
})

test('§2.115 availability comes from the node instead of being assumed', () => {
	const out = parseProductNode(productNode('p1', [['name', 'Kopi'], ['availability', 'out of stock']]))
	assert.equal(out.availability, 'out of stock')
	const unknown = parseProductNode(productNode('p2', [['name', 'Teh']]))
	assert.equal(unknown.availability, 'in stock', 'no node ⇒ the old default')
})

test('§2.115 a missing price is undefined, never NaN', () => {
	const priced = parseProductNode(productNode('p1', [['price', '25000'], ['currency', 'IDR']]))
	assert.equal(priced.price, 25000)
	const onRequest = parseProductNode(productNode('p2', [['currency', 'IDR']]))
	assert.equal(onRequest.price, undefined)
	assert.notEqual(Number.isNaN(onRequest.price), true)
	assert.equal(JSON.parse(JSON.stringify(onRequest)).price, undefined)
	// a junk value is rejected rather than turned into NaN
	assert.equal(parseProductNode(productNode('p3', [['price', 'gratis']])).price, undefined)
})

test('§2.115 order details keep their numbers honest', () => {
	const order = {
		tag: 'iq', attrs: {}, content: [{
			tag: 'order', attrs: {}, content: [
				{ tag: 'product', attrs: {}, content: [child('id', 'p1'), child('name', 'Kopi'), child('price', '25000'), child('quantity', '2')] },
				{ tag: 'product', attrs: {}, content: [child('id', 'p2'), child('name', 'Teh')] },
				{ tag: 'price', attrs: {}, content: [child('currency', 'IDR')] }
			]
		}]
	}
	const details = parseOrderDetailsNode(order)
	assert.equal(details.products[0].price, 25000)
	assert.equal(details.products[0].quantity, 2)
	assert.equal(details.products[1].price, undefined)
	assert.equal(details.products[1].quantity, undefined)
	assert.equal(details.price.total, undefined)
	assert.equal(details.price.currency, 'IDR')
})

test('§2.115 the catalogue node still parses its paging cursor', () => {
	const node = {
		tag: 'iq', attrs: {}, content: [{
			tag: 'product_catalog', attrs: {}, content: [
				productNode('p1', [['name', 'Kopi']], { is_hidden: 'true' }),
				{ tag: 'paging', attrs: {}, content: [child('after', 'CURSOR-1')] }
			]
		}]
	}
	const parsed = parseCatalogNode(node)
	assert.equal(parsed.products.length, 1)
	assert.equal(parsed.products[0].isHidden, true)
	assert.equal(parsed.nextPageCursor, 'CURSOR-1')
})

test('§2.116 a failed upload leaves no temp file behind', async () => {
	const before = new Set(readdirSync(tmpdir()).filter(f => f.startsWith('img')))
	await assert.rejects(() => uploadingNecessaryImages(
		[{ stream: Readable.from([Buffer.alloc(2048, 1)]) }],
		async () => { throw new Error('upload timed out') }
	), /upload timed out/)
	const leaked = readdirSync(tmpdir()).filter(f => f.startsWith('img') && !before.has(f))
	assert.deepEqual(leaked, [], `leaked ${leaked.join(', ')}`)
})

test('§2.116 an already-uploaded image is passed straight through', async () => {
	const out = await uploadingNecessaryImages([{ url: 'https://mmg.whatsapp.net/x.jpg' }], async () => {
		throw new Error('should not upload')
	})
	assert.deepEqual(out, [{ url: 'https://mmg.whatsapp.net/x.jpg' }])
})

test('§2.117 getCatalogAll walks the cursor, stops on repeats and respects limits', () => {
	const src = readFileSync(new URL('../lib/Socket/business.js', import.meta.url), 'utf8')
	const body = src.slice(src.indexOf('const getCatalogAll = async'), src.indexOf('const getCollections = async'))
	const pages = {
		undefined: { products: [{ id: 'p1' }, { id: 'p2' }], nextPageCursor: 'c1' },
		c1: { products: [{ id: 'p3' }], nextPageCursor: 'c2' },
		c2: { products: [{ id: 'p4' }], nextPageCursor: undefined }
	}
	const calls = []
	const getCatalog = async ({ cursor }) => { calls.push(cursor); return pages[String(cursor)] }
	const getCatalogAll = new Function('getCatalog', `${body}; return getCatalogAll`)(getCatalog)

	return (async () => {
		const all = await getCatalogAll({ jid: 'biz@s.whatsapp.net', pageSize: 2 })
		assert.deepEqual(all.products.map(p => p.id), ['p1', 'p2', 'p3', 'p4'])
		assert.equal(all.pages, 3)
		assert.equal(all.truncated, false)
		assert.deepEqual(calls, [undefined, 'c1', 'c2'])

		const capped = await getCatalogAll({ pageSize: 2, limit: 3 })
		assert.equal(capped.products.length, 3)
		assert.equal(capped.truncated, true)

		const oneOnly = await getCatalogAll({ pageSize: 2, maxPages: 1 })
		assert.equal(oneOnly.pages, 1)
		assert.equal(oneOnly.truncated, true)

		// a server echoing the same cursor must not loop forever
		const loop = new Function('getCatalog', `${body}; return getCatalogAll`)(async () => ({ products: [{ id: 'x' }], nextPageCursor: 'same' }))
		const looped = await loop({ pageSize: 2 })
		assert.ok(looped.pages <= 2, `looped ${looped.pages} times`)
	})()
})

test('§2.117 the catalogue parsers are exported from the package root', async () => {
	const mod = await import('../lib/index.js')
	for (const name of ['parseCatalogNode', 'parseProductNode', 'parseOrderDetailsNode', 'parseCollectionsNode', 'toProductNode', 'uploadingNecessaryImages', 'uploadingNecessaryImagesOfProduct']) {
		assert.equal(typeof mod[name], 'function', name)
	}
})
