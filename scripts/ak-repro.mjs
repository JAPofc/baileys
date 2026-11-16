/**
 * Repro for BUGREPORT 2.75 -- an app-state patch that could not be applied still
 * advanced the version we persist, so its mutations were lost permanently and the
 * poisoned LTHash broke every later sync of that collection.
 *
 * Run: node scripts/ak-repro.mjs
 */
import { randomBytes } from 'crypto'
import { readFile, writeFile, unlink } from 'fs/promises'
import { encodeSyncdPatch, newLTHashState } from '../lib/Utils/index.js'

const SRC = new URL('../lib/Utils/chat-utils.js', import.meta.url)
const BEFORE = new URL('../lib/Utils/chat-utils.__before__.mjs', import.meta.url)

const fixed = await readFile(SRC, 'utf8')
const MARKER = 'JAP@Fix (§2.75)'
if (!fixed.includes(MARKER)) {
	throw new Error('repro is stale: the §2.75 fix is no longer in chat-utils.js')
}

// reconstruct the pre-fix decodePatches: commit first, verify later
const start = fixed.indexOf('export const decodePatches = async')
const end = fixed.indexOf('export const chatModificationToAppPatch')
const OLD = `export const decodePatches = async (name, syncds, initial, getAppStateSyncKey, options, minimumVersionNumber, logger, validateMacs = true) => {
    const newState = { ...initial, indexValueMap: { ...initial.indexValueMap } };
    const mutationMap = {};
    for (const syncd of syncds) {
        const { version, keyId, snapshotMac } = syncd;
        if (syncd.externalMutations) {
            const ref = await downloadExternalPatch(syncd.externalMutations, options);
            syncd.mutations?.push(...ref.mutations);
        }
        const patchVersion = toNumber(version.version);
        newState.version = patchVersion;
        const shouldMutate = typeof minimumVersionNumber === 'undefined' || patchVersion > minimumVersionNumber;
        let decodeResult;
        try {
            decodeResult = await decodeSyncdPatch(syncd, name, newState, getAppStateSyncKey, shouldMutate
                ? mutation => { mutationMap[mutation.syncAction.index?.toString()] = mutation; }
                : () => { }, validateMacs);
        }
        catch (err) {
            if (isMissingKeyError(err)) throw err;
            logger?.warn({ name, version: patchVersion }, 'failed to decode patch, skipping');
            continue;
        }
        newState.hash = decodeResult.hash;
        newState.indexValueMap = decodeResult.indexValueMap;
        if (validateMacs) {
            const keyEnc = await getAppStateSyncKey(Buffer.from(keyId.id).toString('base64'));
            const result = mutationKeys(keyEnc.keyData);
            const computedSnapshotMac = generateSnapshotMac(newState.hash, newState.version, name, result.snapshotMacKey);
            if (Buffer.compare(snapshotMac, computedSnapshotMac) !== 0) {
                logger?.warn({ name, version: newState.version }, 'LTHash verification failed, skipping remaining patches');
                break;
            }
        }
        syncd.mutations = [];
    }
    return { state: newState, mutationMap };
};
`
await writeFile(BEFORE, fixed.slice(0, start) + OLD + fixed.slice(end))

try {
	const before = await import(BEFORE.href)
	const after = await import(SRC.href)

	const KEY_ID = Buffer.from('testkey1').toString('base64')
	const keyData = randomBytes(32)
	const getKey = async id => (id === KEY_ID ? { keyData } : undefined)
	const NAME = 'regular_high'

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

	// one record arrives corrupted (truncated/garbled blob from the server or the
	// external-patch download) -- decodeSyncdMutations skips it, so the LTHash diverges
	const corrupt = () => {
		const feed = patches.map(p => structuredClone(p))
		feed[1].mutations[0].record.value.blob = Buffer.from(feed[1].mutations[0].record.value.blob)
		feed[1].mutations[0].record.value.blob[2] ^= 0xff
		return feed
	}

	const quiet = { warn() {}, trace() {}, debug() {}, info() {} }
	const run = async mod => {
		const res = await mod.decodePatches(NAME, corrupt(), newLTHashState(), getKey, {}, undefined, quiet, true)
		return res
	}

	const b = await run(before)
	const a = await run(after)

	console.log(`server has 3 patches (v1 mute, v2 pin, v3 star); the v2 record is corrupt\n`)
	console.log('                                   BEFORE      AFTER')
	console.log(`mutations handed to the app        ${Object.keys(b.mutationMap).length}/3         ${Object.keys(a.mutationMap).length}/3`)
	console.log(`version persisted to auth state    ${b.state.version}           ${a.state.version}`)
	console.log(`caller told the sync was partial   ${'incomplete' in b ? 'yes' : 'no'}          ${a.incomplete ? `yes (${a.incomplete.reason})` : 'no'}`)
	console.log(`\nBEFORE: v2 and v3 are dropped, but the state says "synced to v${b.state.version}", so the`)
	console.log('        server is never asked for them again, and the hash stored alongside it')
	console.log('        is the one computed with the skipped record -- it no longer matches the')
	console.log("        server's, so later patches keep failing their own LTHash check.")
	console.log(`AFTER:  state stays at v${a.state.version} (last good), the caller is told the sync is`)
	console.log('        incomplete, and the next resync re-fetches v2/v3 or forces a snapshot.')

	// --- can the collection ever recover? replay the retry the socket would do next
	const retry = async (mod, persisted) => {
		const warns = []
		const spy = { warn: (_o, m) => warns.push(m), trace() {}, debug() {}, info() {} }
		const remaining = patches.filter(p => p.version.version > persisted.version).map(p => structuredClone(p))
		const res = await mod.decodePatches(NAME, remaining, persisted, getKey, {}, undefined, spy, true)
		return { applied: Object.keys(res.mutationMap).length, version: res.state.version, remaining: remaining.length, warns }
	}

	const rb = await retry(before, b.state)
	const ra = await retry(after, a.state)
	console.log('\nnext resync, with the server now sending clean patches:')
	console.log(`  BEFORE  re-fetches ${rb.remaining} patch(es), ends at v${rb.version}; LTHash warnings: ${rb.warns.length || 'none'}`)
	console.log(`          -> the v2 pin is never seen again, and the state carries a hash that`)
	console.log(`             no longer matches the server's (${rb.warns[0] || 'silently diverged'})`)
	console.log(`  AFTER   re-fetches ${ra.remaining} patch(es), applies ${ra.applied}, ends at v${ra.version}; LTHash warnings: ${ra.warns.length || 'none'} -- fully recovered`)
} finally {
	await unlink(BEFORE)
}
