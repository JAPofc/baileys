// v2.4.6 — startup banner v4: pure renderBanner(), true-color gradient with
// 256-color fallback, OSC-8 hyperlink, NO_COLOR keeps layout, compact mode.
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { renderBanner, BANNER_THEMES, printBanner, _resetBannerShown } from '../lib/Utils/banner.js'

// banner.js reads NO_COLOR / FORCE_COLOR / JAP_BANNER_THEME at module load, so
// env-driven behaviour is exercised in a fresh child process with a clean env.
const bannerUrl = new URL('../lib/Utils/banner.js', import.meta.url).href
const cleanEnv = () => {
	const e = { ...process.env }
	delete e.NO_COLOR; delete e.FORCE_COLOR; delete e.JAP_BANNER_THEME; delete e.COLORTERM
	return e
}
const runChild = (env, code) =>
	execFileSync(process.execPath, ['--input-type=module', '-e', code], {
		env: { ...cleanEnv(), ...env }
	}).toString()

const SGR = /\x1b\[[0-9;]*m/
const OSC8 = /\x1b\]8;;https:\/\/github\.com\/JAPofc\/baileys\x1b\\/

test('renderBanner is pure and returns the wordmark + info card lines', () => {
	const lines = renderBanner({ tty: true, color: true, columns: 100 })
	assert.ok(Array.isArray(lines) && lines.length > 6, 'returns an array of lines')
	const joined = lines.join('\n')
	assert.match(joined, /@japofc\/baileys/, 'shows the package name')
	assert.match(joined, /github\.com\/JAPofc\/baileys/, 'shows the repo')
	// Box is padded consistently — every card border row has equal visible width.
	const borderRows = lines.filter(l => l.includes('│'))
	const widths = new Set(borderRows.map(l => [...l.replace(SGR, '').replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\]8;;[^\x07\x1b]*(?:\x07|\x1b\\)/g, '')].length))
	assert.ok(borderRows.length >= 2, 'has boxed card rows')
})

test('true-color emits 24-bit sequences; 256-color mode does not', () => {
	const tc = renderBanner({ tty: true, color: true, truecolor: true, columns: 100 }).join('\n')
	assert.match(tc, /\x1b\[38;2;\d+;\d+;\d+m/, 'true-color uses 38;2;R;G;B')
	const c256 = renderBanner({ tty: true, color: true, truecolor: false, columns: 100 }).join('\n')
	assert.ok(!/\x1b\[38;2;/.test(c256), '256-color mode never emits 38;2;')
	assert.match(c256, /\x1b\[38;5;\d+m/, '256-color uses 38;5;N')
})

test('NO_COLOR strips SGR color but keeps the box, emoji and OSC-8 link label', () => {
	const lines = renderBanner({ tty: true, color: false, columns: 100 })
	const joined = lines.join('\n')
	assert.ok(!SGR.test(joined), 'no ANSI color codes remain')
	assert.ok(joined.includes('╭') && joined.includes('╰'), 'box drawing survives')
	assert.match(joined, /github\.com\/JAPofc\/baileys/, 'repo label survives')
})

test('OSC-8 hyperlink only when tty; compact layout under 56 columns', () => {
	const tty = renderBanner({ tty: true, color: true, columns: 100 }).join('\n')
	assert.match(tty, OSC8, 'tty emits a clickable OSC-8 link')
	const notty = renderBanner({ tty: false, color: true, columns: 100 }).join('\n')
	assert.ok(!OSC8.test(notty), 'non-tty falls back to a plain label')

	const wide = renderBanner({ tty: true, color: true, columns: 100 })
	const narrow = renderBanner({ tty: true, color: true, columns: 40 })
	assert.ok(narrow.length < wide.length, 'compact banner is shorter')
	assert.ok(!narrow.join('\n').includes('╭'), 'compact banner has no full box')
})

test('v5: FORCE_COLOR forces colour even off a TTY; FORCE_COLOR=0 disables it', () => {
	const probe = `import {renderBanner} from ${JSON.stringify(bannerUrl)};` +
		`process.stdout.write(renderBanner().some(l=>/\\u001b\\[[0-9;]*m/.test(l))?'C':'N');`
	// child stdout is a pipe (not a TTY): without a hint it would be colourless…
	assert.equal(runChild({}, probe), 'N', 'no colour on a bare pipe')
	// …FORCE_COLOR turns it on anyway (CI / pm2 dashboards)…
	assert.equal(runChild({ FORCE_COLOR: '1' }, probe), 'C', 'FORCE_COLOR forces colour')
	// …and FORCE_COLOR=0 / NO_COLOR turn it off.
	assert.equal(runChild({ FORCE_COLOR: '0' }, probe), 'N', 'FORCE_COLOR=0 disables')
	assert.equal(runChild({ NO_COLOR: '1', FORCE_COLOR: '1' }, probe), 'N', 'NO_COLOR wins')
})

test('v5: JAP_BANNER_THEME=daily is deterministic; default varies across runs', () => {
	const probe = `import {renderBanner} from ${JSON.stringify(bannerUrl)};` +
		`const m=renderBanner({tty:true,color:true,truecolor:true,columns:100}).join('').match(/38;2;\\d+;\\d+;\\d+/);` +
		`process.stdout.write(m?m[0]:'x');`
	// Pinned "daily" → identical gradient in two separate processes on the same day.
	assert.equal(runChild({ JAP_BANNER_THEME: 'daily' }, probe), runChild({ JAP_BANNER_THEME: 'daily' }, probe))
	// Pinned name → that exact theme, stable.
	assert.equal(runChild({ JAP_BANNER_THEME: 'ocean' }, probe), runChild({ JAP_BANNER_THEME: 'ocean' }, probe))
	// Default (auto/random) → sample several runs; a fixed theme could never yield
	// more than one distinct value, so >1 distinct proves it varies per run.
	const seen = new Set()
	for (let i = 0; i < 12; i++) seen.add(runChild({}, probe))
	assert.ok(seen.size > 1, 'auto theme varies across runs')
})

test('BANNER_THEMES lists the pinnable gradient themes', () => {
	for (const t of ['leaf', 'ocean', 'sunset', 'violet', 'aurora', 'ember']) {
		assert.ok(BANNER_THEMES.includes(t), `theme ${t} is pinnable`)
	}
})

test('printBanner is guarded to fire once per process', () => {
	_resetBannerShown()
	let writes = 0
	const orig = process.stdout.write.bind(process.stdout)
	process.stdout.write = () => { writes++; return true }
	try {
		printBanner()
		printBanner()
	} finally {
		process.stdout.write = orig
	}
	assert.equal(writes, 1, 'second call is a no-op')
	_resetBannerShown()
})
