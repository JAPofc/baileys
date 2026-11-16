// §2.95 repro -- a cached group metadata object that predates LID addressing makes every
// message to that group go out addressed as LID.
//
// relayMessage():
//   let groupData = useCachedGroupMetadata && cachedGroupMetadata ? await cachedGroupMetadata(jid) : undefined
//   ...
//   addressing_mode: groupData?.addressingMode || 'lid'
//
// `addressingMode` is a newer field. A cache written by an older build (or any app that
// stores its own trimmed metadata — the documented reason `cachedGroupMetadata` exists) has
// no such field, and `|| 'lid'` then *invents* LID addressing for a PN group. The TODO right
// above the cache read asks exactly this: "should we rely on the cache ... if the cache is
// outdated and the metadata has new fields?"
import { resolveGroupAddressingMode } from '../lib/Utils/group-addressing.js'

const FRESH_PN = { id: '120@g.us', addressingMode: 'pn', participants: [{ id: '628a@s.whatsapp.net' }] }
const FRESH_LID = { id: '120@g.us', addressingMode: 'lid', participants: [{ id: '111a@lid' }] }
const STALE_PN = { id: '120@g.us', participants: [{ id: '628a@s.whatsapp.net' }] }          // no addressingMode
const STALE_LID = { id: '120@g.us', participants: [{ id: '111a@lid' }] }
const EMPTY = { id: '120@g.us', participants: [] }

const before = meta => meta?.addressingMode || 'lid'

console.log('  metadata                         BEFORE   AFTER')
for (const [label, meta] of Object.entries({
	'fresh, addressingMode=pn': FRESH_PN,
	'fresh, addressingMode=lid': FRESH_LID,
	'stale cache, PN participants': STALE_PN,
	'stale cache, LID participants': STALE_LID,
	'stale cache, no participants': EMPTY
})) {
	const b = before(meta)
	const a = resolveGroupAddressingMode(meta)
	const wrong = label.includes('PN') && b === 'lid' ? '  ← *** PN group addressed as LID ***' : ''
	console.log(`  ${label.padEnd(32)} ${b.padEnd(8)} ${a.mode}${wrong}`)
}
