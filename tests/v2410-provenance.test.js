import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'

import {
	ATTRIBUTION_TRACES,
	BUILD_TAG,
	PROVENANCE,
	MIN_SIGNIFICANT_TOKENS,
	SIMILARITY_STRONG,
	fingerprintSource,
	findAttributionTraces,
	matchAgainstManifest,
	mintId,
	sketchSimilarity,
	tokenizeForFingerprint,
	verifyProvenance
} from '../lib/Utils/provenance.js'

const ORIGINAL = `
/**
 * Send a message with retries.
 */
export async function sendWithRetry(socket, jid, content, options = {}) {
	const attempts = options.attempts ?? 3
	let lastError = null
	for (let attempt = 0; attempt < attempts; attempt++) {
		try {
			const receipt = await socket.sendMessage(jid, content, options)
			if (receipt && receipt.key && receipt.key.id) {
				return receipt
			}
			throw new Error('no receipt returned for ' + jid)
		} catch (error) {
			lastError = error
			if (attempt + 1 < attempts) {
				await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)))
			}
		}
	}
	throw lastError
}
`

describe('provenance fingerprints (anti-rename)', () => {
	it('survives renaming every identifier', () => {
		const renamed = ORIGINAL
			.replace(/sendWithRetry/g, 'kirimUlang')
			.replace(/socket/g, 'conn')
			.replace(/receipt/g, 'r')
			.replace(/lastError/g, 'e2')
			.replace(/attempt/g, 'i')

		assert.equal(
			fingerprintSource(renamed).structural,
			fingerprintSource(ORIGINAL).structural,
			'renaming identifiers must not change the fingerprint'
		)
	})

	it('survives stripped comments, reindentation and minified whitespace', () => {
		const stripped = ORIGINAL
			.replace(/\/\*[\s\S]*?\*\//g, '')
			.replace(/^\s+/gm, '')
			.replace(/\n/g, ' ')

		assert.equal(fingerprintSource(stripped).structural, fingerprintSource(ORIGINAL).structural)
	})

	it('survives rewritten string literals, which is how brands get swapped', () => {
		const rebranded = ORIGINAL.replace("'no receipt returned for '", "'gagal kirim ke '")
		assert.equal(fingerprintSource(rebranded).structural, fingerprintSource(ORIGINAL).structural)
	})

	it('changes when the code genuinely changes', () => {
		const edited = ORIGINAL.replace('throw lastError', 'return null')
		assert.notEqual(fingerprintSource(edited).structural, fingerprintSource(ORIGINAL).structural)
	})

	it('still recognises a copy that has been edited', () => {
		const edited = ORIGINAL
			.replace(/socket/g, 'conn')
			.replace('const attempts = options.attempts ?? 3', 'const attempts = Number(options.attempts) || 5')
			.replace('250 * (attempt + 1)', '500')
		const similarity = sketchSimilarity(
			fingerprintSource(ORIGINAL).sketch,
			fingerprintSource(edited).sketch
		)
		assert.ok(similarity >= SIMILARITY_STRONG, `expected a strong match, got ${similarity}`)
	})

	it('does not match unrelated code', () => {
		const unrelated = `
			export function formatBytes(n) {
				const units = ['B', 'KB', 'MB', 'GB']
				let index = 0
				while (n >= 1024 && index < units.length - 1) {
					n = n / 1024
					index++
				}
				return n.toFixed(1) + ' ' + units[index]
			}
			export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
		`
		const similarity = sketchSimilarity(
			fingerprintSource(ORIGINAL).sketch,
			fingerprintSource(unrelated).sketch
		)
		assert.ok(similarity < 0.2, `unrelated code should not match, got ${similarity}`)
	})

	it('fingerprints a real module of ours identically after a rename sweep', () => {
		const source = readFileSync(new URL('../lib/Utils/messages-media.js', import.meta.url), 'utf8')
		const renamed = source
			.replace(/\bassertSafeHttpUrl\b/g, 'checkUrl')
			.replace(/\bgetHttpStream\b/g, 'grabStream')
			.replace(/\/\*\*[\s\S]*?\*\//g, '')
		assert.equal(fingerprintSource(renamed).structural, fingerprintSource(source).structural)
	})
})

describe('provenance tokenizer', () => {
	it('collapses identifiers but keeps keywords and structure', () => {
		const tokens = tokenizeForFingerprint('const alpha = await beta(1, "x")')
		assert.deepEqual(tokens, ['const', '$', '=', 'await', '$', '(', '0', ',', '"s"', ')'])
	})

	it('treats a slash after an operator as a regex, not division', () => {
		assert.deepEqual(tokenizeForFingerprint('const re = /ab+c/gi'), ['const', '$', '=', '/re/'])
		assert.deepEqual(tokenizeForFingerprint('const q = a / b'), ['const', '$', '=', '$', '/', '$'])
	})

	it('does not choke on a regex containing a quote or a slash class', () => {
		const tokens = tokenizeForFingerprint(`const r = /["'\\/]/g; const after = 1`)
		assert.ok(tokens.includes('/re/'))
		assert.deepEqual(tokens.slice(-4), ['const', '$', '=', '0'])
	})

	it('lexes template substitutions while ignoring the literal text', () => {
		const a = tokenizeForFingerprint('const s = `hello ${name} there`')
		const b = tokenizeForFingerprint('const s = `halo ${nama} di sini`')
		assert.deepEqual(a, b)
	})

	it('handles an empty or malformed file without throwing', () => {
		assert.deepEqual(tokenizeForFingerprint(''), [])
		assert.deepEqual(tokenizeForFingerprint(undefined), [])
		assert.ok(Array.isArray(tokenizeForFingerprint('function broken( { "unterminated')))
	})
})

describe('manifest matching', () => {
	const manifest = {
		modules: [
			{ path: 'lib/Utils/sender.js', ...fingerprintSource(ORIGINAL.repeat(4)) },
			{ path: 'lib/Utils/other.js', ...fingerprintSource('export const x = () => 1;'.repeat(200)) }
		]
	}

	it('finds the right module and labels an exact copy', () => {
		const hit = matchAgainstManifest(fingerprintSource(ORIGINAL.repeat(4)), manifest)
		assert.equal(hit.path, 'lib/Utils/sender.js')
		assert.equal(hit.identical, true)
		assert.equal(hit.verdict, 'structurally identical')
	})

	it('refuses to claim a file too small to be distinctive', () => {
		const tiny = fingerprintSource('export const a = 1')
		assert.ok(tiny.tokens < MIN_SIGNIFICANT_TOKENS)
		assert.equal(matchAgainstManifest(tiny, manifest), null)
	})

	it('returns null rather than a weak guess for unrelated code', () => {
		const unrelated = fingerprintSource('while (true) { console.log(Math.random() * 42) }'.repeat(60))
		const hit = matchAgainstManifest(unrelated, manifest)
		assert.ok(hit === null || hit.similarity < SIMILARITY_STRONG)
	})

	it('tolerates an empty or absent manifest', () => {
		assert.equal(matchAgainstManifest(fingerprintSource(ORIGINAL.repeat(4)), { modules: [] }), null)
		assert.equal(matchAgainstManifest(fingerprintSource(ORIGINAL.repeat(4)), {}), null)
	})
})

describe('verifyProvenance', () => {
	const goodNotice = `# NOTICE\n${PROVENANCE.author} wrote this. Licensed GPL-3.0-or-later.\nJAPofc\n`
	const goodLicense = 'GNU GENERAL PUBLIC LICENSE\nVersion 3, 29 June 2007\n'

	it('passes on a compliant redistribution', () => {
		const report = verifyProvenance({
			noticeText: goodNotice,
			licenseText: goodLicense,
			packageJson: { license: 'GPL-3.0-or-later' }
		})
		assert.equal(report.ok, true, JSON.stringify(report.checks))
	})

	it('flags a stripped NOTICE', () => {
		const report = verifyProvenance({ licenseText: goodLicense, packageJson: { license: 'GPL-3.0-or-later' } })
		assert.equal(report.ok, false)
		assert.equal(report.checks.find(c => c.name === 'notice-present').ok, false)
	})

	it('flags attribution scrubbed out of an otherwise present NOTICE', () => {
		const report = verifyProvenance({
			noticeText: '# NOTICE\nSomeone Else wrote this. GPL-3.0-or-later.\n',
			licenseText: goodLicense,
			packageJson: { license: 'GPL-3.0-or-later' }
		})
		const markers = report.checks.find(c => c.name === 'notice-markers')
		assert.equal(markers.ok, false)
		assert.match(markers.detail, /J\.AP/)
	})

	it('flags a relicensed package', () => {
		const report = verifyProvenance({
			noticeText: goodNotice,
			licenseText: goodLicense,
			packageJson: { license: 'MIT' }
		})
		assert.equal(report.checks.find(c => c.name === 'license-declared').ok, false)
	})

	it('accepts the licence named in prose rather than by SPDX id', () => {
		const report = verifyProvenance({
			noticeText: `# NOTICE\n${PROVENANCE.author} / JAPofc — GNU General Public License v3.0 or later\n`,
			licenseText: goodLicense,
			packageJson: { license: 'GPL-3.0-or-later' }
		})
		assert.equal(report.ok, true, JSON.stringify(report.checks))
	})

	it('is passive: reports on garbage input instead of throwing', () => {
		for (const input of [undefined, {}, { noticeText: 42, licenseText: null, packageJson: null }]) {
			const report = verifyProvenance(input)
			assert.equal(report.ok, false)
			assert.ok(report.checks.length > 0)
		}
	})

	it('our own package passes its own check', () => {
		const url = p => new URL(p, import.meta.url)
		const report = verifyProvenance({
			noticeText: readFileSync(url('../NOTICE.md'), 'utf8'),
			licenseText: readFileSync(url('../LICENSE'), 'utf8'),
			packageJson: JSON.parse(readFileSync(url('../package.json'), 'utf8'))
		})
		assert.equal(report.ok, true, JSON.stringify(report.checks, null, 2))
	})
})

describe('BUILD_TAG and minted ids', () => {
	it('the tag is stable and derived from the attribution constants', () => {
		assert.match(BUILD_TAG, /^[0-9A-F]{6}$/)
		assert.equal(BUILD_TAG, mintId('ABC').split('-')[1])
	})

	it('mints ids in the detectable shape', () => {
		for (const prefix of ['LVM', 'QRM', 'DGST']) {
			const id = mintId(prefix)
			assert.match(id, /^[A-Z]{3,4}-[0-9A-F]{6}-[0-9A-F]{8}$/)
			assert.ok(id.startsWith(prefix))
			assert.ok(findAttributionTraces(id).some(t => t.name === 'build-tag'), id)
		}
	})

	it('falls back rather than minting an undetectable prefix', () => {
		for (const bad of ['', 'x', '!!', undefined, null, 12]) {
			const id = mintId(bad)
			assert.ok(id.startsWith('JAP-'), `${bad} -> ${id}`)
			assert.ok(findAttributionTraces(id).some(t => t.name === 'build-tag'))
		}
	})

	it('ids do not collide', () => {
		const ids = new Set(Array.from({ length: 5000 }, () => mintId('TST')))
		assert.equal(ids.size, 5000)
	})
})

describe('findAttributionTraces', () => {
	it('catches the leftovers a brand rename misses', () => {
		// the real-world case: they replaced "JAP" and left "J.AP" behind
		const rebranded = 'const name = "ElseBaileys" // J.AP original\nimport x from "@japofc/baileys"'
		const names = findAttributionTraces(rebranded).map(t => t.name)
		assert.ok(names.includes('author-dotted'))
		assert.ok(names.includes('scoped-name'))
	})

	it('catches comment tags and exported symbol names', () => {
		const names = findAttributionTraces('// JAP@Fix something\nexport { JapBaileys }').map(t => t.name)
		assert.deepEqual(names.sort(), ['comment-tag', 'symbol-japbaileys'])
	})

	it('counts occurrences and keeps a few samples', () => {
		const [trace] = findAttributionTraces('J.AP J.AP J.AP')
		assert.equal(trace.count, 3)
		assert.deepEqual(trace.samples, ['J.AP'])
	})

	it('finds nothing in clean third-party code', () => {
		assert.deepEqual(findAttributionTraces('export const sum = (a, b) => a + b'), [])
		assert.deepEqual(findAttributionTraces(''), [])
		assert.deepEqual(findAttributionTraces(undefined), [])
	})

	it('does not carry regex state between calls', () => {
		const text = 'J.AP'
		for (let i = 0; i < 5; i++) {
			assert.equal(findAttributionTraces(text).length, 1, `call ${i}`)
		}
	})

	it('every declared trace pattern actually matches something of ours', () => {
		const corpus = [
			'J.AP', 'JAPofc', '@japofc/baileys', 'JAP@Fix', 'JapBaileys', 'japRich', mintId('QRM')
		].join('\n')
		const found = findAttributionTraces(corpus).map(t => t.name)
		assert.equal(found.length, ATTRIBUTION_TRACES.length, `missing: ${
			ATTRIBUTION_TRACES.map(t => t.name).filter(n => !found.includes(n)).join(', ')}`)
	})
})
