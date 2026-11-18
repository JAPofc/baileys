// §2.100 repro -- the device cache is keyed by the WRONG user for LID-addressed chats, so
// a LID chat re-runs a USync IQ on *every* send, and anything that does hit the cache comes
// back PN-addressed even though the caller asked for LID.
import { makeGetUSyncDevices, usyncReply } from '../tests/helpers/usync-devices.mjs'

const PN = '628111', LID = '99881'
const { getUSyncDevices, calls, cache } = makeGetUSyncDevices({ executeUSyncQuery: async () => usyncReply(PN, LID, 2) })

const first = await getUSyncDevices([`${LID}@lid`], true, false)
console.log('send #1 (LID chat)')
console.log('  usync queries :', calls.usync)
console.log('  jids          :', first.map(d => d.jid).join(', '))
console.log('  cache keys    :', [...cache.keys()].join(', '), ' ← keyed by the PN user')

const second = await getUSyncDevices([`${LID}@lid`], true, false)
console.log('\nsend #2, same LID chat, cache enabled')
console.log('  usync queries :', calls.usync, calls.usync > 1 ? '← *** cache never hits: an extra IQ per message ***' : '')
console.log('  jids          :', second.map(d => d.jid).join(', '))

const asPn = await getUSyncDevices([`${PN}@s.whatsapp.net`], true, false)
console.log('\nsame contact addressed by PN (hits the entry the LID send stored)')
console.log('  usync queries :', calls.usync)
console.log('  jids          :', asPn.map(d => d.jid).join(', '))
