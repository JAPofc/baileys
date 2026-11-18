import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'fs'
import { makeEventBuffer } from '../lib/Utils/event-buffer.js'

const noop = () => {}
const makeLogger = () => {
	const l = { debug: noop, warn: noop, trace: noop, info: noop, error: noop }
	l.child = () => l
	return l
}

const GID = '120363000000000000@g.us'
const OTHER = '120363111111111111@g.us'

const collect = () => {
	const ev = makeEventBuffer(makeLogger())
	const emitted = []
	ev.on('groups.update', updates => emitted.push(...updates))
	return { ev, emitted }
}

test('§2.66 later groups.update fields are merged, not dropped', () => {
	const { ev, emitted } = collect()
	ev.buffer()
	ev.emit('groups.update', [{ id: GID, subject: 'Project Team', size: 42 }])
	ev.emit('groups.update', [{ id: GID, announce: 'true' }])
	ev.emit('groups.update', [{ id: GID, desc: 'read the pinned message', descId: 'abc' }])
	ev.flush()

	assert.equal(emitted.length, 1, 'one consolidated update for the group')
	assert.deepEqual(emitted[0], {
		id: GID,
		subject: 'Project Team',
		size: 42,
		announce: 'true',
		desc: 'read the pinned message',
		descId: 'abc'
	})
})

test('§2.66 a later value for the same field wins', () => {
	const { ev, emitted } = collect()
	ev.buffer()
	ev.emit('groups.update', [{ id: GID, subject: 'old' }])
	ev.emit('groups.update', [{ id: GID, subject: 'new' }])
	ev.flush()
	assert.equal(emitted.length, 1)
	assert.equal(emitted[0].subject, 'new')
})

test('§2.66 updates for different groups stay separate', () => {
	const { ev, emitted } = collect()
	ev.buffer()
	ev.emit('groups.update', [{ id: GID, subject: 'A' }])
	ev.emit('groups.update', [{ id: OTHER, subject: 'B' }])
	ev.emit('groups.update', [{ id: GID, announce: 'true' }])
	ev.flush()
	assert.equal(emitted.length, 2)
	const byId = Object.fromEntries(emitted.map(u => [u.id, u]))
	assert.deepEqual(byId[GID], { id: GID, subject: 'A', announce: 'true' })
	assert.deepEqual(byId[OTHER], { id: OTHER, subject: 'B' })
})

test('§2.66 several groups in one emit are all merged', () => {
	const { ev, emitted } = collect()
	ev.buffer()
	ev.emit('groups.update', [{ id: GID, subject: 'A' }, { id: OTHER, subject: 'B' }])
	ev.emit('groups.update', [{ id: GID, restrict: 'true' }, { id: OTHER, restrict: 'false' }])
	ev.flush()
	const byId = Object.fromEntries(emitted.map(u => [u.id, u]))
	assert.equal(byId[GID].restrict, 'true')
	assert.equal(byId[OTHER].restrict, 'false')
	assert.equal(byId[GID].subject, 'A')
})

test('§2.66 the buffer is emptied after a flush', () => {
	const { ev, emitted } = collect()
	ev.buffer()
	ev.emit('groups.update', [{ id: GID, subject: 'A' }])
	ev.flush()
	ev.buffer()
	ev.emit('groups.update', [{ id: GID, announce: 'true' }])
	ev.flush()
	assert.equal(emitted.length, 2)
	assert.deepEqual(emitted[1], { id: GID, announce: 'true' }, 'no state leaks across windows')
})

test('§2.66 unbuffered groups.update still passes straight through', () => {
	const { ev, emitted } = collect()
	ev.emit('groups.update', [{ id: GID, subject: 'A' }])
	ev.emit('groups.update', [{ id: GID, announce: 'true' }])
	assert.deepEqual(emitted, [{ id: GID, subject: 'A' }, { id: GID, announce: 'true' }])
})

test('§2.66 the drop guard is gone from the source', () => {
	const src = readFileSync(new URL('../lib/Utils/event-buffer.js', import.meta.url), 'utf8')
	assert.match(src, /data\.groupUpdates\[id\] = Object\.assign\(groupUpdate, update\);/)
	assert.doesNotMatch(src, /if \(!data\.groupUpdates\[id\]\) \{/)
})
