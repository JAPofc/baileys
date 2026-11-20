/**
 * Provenance: rename-resistant fingerprints for this project's own source, plus the
 * tooling to recognise that source inside somebody else's package.
 *
 * The problem this solves: a fork can rename every identifier, swap the brand strings,
 * reformat, strip the comments and delete `NOTICE.md`, and a plain `grep` for our name
 * then finds nothing. What a fork cannot cheaply change is the *shape* of the code — the
 * sequence of keywords, operators, literals and structure. So we fingerprint that shape.
 *
 * Nothing here runs by itself. There is no automatic logging, no network access and no
 * side effect of importing this module: `verifyProvenance()` returns a report and it is
 * up to the caller to care. A legitimate user who never calls it never notices it exists.
 *
 * @see scripts/provenance-manifest.mjs — build a manifest of our own modules
 * @see scripts/provenance-scan.mjs — compare a third-party package against that manifest
 */
import { createHash, randomBytes } from 'crypto'

/** Attribution facts for this package. Changing these is the point of the exercise. */
export const PROVENANCE = Object.freeze({
	project: '@japofc/baileys',
	author: 'J.AP (JAPofc)',
	license: 'GPL-3.0-or-later',
	repository: 'https://github.com/JAPofc/baileys',
	/** Author strings that must survive verbatim in a compliant redistribution. */
	markers: Object.freeze(['J.AP', 'JAPofc'])
})

/**
 * Short, stable tag derived from this project's attribution.
 *
 * Load-bearing, which is the whole point: it is minted into the ids that every feature in
 * this package hands out, so those ids travel into a fork's own logs and message history.
 * Change the constants above and the tag changes with them. A brand string in a comment is
 * removed by one find-and-replace; a value computed from the attribution is not something a
 * rebrand thinks to search for.
 */
export const BUILD_TAG = createHash('sha256')
	.update(`${PROVENANCE.project}|${PROVENANCE.author}|${PROVENANCE.repository}`)
	.digest('hex')
	.slice(0, 6)
	.toUpperCase()

/**
 * Mint a tagged id: `PREFIX-<BUILD_TAG>-<random>`.
 *
 * Every id-generating feature in this package should come through here rather than rolling
 * its own, so the tag spreads by default instead of by remembering.
 *
 * @param {string} prefix — three or four uppercase letters naming the feature
 * @param {number} [entropyBytes] — random bytes behind the suffix
 */
export function mintId(prefix, entropyBytes = 4) {
	const cleaned = String(prefix || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)
	// a prefix shorter than three characters would not match the trace pattern, so it is
	// not a prefix we are willing to mint
	const label = cleaned.length >= 3 ? cleaned : 'JAP'
	const suffix = randomBytes(Math.max(2, entropyBytes)).toString('hex').toUpperCase()
	return `${label}-${BUILD_TAG}-${suffix}`
}

/** Files this small are shape-identical to thousands of unrelated files; never claim them. */
export const MIN_SIGNIFICANT_TOKENS = 120

/** Number of hashes kept per module. Bounded sketch, so a manifest stays a sane size. */
export const SKETCH_SIZE = 128

/** Token-gram width. Long enough to be distinctive, short enough to survive small edits. */
export const GRAM_SIZE = 9

const KEYWORDS = new Set([
	'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
	'delete', 'do', 'else', 'export', 'extends', 'finally', 'for', 'function', 'if', 'import',
	'in', 'instanceof', 'let', 'new', 'return', 'super', 'switch', 'this', 'throw', 'try',
	'typeof', 'var', 'void', 'while', 'with', 'yield', 'static', 'get', 'set', 'async', 'of',
	'true', 'false', 'null', 'undefined'
])

const ID_START = /[A-Za-z_$]/
const ID_PART = /[A-Za-z0-9_$]/
const DIGIT = /[0-9]/

/**
 * Lex JavaScript into the token stream we fingerprint.
 *
 * Deliberately lossy, and every bit of the loss is a renaming the fork gets no credit for:
 * comments vanish, whitespace vanishes, identifiers all become `$`, string contents become
 * `"s"`, numbers become `0`. Keywords, punctuation and structure survive. Two files that
 * differ only by `s/client/sock/g` and a reformat produce byte-identical token streams.
 *
 * This is a lexer, not a parser: it does not validate the input, and malformed source
 * simply produces a slightly odd token stream rather than throwing.
 *
 * @param {string} source
 * @returns {string[]}
 */
