#!/usr/bin/env node
/**
 * Build a fingerprint manifest of this project's own modules.
 *
 *   node scripts/provenance-manifest.mjs [--out provenance-manifest.json]
 *
 * The manifest is what `provenance-scan.mjs` matches a third-party package against. It
 * contains no source code — only token counts and hashes — so it is safe to publish,
 * attach to a dispute, or hand to someone who should not get a copy of the sources.
 *
 * Regenerate it after a release; a stale manifest produces false negatives, never false
 * positives.
 */
import { createRequire } from 'module'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { dirname, join, relative, resolve } from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { fingerprintSource, PROVENANCE, GRAM_SIZE, SKETCH_SIZE, MIN_SIGNIFICANT_TOKENS } =
	await import(join(ROOT, 'lib/Utils/provenance.js'))

const argv = process.argv.slice(2)
const outFlag = argv.indexOf('--out')
const outPath = resolve(ROOT, outFlag === -1 ? 'provenance-manifest.json' : argv[outFlag + 1])

const SKIP_DIRS = new Set(['node_modules', '.git', 'Media', 'docs', 'coverage'])

function* walk(dir) {
	for (const entry of readdirSync(dir)) {
		if (SKIP_DIRS.has(entry)) {
			continue
		}
		const full = join(dir, entry)
		if (statSync(full).isDirectory()) {
			yield* walk(full)
		} else if (entry.endsWith('.js') && !entry.endsWith('.d.ts')) {
			yield full
		}
	}
}

const modules = []
let skipped = 0

for (const file of walk(join(ROOT, 'lib'))) {
	const source = readFileSync(file, 'utf8')
	const fp = fingerprintSource(source)
	if (!fp.significant) {
		skipped++
		continue
	}
	modules.push({
		path: relative(ROOT, file),
		tokens: fp.tokens,
		structural: fp.structural,
		sketch: fp.sketch
	})
}

modules.sort((a, b) => a.path.localeCompare(b.path))

const manifest = {
	project: PROVENANCE.project,
	version: require(join(ROOT, 'package.json')).version,
	license: PROVENANCE.license,
	author: PROVENANCE.author,
	repository: PROVENANCE.repository,
	generatedAt: new Date().toISOString(),
	algorithm: {
		tokenizer: 'identifiers anonymised, literals normalised, comments and whitespace dropped',
		gramSize: GRAM_SIZE,
		sketchSize: SKETCH_SIZE,
		minSignificantTokens: MIN_SIGNIFICANT_TOKENS
	},
	modules
}

writeFileSync(outPath, JSON.stringify(manifest, null, '\t') + '\n')

const bytes = statSync(outPath).size
console.log(`wrote ${relative(ROOT, outPath)}`)
console.log(`  ${modules.length} modules fingerprinted, ${skipped} too small to claim`)
console.log(`  ${(bytes / 1024 / 1024).toFixed(2)} MB`)
