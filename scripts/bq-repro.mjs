// §2.115 — catalogue/order parsing: NaN numbers and a hard-coded availability.
// §2.116 — a failed catalogue-image upload left the temp file behind.
// Run: node scripts/bq-repro.mjs
import { readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { Readable } from 'node:stream'
import { parseCatalogNode, parseOrderDetailsNode, uploadingNecessaryImages } from '../lib/Utils/business.js'

const text = value => Buffer.from(value)
const product = (id, children) => ({ tag: 'product', attrs: {}, content: children.map(([t, v]) => ({ tag: t, attrs: {}, content: text(v) })).concat([{ tag: 'id', attrs: {}, content: text(id) }]) })

const catalog = {
	tag: 'iq', attrs: {}, content: [{
		tag: 'product_catalog', attrs: {}, content: [
			product('p1', [['name', 'Kopi'], ['price', '25000'], ['currency', 'IDR'], ['availability', 'out of stock']]),
			product('p2', [['name', 'Konsultasi'], ['currency', 'IDR']])   // price on request
		]
	}]
}

const { products } = parseCatalogNode(catalog)
for (const p of products) {
	console.log(`${p.id}  price=${JSON.stringify(p.price)}  availability=${JSON.stringify(p.availability)}`)
}
console.log('  (before: price=null via NaN for p2, and BOTH reported "in stock")\n')

const order = {
	tag: 'iq', attrs: {}, content: [{
		tag: 'order', attrs: {}, content: [
			{ tag: 'product', attrs: {}, content: [{ tag: 'id', attrs: {}, content: text('p1') }, { tag: 'name', attrs: {}, content: text('Kopi') }] },
			{ tag: 'price', attrs: {}, content: [{ tag: 'currency', attrs: {}, content: text('IDR') }] }
		]
	}]
}
const details = parseOrderDetailsNode(order)
console.log('order total:', JSON.stringify(details.price.total), '| first product quantity:', JSON.stringify(details.products[0].quantity))
console.log('  (before: NaN for both)\n')

// §2.116 — the upload fails; does the temp file survive?
const before = new Set(readdirSync(tmpdir()).filter(f => f.startsWith('img')))
try {
	await uploadingNecessaryImages([{ stream: Readable.from([Buffer.alloc(1024, 1)]) }], async () => {
		throw new Error('upload timed out')
	})
} catch (err) {
	console.log('upload failed as expected:', err.message)
}
const leaked = readdirSync(tmpdir()).filter(f => f.startsWith('img') && !before.has(f))
console.log('temp files left behind:', leaked.length, leaked.map(f => `${f} (${statSync(`${tmpdir()}/${f}`).size}B)`).join(', '))
console.log('  (before: 1 leaked file per failed image, forever)')