export function tokenizeForFingerprint(source) {
	const src = String(source ?? '')
	const tokens = []
	let i = 0
	// tracks whether a `/` here can start a regex literal or must be division
	let regexAllowed = true

	while (i < src.length) {
		const c = src[i]

		// whitespace
		if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '\f' || c === '\v') {
			i++
			continue
		}

		// line comment
		if (c === '/' && src[i + 1] === '/') {
			while (i < src.length && src[i] !== '\n') {
				i++
			}
			continue
		}

		// block comment
		if (c === '/' && src[i + 1] === '*') {
			i += 2
			while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
				i++
			}
			i += 2
			continue
		}

		// string literal
		if (c === '"' || c === "'") {
			i++
			while (i < src.length && src[i] !== c) {
				i += src[i] === '\\' ? 2 : 1
			}
			i++
			tokens.push('"s"')
			regexAllowed = false
			continue
		}

		// template literal — substitutions are tokenized, the text between them is not
		if (c === '`') {
			i++
			tokens.push('`')
			let depth = 0
			while (i < src.length) {
				if (src[i] === '\\') {
					i += 2
					continue
				}
				if (src[i] === '`' && depth === 0) {
					i++
					break
				}
				if (src[i] === '$' && src[i + 1] === '{') {
					depth++
					i += 2
					tokens.push('${')
					continue
				}
				if (depth > 0) {
					// hand the substitution body back to the main loop by lexing it inline
					const end = matchTemplateExpression(src, i)
					tokens.push(...tokenizeForFingerprint(src.slice(i, end)))
					i = end + 1
					depth--
					tokens.push('}')
					continue
				}
				i++
			}
			tokens.push('`')
			regexAllowed = false
			continue
		}

		// regex literal
		if (c === '/' && regexAllowed) {
			let j = i + 1
			let inClass = false
			let closed = false
			while (j < src.length) {
				const d = src[j]
				if (d === '\\') {
					j += 2
					continue
				}
				if (d === '[') {
					inClass = true
				} else if (d === ']') {
					inClass = false
				} else if (d === '/' && !inClass) {
					closed = true
					break
				} else if (d === '\n') {
					break
				}
				j++
			}
			if (closed) {
				j++
				while (j < src.length && ID_PART.test(src[j])) {
					j++
				}
				i = j
				tokens.push('/re/')
				regexAllowed = false
				continue
			}
		}

		// number
		if (DIGIT.test(c) || (c === '.' && DIGIT.test(src[i + 1] || ''))) {
			i++
			while (i < src.length && /[0-9a-fA-FxXoObBn._]/.test(src[i])) {
				i++
			}
			tokens.push('0')
			regexAllowed = false
			continue
		}

		// identifier or keyword
		if (ID_START.test(c)) {
			let j = i
			while (j < src.length && ID_PART.test(src[j])) {
				j++
			}
			const word = src.slice(i, j)
			i = j
			if (KEYWORDS.has(word)) {
				tokens.push(word)
				regexAllowed = word !== 'this' && word !== 'super'
			} else {
				// every non-keyword name collapses to the same token: renaming buys nothing
				tokens.push('$')
				regexAllowed = false
			}
			continue
		}

		// punctuation / operators, longest match first
		const three = src.slice(i, i + 3)
		const two = src.slice(i, i + 2)
		let punct = c
		if (['===', '!==', '**=', '...', '&&=', '||=', '??=', '>>>'].includes(three)) {
			punct = three
		} else if (
			['==', '!=', '<=', '>=', '&&', '||', '??', '?.', '=>', '++', '--', '+=', '-=', '*=',
				'/=', '%=', '**', '<<', '>>', '&=', '|=', '^='].includes(two)
		) {
			punct = two
		}
		i += punct.length
		tokens.push(punct)
		regexAllowed = punct !== ')' && punct !== ']'
	}

	return tokens
}

