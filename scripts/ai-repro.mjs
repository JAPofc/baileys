/**
 * Repro for BUGREPORT 2.72 -- 96 relative specifiers in the shipped .d.ts files had no
 * `.js` extension, which does not resolve under moduleResolution node16/nodenext (the
 * correct setting for this ESM package). Everything those 95 modules export was invisible
 * to TypeScript consumers, even though the runtime exported it fine.
 *
 * Run: node scripts/ai-repro.mjs
 */
import { readFile, writeFile, unlink, mkdtemp } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { tmpdir } from 'os'
import { join } from 'path'

const run = promisify(execFile)
const INDEX = new URL('../lib/Utils/index.d.ts', import.meta.url)
const BACKUP = new URL('../lib/Utils/index.d.ts.__bak__', import.meta.url)

const CONSUMER = `
import { classifyDisconnect, explainDisconnect } from '../../lib/index.js'
import { createRateLimiter } from '../../lib/index.js'
void classifyDisconnect(440).category
void explainDisconnect(440)
void createRateLimiter({ max: 1 })
`

const dir = await mkdtemp(join(tmpdir(), 'dts-check-'))
const probeDir = join(process.cwd(), 'tests', '.dts-probe')
await run('mkdir', ['-p', probeDir])
const probe = join(probeDir, 'probe.ts')
await writeFile(probe, CONSUMER)
await writeFile(join(probeDir, 'tsconfig.json'), JSON.stringify({
	compilerOptions: {
		strict: true, noEmit: true, target: 'ES2022',
		module: 'NodeNext', moduleResolution: 'NodeNext', skipLibCheck: true
	},
	files: ['probe.ts']
}))

const typecheck = async () => {
	try {
		await run('npx', ['tsc', '-p', probeDir], { cwd: process.cwd() })
		return 'clean'
	} catch (err) {
		const lines = String(err.stdout || '').trim().split('\n').filter(Boolean)
		return `${lines.length} error(s):\n      ${lines.slice(0, 3).join('\n      ')}`
	}
}

const fixed = await readFile(INDEX, 'utf8')
const countExtensionless = src => (src.match(/from '\.\/[^']*'/g) || []).filter(m => !m.endsWith(".js'")).length

await writeFile(BACKUP, fixed)
try {
	const broken = fixed.replace(/from '(\.\/[^']*)\.js'/g, "from '$1'")
	await writeFile(INDEX, broken)
	console.log(`BEFORE  extensionless relative specifiers in lib/Utils/index.d.ts: ${countExtensionless(broken)}`)
	console.log(`        consumer importing classifyDisconnect/createRateLimiter -> ${await typecheck()}`)
	await writeFile(INDEX, fixed)
	console.log(`\nAFTER   extensionless relative specifiers in lib/Utils/index.d.ts: ${countExtensionless(fixed)}`)
	console.log(`        consumer importing classifyDisconnect/createRateLimiter -> ${await typecheck()}`)
} finally {
	await writeFile(INDEX, fixed)
	await unlink(BACKUP)
	await run('rm', ['-rf', probeDir, dir])
}
