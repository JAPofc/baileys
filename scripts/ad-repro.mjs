/**
 * Repro for BUGREPORT 2.67 -- an ffmpeg path that exists but cannot be executed was
 * accepted by the resolver, so the failure surfaced as a bare EACCES from spawn(),
 * and an explicit override masked an otherwise working binary.
 *
 * BEFORE is the real module with the two `existsSync` acceptance checks put back.
 *
 * Run: node scripts/ad-repro.mjs
 */
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync, readFileSync, writeFileSync as write, unlinkSync } from 'fs'
import { spawnSync } from 'child_process'
import { tmpdir } from 'os'
import { join } from 'path'

const SRC = new URL('../lib/Utils/ffmpeg-path.js', import.meta.url)
const TMP = new URL('../lib/Utils/ffmpeg-path.__before__.mjs', import.meta.url)

const FIXED_OVERRIDE = `    if (overridePath && acceptBinary('setFfmpegPath()', overridePath)) {
        return overridePath;
    }
    if (process.env.FFMPEG_PATH && acceptBinary('FFMPEG_PATH', process.env.FFMPEG_PATH)) {
        return process.env.FFMPEG_PATH;
    }`
const BUGGY_OVERRIDE = `    if (overridePath) {
        return overridePath;
    }
    if (process.env.FFMPEG_PATH && existsSync(process.env.FFMPEG_PATH)) {
        return process.env.FFMPEG_PATH;
    }`

// a real, working stand-in binary + the two broken candidates
const dir = mkdtempSync(join(tmpdir(), 'ffmpeg-resolve-'))
const working = join(dir, 'working-ffmpeg')
writeFileSync(working, '#!/bin/sh\necho "ffmpeg version 0 (stand-in)"\n')
chmodSync(working, 0o755)
const noexec = join(dir, 'noexec-ffmpeg')
writeFileSync(noexec, '#!/bin/sh\necho hi\n')
chmodSync(noexec, 0o644)
const asDir = join(dir, 'ffmpeg-dir')
mkdirSync(asDir)
const typo = join(dir, 'ffmepg') // classic typo

const scenarios = [
	['FFMPEG_PATH -> file without +x', { env: noexec }],
	['FFMPEG_PATH -> a directory', { env: asDir }],
	['setFfmpegPath() -> typo, nothing there', { override: typo }]
]

const probe = async (mod, { env, override }) => {
	mod._resetFfmpegCache()
	delete process.env.FFMPEG_PATH
	if (env) {
		process.env.FFMPEG_PATH = env
	}

	if (override) {
		mod.setFfmpegPath(override)
	}

	const resolved = await mod.resolveFfmpegPath()
	let required
	try {
		required = `returned ${JSON.stringify(await mod.requireFfmpegPath())}`
	} catch (err) {
		required = `threw: ${err.message.split('\n')[0]}`
	}

	let spawned = 'n/a (resolver returned null)'
	if (resolved) {
		const r = spawnSync(resolved, ['-version'], { encoding: 'utf8' })
		spawned = r.error ? `${r.error.code}` : `ok (status ${r.status})`
	}

	mod._resetFfmpegCache()
	delete process.env.FFMPEG_PATH
	return { resolved, required, spawned }
}

const original = readFileSync(SRC, 'utf8')
if (!original.includes(FIXED_OVERRIDE)) {
	throw new Error('fixed override branch not found -- repro is out of date')
}

write(TMP, original.replace(FIXED_OVERRIDE, BUGGY_OVERRIDE))
let beforeMod
try {
	beforeMod = await import(TMP.href)
} finally {
	// keep the file until after the dynamic import has read it
}

const afterMod = await import(SRC.href)

for (const [label, scenario] of scenarios) {
	const b = await probe(beforeMod, scenario)
	const a = await probe(afterMod, scenario)
	console.log(`\n${label}`)
	console.log(`  BEFORE  resolveFfmpegPath -> ${JSON.stringify(b.resolved)}`)
	console.log(`          requireFfmpegPath ${b.required}`)
	console.log(`          spawn(resolved)   -> ${b.spawned}`)
	console.log(`  AFTER   resolveFfmpegPath -> ${JSON.stringify(a.resolved)}`)
	console.log(`          requireFfmpegPath ${a.required}`)
}

// the masking case: a broken override while a working system binary IS available.
// (this sandbox has no ffmpeg, so put a working stand-in named `ffmpeg` on PATH)
const pathDir = join(dir, 'bin')
mkdirSync(pathDir)
const onPath = join(pathDir, 'ffmpeg')
writeFileSync(onPath, '#!/bin/sh\necho "ffmpeg version 0 (stand-in)"\n')
chmodSync(onPath, 0o755)
process.env.PATH = `${pathDir}:${process.env.PATH}`

process.env.FFMPEG_PATH = noexec
beforeMod._resetFfmpegCache()
afterMod._resetFfmpegCache()
console.log('\nbroken FFMPEG_PATH while a usable `ffmpeg` IS on PATH')
console.log(`  BEFORE  -> ${JSON.stringify(await beforeMod.resolveFfmpegPath())}  (the broken override wins, call fails)`)
console.log(`  AFTER   -> ${JSON.stringify(await afterMod.resolveFfmpegPath())}  (skipped, the working binary is used)`)
console.log(`  AFTER   inspectFfmpegPath() -> ${JSON.stringify(await afterMod.inspectFfmpegPath())}`)
delete process.env.FFMPEG_PATH
unlinkSync(TMP)