/** Find the `}` closing a `${` substitution, respecting nested braces and strings. */
function matchTemplateExpression(src, start) {
	let depth = 0
	let i = start
	while (i < src.length) {
		const c = src[i]
		if (c === '\\') {
			i += 2
			continue
		}
		if (c === '"' || c === "'" || c === '`') {
			i++
			while (i < src.length && src[i] !== c) {
				i += src[i] === '\\' ? 2 : 1
			}
			i++
			continue
		}
		if (c === '{') {
			depth++
		} else if (c === '}') {
			if (depth === 0) {
				return i
			}
			depth--
		}
		i++
	}
	return src.length
}

const hash32 = str => {
	const digest = createHash('sha256').update(str).digest()
	return digest.readUInt32BE(0)
}

/**
 * Fingerprint one module.
 *
 * Returns both an exact structural hash (matches a straight copy, however renamed and
 * reformatted) and a bounded sketch of token-gram hashes (still matches after the copy
 * has been edited). `tokens` is reported so a caller can discount trivially small files.
 *
 * @param {string} source
 * @returns {{tokens: number, structural: string, sketch: number[], significant: boolean}}
 */
export function fingerprintSource(source) {
	const tokens = tokenizeForFingerprint(source)
	const structural = createHash('sha256').update(tokens.join(' ')).digest('hex')

	const grams = new Set()
	for (let i = 0; i + GRAM_SIZE <= tokens.length; i++) {
		grams.add(hash32(tokens.slice(i, i + GRAM_SIZE).join(' ')))
	}
	// minhash sketch: the N smallest gram hashes. Bounded, and still comparable by Jaccard
	const sketch = [...grams].sort((a, b) => a - b).slice(0, SKETCH_SIZE)

	return {
		tokens: tokens.length,
		structural,
		sketch,
		significant: tokens.length >= MIN_SIGNIFICANT_TOKENS
	}
}

/**
 * Estimated Jaccard similarity of two sketches, in 0..1.
 *
 * Comparing two equal-size minhash sketches directly understates overlap when the files
 * differ in size, so we intersect over the smaller sketch's range — the standard fix.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
export function sketchSimilarity(a, b) {
	if (!a?.length || !b?.length) {
		return 0
	}
	const limit = Math.min(a.length, b.length)
	const left = new Set(a.slice(0, limit))
	const right = b.slice(0, limit)
	let shared = 0
	const union = new Set(left)
	for (const h of right) {
		if (left.has(h)) {
			shared++
		}
		union.add(h)
	}
	return union.size ? shared / union.size : 0
}

/** Similarity at or above this is a copy with edits, not a coincidence. */
export const SIMILARITY_STRONG = 0.6
/** Worth a human look. Below this, shared idiom is the likelier explanation. */
export const SIMILARITY_WEAK = 0.35

/**
 * Compare one foreign module against a whole manifest of ours and return the best match.
 *
 * @param {{tokens: number, structural: string, sketch: number[]}} candidate
 * @param {{modules: Array<{path: string, tokens: number, structural: string, sketch: number[]}>}} manifest
 * @returns {{path: string, similarity: number, identical: boolean, verdict: string}|null}
 */
export function matchAgainstManifest(candidate, manifest) {
	if (!candidate || candidate.tokens < MIN_SIGNIFICANT_TOKENS) {
		return null
	}

	let best = null
	for (const mod of manifest?.modules || []) {
		if (mod.tokens < MIN_SIGNIFICANT_TOKENS) {
			continue
		}
		const identical = mod.structural === candidate.structural
		const similarity = identical ? 1 : sketchSimilarity(mod.sketch, candidate.sketch)
		if (!best || similarity > best.similarity) {
			best = { path: mod.path, similarity, identical }
		}
	}

	if (!best || best.similarity < SIMILARITY_WEAK) {
		return null
	}

	return {
		...best,
		verdict: best.identical
			? 'structurally identical'
			: best.similarity >= SIMILARITY_STRONG
				? 'copied with edits'
				: 'possible shared ancestry'
	}
}

/**
 * Attribution traces — the things a careless renamer leaves behind.
 *
 * Someone rebranding a fork runs a find-and-replace on the obvious name and ships. What
 * survives is everything that did not match their search: a different spelling, a comment
 * tag, an internal symbol, a value derived from the name rather than written out. Those
 * leftovers are worth more than the brand string itself, because nobody plants them on
 * purpose and nobody notices them on the way out.
 *
 * Each entry is a pattern plus why it is hard to launder.
 */
