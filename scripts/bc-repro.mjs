// §2.97 repro -- an unreadable tc-token timestamp permanently stops token issuance.
//
// The two halves of the tc-token clock disagree about what to do with a timestamp they
// cannot parse:
//
//   isTcTokenExpired(x)     → true   ("can't read it, treat it as expired")   ✔ safe
//   shouldSendNewTcToken(x) → false  ("can't read it, so don't send one")     ✘ unsafe
//
// `shouldSendNewTcToken` does bare arithmetic: `Math.floor(senderTimestamp / BUCKET)`.
// A Long-shaped value — exactly what a protobuf/JSON auth store hands back — is NaN there,
// and `currentBucket > NaN` is false, so that contact never gets a fresh privacy token again.
import { isTcTokenExpired, shouldSendNewTcToken } from '../lib/Utils/tc-token-utils.js'

const now = Math.floor(Date.now() / 1000)
const cases = {
	'undefined (no entry yet)': undefined,
	'null': null,
	'NaN': Number.NaN,
	'Long from the store': { low: 1700000000, high: 0, unsigned: false },
	'bigint': 1700000000n,
	'Date': new Date(1700000000 * 1000),
	'numeric string': '1700000000',
	'garbage string': 'yesterday',
	'fresh number (today)': now
}

console.log('  value                      isTcTokenExpired   shouldSendNewTcToken')
for (const [label, value] of Object.entries(cases)) {
	let expired, send
	try { expired = isTcTokenExpired(value) } catch (e) { expired = `THROWS ${e.constructor.name}` }
	try { send = shouldSendNewTcToken(value) } catch (e) { send = `THROWS ${e.constructor.name}` }
	const stale = expired === true && send === false
	console.log(`  ${label.padEnd(26)} ${String(expired).padEnd(18)} ${String(send)}${stale ? '   ← *** expired, yet never refreshed ***' : ''}`)
}
