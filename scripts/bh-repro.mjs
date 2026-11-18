// §2.102 repro -- the VoIP worker bootstrap leaked one parentPort listener per
// addEventListener() call and per WorkerSyncedMessagePort instance, and never offered a way
// to unsubscribe. Replays the OLD code shape against a real EventEmitter to show the leak.
import { EventEmitter } from 'node:events'
import { createPortDispatcher } from '../lib/VoIP/worker-listeners.js'

const before = new EventEmitter()
const oldAddEventListener = handler => before.on('message', data => handler({ data }))
for (let i = 0; i < 12; i++) oldAddEventListener(() => {})
// each WorkerSyncedMessagePort the loader builds added one more
for (let i = 0; i < 4; i++) before.on('message', () => {})

console.log('BEFORE')
console.log('  parentPort "message" listeners :', before.listenerCount('message'),
	before.listenerCount('message') > EventEmitter.defaultMaxListeners ? '← *** Node prints MaxListenersExceededWarning ***' : '')
console.log('  removeEventListener            : not implemented — nothing can ever be detached')

const after = new EventEmitter()
const dispatcher = createPortDispatcher(after)
const handlers = Array.from({ length: 12 }, () => () => {})
const offs = handlers.map(h => dispatcher.add(h))
for (let i = 0; i < 4; i++) dispatcher.add(() => {})

console.log('\nAFTER')
console.log('  parentPort "message" listeners :', after.listenerCount('message'), '(one shared fan-out)')
console.log('  dispatcher handlers            :', dispatcher.size)
offs.forEach(off => off())
console.log('  after unsubscribing 12         :', dispatcher.size, 'handlers /', after.listenerCount('message'), 'port listener')
dispatcher.dispose()
console.log('  after dispose()                :', dispatcher.size, 'handlers /', after.listenerCount('message'), 'port listeners')