export const ATTRIBUTION_TRACES = Object.freeze([
	{ name: 'author-dotted', pattern: /\bJ\.AP\b/g, note: 'survives a replace of "JAP"' },
	{ name: 'author-handle', pattern: /JAPofc/gi, note: 'survives a replace of "J.AP"' },
	{ name: 'scoped-name', pattern: /@japofc\//gi, note: 'the npm scope in imports and metadata' },
	{ name: 'comment-tag', pattern: /\bJAP@(?:Add|Fix|Note|Keep)\b/g, note: 'per-change comment tags across lib/' },
	{ name: 'symbol-japbaileys', pattern: /\bJapBaileys\b/g, note: 'an exported symbol: renaming it breaks callers' },
	{ name: 'symbol-japrich', pattern: /\bjapRich\b|\bcreateJapRich\b|\bsendJapRich\b/g, note: 'public aliases' },
	{ name: 'build-tag', pattern: /\b[A-Z]{3,4}-[0-9A-F]{6}-[0-9A-F]{4,}\b/g, note: 'ids derived from the attribution constants, written into logs and message history' }
])

/**
 * Find attribution traces in a blob of text.
 *
 * @param {string} text
 * @returns {Array<{name: string, count: number, note: string, samples: string[]}>}
 */
export function findAttributionTraces(text) {
	const haystack = String(text ?? '')
	const found = []

	for (const trace of ATTRIBUTION_TRACES) {
		// a fresh regex per call: a shared /g regex carries lastIndex between calls
		const matches = haystack.match(new RegExp(trace.pattern.source, trace.pattern.flags))
		if (matches?.length) {
			found.push({
				name: trace.name,
				count: matches.length,
				note: trace.note,
				samples: [...new Set(matches)].slice(0, 3)
			})
		}
	}

	return found
}

/**
 * Check that the attribution this package requires is still attached.
 *
 * Passive by design: this reports, it does not enforce. It never throws on a failed check,
 * never logs on its own, never touches the network, and the library does not call it. Its
 * audience is the maintainer running an audit and the honest redistributor running CI —
 * not a user to be nagged.
 *
 * @param {{noticeText?: string, licenseText?: string, packageJson?: object}} [files]
 * @returns {{ok: boolean, checks: Array<{name: string, ok: boolean, detail: string}>}}
 */
export function verifyProvenance(files = {}) {
	const { noticeText, licenseText, packageJson } = files
	const checks = []

	const notice = typeof noticeText === 'string' ? noticeText : ''
	checks.push({
		name: 'notice-present',
		ok: notice.length > 0,
		detail: notice.length ? `NOTICE present (${notice.length} bytes)` : 'NOTICE missing'
	})

	const missingMarkers = PROVENANCE.markers.filter(m => !notice.includes(m))
	checks.push({
		name: 'notice-markers',
		ok: notice.length > 0 && missingMarkers.length === 0,
		detail: missingMarkers.length
			? `attribution removed from NOTICE: ${missingMarkers.join(', ')}`
			: 'all attribution markers present in NOTICE'
	})

	// the licence may be named by SPDX id or in prose; both are compliant
	const licenseNamed = /GPL-3\.0-or-later|GNU General Public License v?3(\.0)?( or later)?/i.test(notice)
	checks.push({
		name: 'notice-license',
		ok: licenseNamed,
		detail: licenseNamed ? 'NOTICE names the GPL-3 licence' : 'NOTICE does not name the licence'
	})

	const license = typeof licenseText === 'string' ? licenseText : ''
	const isGpl = /GNU GENERAL PUBLIC LICENSE/i.test(license)
	checks.push({
		name: 'license-present',
		ok: isGpl,
		detail: isGpl ? 'GPL license text present' : 'no GPL license text found'
	})

	const declared = packageJson?.license
	checks.push({
		name: 'license-declared',
		ok: declared === PROVENANCE.license,
		detail: declared
			? `package.json declares "${declared}" (expected "${PROVENANCE.license}")`
			: 'package.json declares no license'
	})

	return { ok: checks.every(c => c.ok), checks }
}
