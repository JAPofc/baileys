import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'crypto'
import { readFileSync } from 'fs'
import { encodeSyncdPatch, decodePatches, newLTHashState } from '../lib/Utils/index.js'

const KEY_ID = Buffer.from('testkey1').toString('base64')
const NAME = 'regular_high'
const quiet = { warn() {}, trace() {}, debug() {}, info() {} }

const build = async () => {
	const keyData = randomBytes(32)
	const getKey = async id => (id === KEY_ID ? { keyData } : undefined)
	const mods = [
		{ syncAction: { muteAction: { muted: true, muteEndTimestamp: 111 } }, index: ['mute', 'a@s.whatsapp.net'] },
		{ syncAction: { pinAction: { pinned: true } }, index: ['pin_v1', 'b@s.whatsapp.net'] },
		{ syncAction: { starAction: { starred: true } }, index: ['star', 'c@s.whatsapp.net'] }
	]

	let state = newLTHashState()
	const patches = []
	for (const m of mods) {
		const r = await encodeSyncdPatch({ ...m, type: NAME, apiVersion: 3, operation: 0 }, KEY_ID, state, getKey)
		state = r.state
		patches.push({ ...r.patch, version: { version: r.state.version } })
	}

	return { getKey, patches, serverVersion: state.version }
}

const feed = (patches, corruptIndex, how = 'body') => patches.map((p, i) => {
	const copy = structuredClone(p)
	if (i === corruptIndex) {
		const blob = Buffer.from(copy.mutations[0].record.value.blob)
		// 'body' garbles the ciphertext (record skipped -> LTHash diverges)
		// 'mac'  garbles the trailing value mac (patch mac check throws)
		blob[how === 'body' ? 2 : blob.length - 1] ^= 0xff
		copy.mutations[0].record.value.blob = blob
	}

	return copy
})

test('§2.75 clean patches apply fully and report a complete sync', async () => {
	const { getKey, patches, serverVersion } = await build()
	const res = await decodePatches(NAME, feed(patches, -1), newLTHashState(), getKey, {}, undefined, quiet, true)
	assert.equal(Object.keys(res.mutationMap).length, 3)
	assert.equal(res.state.version, serverVersion)
	assert.equal(res.incomplete, null)
	assert.equal(res.synced, true)
})

test('§2.75 a corrupt patch does not advance the persisted version', async () => {
	const { getKey, patches } = await build()
	const res = await decodePatches(NAME, feed(patches, 1), newLTHashState(), getKey, {}, undefined, quiet, true)
	assert.equal(res.state.version, 1, 'version must stay at the last good patch')
	assert.equal(res.synced, false)
	assert.equal(res.incomplete.version, 2)
	assert.equal(res.incomplete.reason, 'lthash-mismatch')
})

test('§2.75 a patch that fails its mac hands the app nothing from that patch', async () => {
	const { getKey, patches } = await build()
	const res = await decodePatches(NAME, feed(patches, 1), newLTHashState(), getKey, {}, undefined, quiet, true)
	const indices = Object.keys(res.mutationMap)
	assert.equal(indices.length, 1)
	assert.match(indices[0], /mute/)
	assert.ok(!indices.some(i => i.includes('pin_v1')), 'a rolled-back patch must not deliver mutations')
})

test('§2.75 the state is left untouched by a failed patch, not half-applied', async () => {
	const { getKey, patches } = await build()
	const good = await decodePatches(NAME, [structuredClone(patches[0])], newLTHashState(), getKey, {}, undefined, quiet, true)
	const after = await decodePatches(NAME, feed(patches, 1).slice(1), good.state, getKey, {}, undefined, quiet, true)
	assert.equal(after.state.version, good.state.version)
	assert.deepEqual(after.state.hash, good.state.hash)
	assert.deepEqual(after.state.indexValueMap, good.state.indexValueMap)
})

test('§2.75 the collection recovers on the next resync', async () => {
	const { getKey, patches, serverVersion } = await build()
	const first = await decodePatches(NAME, feed(patches, 1), newLTHashState(), getKey, {}, undefined, quiet, true)
	// the socket re-requests everything above the persisted version; server now sends clean copies
	const remaining = patches.filter(p => p.version.version > first.state.version).map(p => structuredClone(p))
	assert.equal(remaining.length, 2)
	const second = await decodePatches(NAME, remaining, first.state, getKey, {}, undefined, quiet, true)
	assert.equal(second.state.version, serverVersion)
	assert.equal(second.synced, true)
	assert.equal(Object.keys(second.mutationMap).length, 2)
})

test('§2.75 a patch whose mac is garbled stops with reason decode-failed', async () => {
	const { getKey, patches } = await build()
	const res = await decodePatches(NAME, feed(patches, 1, 'mac'), newLTHashState(), getKey, {}, undefined, quiet, true)
	assert.equal(res.state.version, 1)
	assert.equal(res.incomplete.reason, 'decode-failed')
	assert.match(res.incomplete.error, /mac/i)
})

test('§2.75 a missing app-state key still throws so the collection can be parked', async () => {
	const { patches } = await build()
	await assert.rejects(
		() => decodePatches(NAME, feed(patches, -1), newLTHashState(), async () => undefined, {}, undefined, quiet, true),
		err => err?.data?.isMissingKey === true
	)
})

test('§2.75 minimumVersionNumber still suppresses replayed mutations but commits the version', async () => {
	const { getKey, patches, serverVersion } = await build()
	const res = await decodePatches(NAME, feed(patches, -1), newLTHashState(), getKey, {}, serverVersion, quiet, true)
	assert.equal(Object.keys(res.mutationMap).length, 0)
	assert.equal(res.state.version, serverVersion)
	assert.equal(res.synced, true)
})

test('§2.75 mac verification can still be turned off entirely', async () => {
	const { getKey, patches, serverVersion } = await build()
	const res = await decodePatches(NAME, feed(patches, -1), newLTHashState(), getKey, {}, undefined, quiet, false)
	assert.equal(res.synced, true)
	assert.equal(res.state.version, serverVersion)
	assert.equal(Object.keys(res.mutationMap).length, 3)
})

test('§2.75 with macs off, an unparseable record still stops instead of skipping ahead', async () => {
	// no mac to catch it, so the failure surfaces as a decode error further in --
	// either way the version must not run past the last patch that actually applied
	const { getKey, patches } = await build()
	const res = await decodePatches(NAME, feed(patches, 1), newLTHashState(), getKey, {}, undefined, quiet, false)
	assert.equal(res.state.version, 1)
	assert.equal(res.synced, false)
	assert.equal(res.incomplete.version, 2)
})

test('§2.75 the socket routes an incomplete sync into the snapshot-retry recovery', () => {
	const src = readFileSync('lib/Socket/chats.js', 'utf8')
	assert.match(src, /mutationMap, incomplete \} = await decodePatches/)
	assert.match(src, /if \(incompletePatch\) \{[\s\S]*?forceSnapshotCollections\.add\(name\)/)
	assert.match(src, /attemptsMap\[name\] >= MAX_SYNC_ATTEMPTS[\s\S]*?collectionsToHandle\.delete\(name\)/)
	// a collection with an unapplied patch must never fall into the "done" branch
	assert.match(src, /else if \(hasMorePatches\)/)
})
