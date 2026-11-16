/**
 * Repro for BUGREPORT 2.69 -- withPairingGuard() consumed both rate limiters before
 * deciding, so REJECTED pairing requests still spent budget. One phone spamming the
 * guard drained the global hourly allowance and locked out every other number.
 *
 * BEFORE is the real module with the two consuming checks put back.
 *
 * Run: node scripts/af-repro.mjs
 */
import { readFile, writeFile, unlink } from 'fs/promises'

const SRC = new URL('../lib/Utils/auth-secure.js', import.meta.url)
const TMP = new URL('../lib/Utils/auth-secure.__before__.mjs', import.meta.url)

const FIXED = `        const phoneKey = String(phoneNumber);
        const perPhone = limiter.peek(phoneKey);
        const g = global.peek('global');`
const BUGGY = `        const phoneKey = String(phoneNumber);
        const perPhone = limiter.check(phoneKey);
        const g = global.check('global');`
const FIXED_COMMIT = `        limiter.check(phoneKey);
        global.check('global');
        return original(phoneNumber, ...args);`
const BUGGY_COMMIT = `        return original(phoneNumber, ...args);`

const scenario = async withPairingGuard => {
	let t = 0
	const reached = []
	const sock = { requestPairingCode: async phone => void reached.push(phone) }
	const { global: g } = withPairingGuard(sock, { maxPerHour: 2, globalMaxPerHour: 5, minIntervalMs: 0, now: () => t })

	// one number hammers the guard: 6 attempts, only 2 may legitimately go out
	for (let i = 0; i < 6; i++) {
		t += 1000
		await sock.requestPairingCode('628111').catch(() => {})
	}

	// four innocent numbers, each with a clean record
	const verdicts = []
	for (const phone of ['628222', '628333', '628444', '628555']) {
		t += 1000
		verdicts.push(await sock.requestPairingCode(phone).then(() => 'allowed').catch(() => 'blocked'))
	}

	return { reached: reached.length, globalStats: g.stats, verdicts }
}

const show = (label, r) => {
	console.log(`\n${label}`)
	console.log(`  pairing requests that really went out : ${r.reached}`)
	console.log(`  global slots counted as used          : ${r.globalStats.allowed} of 5`)
	console.log(`  innocent numbers afterwards           : ${r.verdicts.join(', ')}`)
}

const original = await readFile(SRC, 'utf8')
if (!original.includes(FIXED) || !original.includes(FIXED_COMMIT)) {
	throw new Error('fixed guard not found -- repro is out of date')
}

await writeFile(TMP, original.replace(FIXED, BUGGY).replace(FIXED_COMMIT, BUGGY_COMMIT))
let before
try {
	before = await scenario((await import(TMP.href)).withPairingGuard)
} finally {
	await unlink(TMP)
}
const after = await scenario((await import(SRC.href)).withPairingGuard)

console.log('one number makes 6 pairing attempts (limit 2/phone, 5 global), then 4 other numbers try')
show('BEFORE (both limiters consumed before deciding)', before)
show('AFTER  (peek, then spend only on a real request)', after)
console.log(`\ninnocent numbers wrongly locked out before the fix: ${before.verdicts.filter(v => v === 'blocked').length - after.verdicts.filter(v => v === 'blocked').length}\n`)
