/**
 * Repro for BUGREPORT 2.70 -- the SSRF guard's IPv6 handling.
 *
 *   (a) every IPv6-literal URL was refused, because URL.hostname keeps the brackets
 *       and `isIP('[2606:…]')` is 0, so the DNS branch ran and could never resolve;
 *   (b) isPrivateHost() missed IPv4-mapped IPv6, so once (a) is fixed naively the
 *       cloud metadata endpoint becomes reachable as http://[::ffff:169.254.169.254]/.
 *
 * BEFORE is the real module with the old prefix matcher and bracketed DNS check.
 *
 * Run: node scripts/ag-repro.mjs
 */
import { readFile, writeFile, unlink } from 'fs/promises'

const SRC = new URL('../lib/Utils/messages-media.js', import.meta.url)
const TMP = new URL('../lib/Utils/messages-media.__before__.mjs', import.meta.url)

const BEFORE_PRIVATE6 = `const isPrivateIPv6 = (ip) => {
    const h = ip.toLowerCase();
    return h === '::1' || h === '::' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80:') || h.startsWith('::ffff:127.') || h.startsWith('::ffff:10.') || h.startsWith('::ffff:192.168.');
};`

const HOSTS = [
	['::ffff:169.254.169.254', 'cloud metadata, IPv4-mapped'],
	['::ffff:7f00:1', '127.0.0.1 written in hex'],
	['0:0:0:0:0:ffff:a9fe:a9fe', 'metadata, fully expanded'],
	['::ffff:172.16.0.1', 'RFC1918, mapped'],
	['::ffff:100.64.0.1', 'CGNAT, mapped'],
	['::127.0.0.1', 'deprecated IPv4-compatible'],
	['::ffff:8.8.8.8', 'a PUBLIC address, mapped — must stay allowed'],
	['2606:4700:4700::1111', 'a public IPv6 resolver — must stay allowed']
]

const URLS = [
	'http://[::ffff:169.254.169.254]/latest/meta-data/',
	'http://[2606:4700:4700::1111]/',
	'http://[::1]/'
]

const run = async mod => {
	const classified = HOSTS.map(([host, note]) => [host, note, mod.isPrivateHost(host)])
	const urls = []
	for (const u of URLS) {
		try {
			await mod.assertSafeHttpUrl(u)
			urls.push([u, 'ALLOWED'])
		} catch (err) {
			urls.push([u, `blocked: ${err.message.replace(/ *\(.*\)$/, '')}`])
		}
	}

	return { classified, urls }
}

const show = (label, r) => {
	console.log(`\n${label}`)
	console.log('  isPrivateHost():')
	for (const [host, note, verdict] of r.classified) {
		console.log(`    ${verdict ? 'private' : 'PUBLIC '}  ${host.padEnd(26)} ${note}`)
	}

	console.log('  assertSafeHttpUrl():')
	for (const [u, verdict] of r.urls) {
		console.log(`    ${u.padEnd(44)} ${verdict}`)
	}
}

const original = await readFile(SRC, 'utf8')
const fixedSource = original
if (!fixedSource.includes('const mappedIPv4 = (ip) => {') || !fixedSource.includes('const bareHost = unbracketHost(parsed.hostname);')) {
	throw new Error('fixed guard not found -- repro is out of date')
}

// rebuild the pre-fix module: old prefix matcher + bracketed hostname in the DNS branch
let before = fixedSource.slice(0, fixedSource.indexOf('/**\n * JAP@Fix (§2.70'))
	+ BEFORE_PRIVATE6 + '\n\n'
	+ fixedSource.slice(fixedSource.indexOf('/** Strip the brackets a URL keeps'))
before = before
	.replace('const bareHost = unbracketHost(parsed.hostname);\n    if (checkDns && !isIP(bareHost)) {', 'const bareHost = unbracketHost(parsed.hostname);\n    if (checkDns && !isIP(parsed.hostname)) {')
	.replace('records = await lookup(bareHost, { all: true, verbatim: true });', 'records = await lookup(parsed.hostname, { all: true, verbatim: true });')

await writeFile(TMP, before)
let beforeResult
try {
	beforeResult = await run(await import(TMP.href))
} finally {
	await unlink(TMP)
}

show('BEFORE', beforeResult)
show('AFTER', await run(await import(SRC.href)))
