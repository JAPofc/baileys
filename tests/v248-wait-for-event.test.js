import test from 'node:test'
import assert from 'node:assert/strict'
import EventEmitter from 'events'
import { waitForEvent } from '../lib/Utils/wait-for-event.js'

test('resolves with the payload of the next event', async () => {
	const ev = new EventEmitter()
	const p = waitForEvent(ev, 'groups.update', { timeoutMs: 1000 })
	ev.emit('groups.update', [{ id: 'g@g.us', subject: 'hi' }])
	assert.deepEqual(await p, [{ id: 'g@g.us', subject: 'hi' }])
	assert.equal(ev.listenerCount('groups.update'), 0, 'listener detached')
})

test('filter skips non-matching payloads', async () => {
	const ev = new EventEmitter()
	const p = waitForEvent(ev, 'groups.update', {
		timeoutMs: 1000,
		filter: ups => ups.some(u => u.id === 'wanted@g.us')
	})
	ev.emit('groups.update', [{ id: 'other@g.us' }])
	ev.emit('groups.update', [{ id: 'wanted@g.us', subject: 'yes' }])
	assert.equal((await p)[0].subject, 'yes')
})

test('pick extracts a single item and undefined keeps waiting', async () => {
	const ev = new EventEmitter()
	const p = waitForEvent(ev, 'groups.update', {
		timeoutMs: 1000,
		pick: ups => ups.find(u => u.id === 'wanted@g.us')
	})
	ev.emit('groups.update', [{ id: 'other@g.us' }])
	ev.emit('groups.update', [{ id: 'wanted@g.us', announce: 'true' }])
	assert.deepEqual(await p, { id: 'wanted@g.us', announce: 'true' })
	assert.equal(ev.listenerCount('groups.update'), 0)
})

test('rejects on timeout and detaches', async () => {
	const ev = new EventEmitter()
	await assert.rejects(waitForEvent(ev, 'groups.update', { timeoutMs: 20 }), /timed out after 20ms/)
	assert.equal(ev.listenerCount('groups.update'), 0)
})

test('a thrown filter rejects instead of leaking the listener', async () => {
	const ev = new EventEmitter()
	const p = waitForEvent(ev, 'groups.update', { timeoutMs: 1000, filter: () => { throw new Error('boom') } })
	ev.emit('groups.update', [{ id: 'g@g.us' }])
	await assert.rejects(p, /boom/)
	assert.equal(ev.listenerCount('groups.update'), 0)
})

test('an already-aborted signal rejects immediately without attaching', async () => {
	const ev = new EventEmitter()
	const ac = new AbortController()
	ac.abort(new Error('nope'))
	await assert.rejects(waitForEvent(ev, 'groups.update', { signal: ac.signal }), /nope/)
	assert.equal(ev.listenerCount('groups.update'), 0)
})

test('aborting mid-wait rejects and cleans up both listeners', async () => {
	const ev = new EventEmitter()
	const ac = new AbortController()
	const p = waitForEvent(ev, 'groups.update', { timeoutMs: 5000, signal: ac.signal })
	ac.abort()
	await assert.rejects(p, /aborted/)
	assert.equal(ev.listenerCount('groups.update'), 0)
})

test('timeoutMs 0 disables the timeout', async () => {
	const ev = new EventEmitter()
	const p = waitForEvent(ev, 'messages.upsert', { timeoutMs: 0 })
	setTimeout(() => ev.emit('messages.upsert', { messages: [], type: 'notify' }), 30)
	assert.equal((await p).type, 'notify')
})

test('rejects bad arguments', () => {
	assert.throws(() => waitForEvent(null, 'x'), /event emitter/)
	assert.throws(() => waitForEvent(new EventEmitter(), ''), /non-empty string/)
})
