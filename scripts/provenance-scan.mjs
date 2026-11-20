#!/usr/bin/env node
/**
 * Compare a third-party package against our fingerprint manifest.
 *
 *   node scripts/provenance-scan.mjs <path-to-package> [--manifest provenance-manifest.json]
 *                                    [--json] [--all]
 *
 * Reports how much of our code is in there, identifier renaming and reformatting ignored,
 * and whether our attribution survived. It makes no accusation on its own: "structurally
 * identical" is evidence, and the licence terms are the argument. Read the matches before
 * you say anything to anyone.
 */
import { readdirSync, readFileSync, statSync } from 'fs'
import { dirname, join, relative, resolve } from 'path'
import { fileURLToPath } from 'url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const {
	fingerprintSource, matchAgainstManifest, verifyProvenance, findAttributionTraces,
	SIMILARITY_STRONG, MIN_SIGNIFICANT_TOKENS
} = await import(join(ROOT, 'lib/Utils/provenance.js'))

const argv = process.argv.slice(2)
const target = argv.find(a => !a.startsWith('--'))
if (!target) {
	console.error('usage: node scripts/provenance-scan.mjs <path-to-package> [--manifest f] [--json] [--all]')
	process.exit(2)
}

const manifestFlag = argv.indexOf('--manifest')
const manifestPath = resolve(ROOT, manifestFlag === -1 ? 'provenance-manifest.json' : argv[manifestFlag + 1])
const asJson = argv.includes('--json')
const showAll = argv.includes('--all')

let manifest
try {
	manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
} catch {
	console.error(`cannot read manifest at ${manifestPath} — run scripts/provenance-manifest.mjs first`)
	process.exit(2)
}

const pkgRoot = resolve(process.cwd(), target)
const SKIP_DIRS = new Set(['node_modules', '.git'])

function* walk(dir) {
	for (const entry of readdirSync(dir)) {
		if (SKIP_DIRS.has(entry)) {
			continue
		}
		const full = join(dir, entry)
		let st
		try {
			st = statSync(full)
		} catch {
			continue
		}
		if (st.isDirectory()) {
			yield* walk(full)
		} else if (/\.(js|mjs|cjs|ts)$/.test(entry) && !entry.endsWith('.d.ts')) {
			yield full
		}
	}
}

const matches = []
const traceTotals = new Map()
let scanned = 0
let tooSmall = 0

for (const file of walk(pkgRoot)) {
	let source
	try {
		source = readFileSync(file, 'utf8')
	} catch {
		continue
	}
	scanned++

	// leftovers a rebrand missed: worth more than the brand string, because nobody plants them
	for (const trace of findAttributionTraces(source)) {
		const prev = traceTotals.get(trace.name) || { count: 0, files: 0, note: trace.note, samples: new Set() }
		prev.count += trace.count
		prev.files++
		for (const sample of trace.samples) {
			prev.samples.add(sample)
		}
		traceTotals.set(trace.name, prev)
	}

	const fp = fingerprintSource(source)
	if (!fp.significant) {
		tooSmall++
		continue
	}
	const hit = matchAgainstManifest(fp, manifest)
	if (hit) {
		matches.push({
			file: relative(pkgRoot, file),
			ours: hit.path,
			similarity: Number(hit.similarity.toFixed(3)),
			identical: hit.identical,
			verdict: hit.verdict,
			tokens: fp.tokens
		})
	}
}

matches.sort((a, b) => b.similarity - a.similarity)

const read = p => {
	try {
		return readFileSync(join(pkgRoot, p), 'utf8')
	} catch {
		return undefined
	}
}
let packageJson
try {
	packageJson = JSON.parse(read('package.json') || '{}')
} catch {
	packageJson = {}
}

const attribution = verifyProvenance({
	noticeText: read('NOTICE.md') ?? read('NOTICE'),
	licenseText: read('LICENSE') ?? read('LICENSE.md') ?? read('COPYING'),
	packageJson
})

const identical = matches.filter(m => m.identical).length
const strong = matches.filter(m => !m.identical && m.similarity >= SIMILARITY_STRONG).length

const report = {
	target: pkgRoot,
	name: packageJson.name,
	version: packageJson.version,
	manifest: { project: manifest.project, version: manifest.version, modules: manifest.modules.length },
	scanned,
	tooSmall,
	identical,
	copiedWithEdits: strong,
	weak: matches.length - identical - strong,
	attribution,
	traces: [...traceTotals].map(([name, t]) => ({
		name, count: t.count, files: t.files, note: t.note, samples: [...t.samples].slice(0, 3)
	})),
	matches: showAll || asJson ? matches : matches.slice(0, 40)
}

if (asJson) {
	console.log(JSON.stringify(report, null, '\t'))
	process.exit(0)
}

console.log(`scanned ${pkgRoot}`)
console.log(`  package: ${packageJson.name ?? '(unknown)'}@${packageJson.version ?? '?'}`)
console.log(`  against: ${manifest.project}@${manifest.version} (${manifest.modules.length} modules)`)
console.log(`  ${scanned} source files, ${tooSmall} too small to claim (< ${MIN_SIGNIFICANT_TOKENS} tokens)`)
console.log('')
console.log(`  structurally identical : ${identical}`)
console.log(`  copied with edits      : ${strong}`)
console.log(`  possible shared code   : ${report.weak}`)
console.log('')
console.log('attribution:')
for (const c of attribution.checks) {
	console.log(`  [${c.ok ? 'ok' : '!!'}] ${c.detail}`)
}

if (report.traces.length) {
	console.log('')
	console.log('attribution traces left in the source:')
	for (const t of report.traces) {
		console.log(`  ${String(t.count).padStart(5)}x in ${t.files} file(s)  ${t.name} — ${t.note}`)
		console.log(`        e.g. ${t.samples.join(' , ')}`)
	}
}

if (matches.length) {
	console.log('')
	console.log('matches:')
	for (const m of report.matches) {
		console.log(`  ${String(m.similarity).padEnd(5)} ${m.verdict.padEnd(24)} ${m.file}  <-  ${m.ours}`)
	}
	if (matches.length > report.matches.length) {
		console.log(`  ... and ${matches.length - report.matches.length} more (--all)`)
	}
}

if (identical && !attribution.ok) {
	console.log('')
	console.log('note: identical modules with attribution missing. That is a licence question,')
	console.log('      not a verdict — check the matches yourself before making a claim.')
}
