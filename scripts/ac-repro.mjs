/**
 * Repro for BUGREPORT 2.66 -- `groups.update` events merged into an open event
 * buffer were dropped: only the FIRST update per group survived the flush.
 *
 * BEFORE is the real module with the single `if (!data.groupUpdates[id])` guard
 * put back, so both columns exercise the actual code path.
 *
 * Run: node scripts/ac-repro.mjs
 */
import { readFile, writeFile, unlink } from 'fs/promises'
import { pathToFileURL } from 'url'

const SRC = new URL('../lib/Utils/event-buffer.js', import.meta.url)
const TMP = new URL('../lib/Utils/event-buffer.__before__.mjs', import.meta.url)

const FIXED = `const groupUpdate = data.groupUpdates[id] || {};
                data.groupUpdates[id] = Object.assign(groupUpdate, update);`
const BUGGY = `const groupUpdate = data.groupUpdates[id] || {};
                if (!data.groupUpdates[id]) {
                    data.groupUpdates[id] = Object.assign(groupUpdate, update);
                }`

const noop = () => {}
const logger = { debug: noop, warn: noop, trace: noop, info: noop, error: noop }
logger.child = () => logger

/** One realistic offline-sync burst for a single group. */
const run = async makeEventBuffer => {
	const ev = makeEventBuffer(logger)
	let emitted = []
	ev.on('groups.update', updates => emitted.push(...updates))
	ev.buffer()
	// full metadata from groupFetchAllParticipating() on 'dirty'
	ev.emit('groups.update', [{ id: '120363000000000000@g.us', subject: 'Project Team', size: 42, owner: '1@s.whatsapp.net' }])
	// then the queued w:gp2 notifications for the same group
	ev.emit('groups.update', [{ id: '120363000000000000@g.us', announce: 'true' }])
	ev.emit('groups.update', [{ id: '120363000000000000@g.us', restrict: 'true' }])
	ev.emit('groups.update', [{ id: '120363000000000000@g.us', desc: 'read the pinned message', descId: 'abc' }])
	ev.emit('groups.update', [{ id: '120363000000000000@g.us', subject: 'Project Team (archived)' }])
	ev.flush()
	return emitted
}

const report = (label, updates) => {
	const merged = Object.assign({}, ...updates)
	const fields = Object.keys(merged).filter(k => k !== 'id')
	console.log(`\n${label}`)
	console.log(`  events emitted : ${updates.length}`)
	console.log(`  fields reaching the consumer : ${fields.length} -> ${fields.join(', ')}`)
	console.log(`  subject=${JSON.stringify(merged.subject)} announce=${JSON.stringify(merged.announce)} ` +
		`restrict=${JSON.stringify(merged.restrict)} desc=${JSON.stringify(merged.desc)}`)
	return fields.length
}

const original = await readFile(SRC, 'utf8')
if (!original.includes(FIXED)) {
	throw new Error('fixed groups.update branch not found -- repro is out of date')
}

await writeFile(TMP, original.replace(FIXED, BUGGY))
let before
try {
	before = await run((await import(pathToFileURL(TMP.pathname).href)).makeEventBuffer)
} finally {
	await unlink(TMP)
}
const after = await run((await import(SRC.href)).makeEventBuffer)

console.log('5 groups.update events for ONE group inside a single buffer window')
const b = report('BEFORE (guard on first-write only)', before)
const a = report('AFTER  (merge every update)', after)
console.log(`\nfields lost before the fix: ${a - b}\n`)
process.exit(b < a ? 0 : 1)
