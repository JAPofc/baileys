import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const walk = (dir, out = []) => {
	for (const entry of readdirSync(dir)) {
		const p = join(dir, entry)
		if (statSync(p).isDirectory()) walk(p, out)
		else if (p.endsWith('.d.ts')) out.push(p)
	}

	return out
}

const SPECIFIER = /(?:^|\n)\s*(?:export|import)[^\n;]*?from\s+['"](\.[^'"]*)['"]/g

test('§2.72 every relative specifier in a shipped .d.ts carries its extension', () => {
	const offenders = []
	for (const file of walk('lib')) {
		const src = readFileSync(file, 'utf8')
		for (const [, spec] of src.matchAll(SPECIFIER)) {
			if (!spec.endsWith('.js') && !spec.endsWith('.json')) {
				offenders.push(`${file}: '${spec}'`)
			}
		}
	}

	assert.deepEqual(
		offenders,
		[],
		`extensionless relative specifiers do not resolve under moduleResolution node16/nodenext,\n` +
		`so everything these modules export becomes invisible to TypeScript consumers:\n  ${offenders.slice(0, 10).join('\n  ')}`
	)
})

test('§2.72 the Utils barrel really does re-export the classifier', () => {
	const barrel = readFileSync('lib/Utils/index.d.ts', 'utf8')
	// the file mixes quote styles, so accept either
	assert.match(barrel, /export \* from ['"]\.\/disconnect-classifier\.js['"];/)
	assert.match(barrel, /export \* from ['"]\.\/auto-reconnect\.js['"];/)
})
