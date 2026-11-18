// §2.111 — our username rules were invented, not WhatsApp's.
// WhatsApp: 3–35 chars, lowercase letters/digits/./_ , at least one letter, no edge or
// doubled dots, no "www." prefix, no domain suffix; the username key is 4 digits.
// Run: node scripts/bo-repro.mjs
import { validateUsername, isUsernamePin, USERNAME_MAX_LENGTH, USERNAME_PIN_LENGTH } from '../lib/index.js'

const claimable = ['9to5.dev', 'name_', '_leading', 'a'.repeat(35)]
const refused = ['ja-p', 'www.shop', 'myshop.com', '1234567']

console.log(`USERNAME_MAX_LENGTH = ${USERNAME_MAX_LENGTH} (WhatsApp: 35, we used to say 30)`)
console.log(`USERNAME_PIN_LENGTH = ${USERNAME_PIN_LENGTH} (WhatsApp's username key is 4 digits, we used to say 6)\n`)

console.log('usernames WhatsApp hands out:')
for (const value of claimable) {
	const res = validateUsername(value)
	console.log(`  ${value.padEnd(14)} → ${res.valid ? 'accepted' : `REJECTED (${res.errorType})`}`)
}
console.log('\nusernames WhatsApp refuses:')
for (const value of refused) {
	const res = validateUsername(value)
	console.log(`  ${value.padEnd(14)} → ${res.valid ? 'ACCEPTED (wrong)' : `rejected (${res.errorType})`}`)
}
console.log('\n4-digit username key recognised:', isUsernamePin('1234'), '| 6 digits:', isUsernamePin('123456'))
console.log('\nbefore the fix: 9to5.dev/name_/_leading/35-chars were all rejected,')
console.log('and ja-p / www.shop / myshop.com were all accepted.')
