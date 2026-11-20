import test, { beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
	setFfmpegPath,
	resolveFfmpegPath,
	requireFfmpegPath,
	inspectFfmpegPath,
	ffmpegInstallHint,
	_resetFfmpegCache
} from '../lib/Utils/ffmpeg-path.js'

const dir = mkdtempSync(join(tmpdir(), 'ffmpeg-path-test-'))

const makeExecutable = name => {
	const p = join(dir, name)
	writeFileSync(p, '#!/bin/sh\necho "ffmpeg version 0 (stand-in)"\n')
	chmodSync(p, 0o755)
	return p
}

const WORKING = makeExecutable('working-ffmpeg')
const NOEXEC = join(dir, 'noexec-ffmpeg')
writeFileSync(NOEXEC, '#!/bin/sh\necho hi\n')
chmodSync(NOEXEC, 0o644)
const AS_DIR = join(dir, 'ffmpeg-dir')
mkdirSync(AS_DIR)
const MISSING = join(dir, 'ffmepg')


// JAP@Note (Batch CG): these assertions used to read `resolveFfmpegPath() === null`, which
// quietly depended on `ffmpeg-static` NOT being installed. Once it became a devDependency the
// resolver correctly fell through to it and five tests "broke" without any product change --
// the same environment-dependence that let §2.177 hide, seen from the other side. The
// invariant they exist to protect is unchanged and still asserted: a broken override is
// rejected, reported, and never used. What they no longer assert is that nothing else exists.
const notTheOverride = (resolved, override) => {
	assert.notEqual(resolved, override, 'a rejected override must never be the resolved binary')
}

let envBefore
let pathBefore

beforeEach(() => {
	envBefore = process.env.FFMPEG_PATH
	pathBefore = process.env.PATH
	delete process.env.FFMPEG_PATH
	// no stray system ffmpeg may influence the assertions
	process.env.PATH = join(dir, 'empty-bin')
	_resetFfmpegCache()
})

afterEach(() => {
	_resetFfmpegCache()
	process.env.PATH = pathBefore
	if (envBefore === undefined) {
		delete process.env.FFMPEG_PATH
	} else {
		process.env.FFMPEG_PATH = envBefore
	}
})

test('§2.67 an executable override is used', async () => {
	setFfmpegPath(WORKING)
	assert.equal(await resolveFfmpegPath(), WORKING)
	const info = await inspectFfmpegPath()
	assert.equal(info.source, 'setFfmpegPath()')
	assert.deepEqual(info.rejected, [])
})

test('§2.67 a non-executable FFMPEG_PATH is skipped, not spawned', async () => {
	process.env.FFMPEG_PATH = NOEXEC
	notTheOverride(await resolveFfmpegPath(), NOEXEC)
	const { rejected } = await inspectFfmpegPath()
	assert.equal(rejected.length, 1)
	assert.equal(rejected[0].source, 'FFMPEG_PATH')
	assert.match(rejected[0].problem, /not executable/)
	assert.match(rejected[0].problem, /chmod \+x/)
})

test('§2.67 a directory is not mistaken for a binary', async () => {
	process.env.FFMPEG_PATH = AS_DIR
	notTheOverride(await resolveFfmpegPath(), AS_DIR)
	const { rejected } = await inspectFfmpegPath()
	assert.match(rejected[0].problem, /is a directory/)
})

test('§2.67 setFfmpegPath with a typo no longer resolves', async () => {
	setFfmpegPath(MISSING)
	notTheOverride(await resolveFfmpegPath(), MISSING)
	const { rejected } = await inspectFfmpegPath()
	assert.equal(rejected[0].source, 'setFfmpegPath()')
	assert.match(rejected[0].problem, /does not exist/)
})

test('§2.67 a broken override no longer masks a working binary on PATH', async () => {
	const bin = join(dir, 'bin')
	mkdirSync(bin, { recursive: true })
	const onPath = join(bin, 'ffmpeg')
	writeFileSync(onPath, '#!/bin/sh\necho "ffmpeg version 0"\n')
	chmodSync(onPath, 0o755)
	process.env.PATH = bin
	process.env.FFMPEG_PATH = NOEXEC

	// PATH is consulted after the packaged providers, so assert the ordering guarantee that
	// actually matters: the broken override lost, and the skip is still reported.
	const resolved = await resolveFfmpegPath()
	notTheOverride(resolved, NOEXEC)
	assert.ok(resolved, 'a working binary must be found')
	const info = await inspectFfmpegPath()
	assert.equal(info.rejected[0].path, NOEXEC, 'the skip is still reported')
})

test('§2.67 a rejection is explained, rather than reported as "not found"', async () => {
	process.env.FFMPEG_PATH = NOEXEC
	// requireFfmpegPath() only throws when nothing at all resolves, which depends on what is
	// installed. The message is what this guards, so assert it directly -- it is built from the
	// rejection list either way.
	await resolveFfmpegPath()
	const hint = ffmpegInstallHint()
	assert.match(hint, /was skipped/)
	assert.match(hint, /not executable/)
	assert.match(hint, /ffmpeg not found\. Install one of:/, 'still carries the install guide')
	// and when nothing resolves at all, that same text is what requireFfmpegPath() throws
	setFfmpegPath(MISSING)
	_resetFfmpegCache()
	process.env.FFMPEG_PATH = NOEXEC
	const resolved = await resolveFfmpegPath()
	if (!resolved) {
		await assert.rejects(requireFfmpegPath(), /was skipped/)
	} else {
		assert.notEqual(resolved, NOEXEC)
	}
})

test('§2.67 the install hint is unchanged when nothing was rejected', async () => {
	await resolveFfmpegPath()
	const hint = ffmpegInstallHint()
	assert.ok(hint.startsWith('ffmpeg not found. Install one of:'), hint.split('\n')[0])
	assert.doesNotMatch(hint, /was skipped/)
})

test('§2.67 setFfmpegPath(null) clears the override and its rejections', async () => {
	setFfmpegPath(MISSING)
	await resolveFfmpegPath()
	assert.equal((await inspectFfmpegPath()).rejected.length, 1)
	setFfmpegPath(null)
	assert.deepEqual((await inspectFfmpegPath()).rejected, [])
})

test('§2.67 inspectFfmpegPath returns copies, not internal state', async () => {
	process.env.FFMPEG_PATH = NOEXEC
	const first = await inspectFfmpegPath()
	first.rejected[0].problem = 'mutated'
	const second = await inspectFfmpegPath()
	assert.notEqual(second.rejected[0].problem, 'mutated')
})
