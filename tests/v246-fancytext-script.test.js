// v2.4.6 — fancy-text: script-style weight consistency (§2.25) + unstyleText round-trip.
import test from 'node:test'
import assert from 'node:assert/strict'
import { styleText, unstyleText, listTextStyles } from '../lib/Utils/fancy-text.js'

test('script style is uniformly bold-script (no non-bold letterlike holes)', () => {
	// Regression for §2.25: 'script' used the BOLD-script base (U+1D4D0) whose
	// block is COMPLETE, but SPECIALS injected non-bold Letterlike glyphs
	// (B=U+212C, E=U+2130, …) for 11 letters, rendering them a different weight.
	const styled = styleText('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'script')
	const cps = [...styled].map(ch => ch.codePointAt(0))
	// Every uppercase letter must be contiguous from U+1D4D0.
	cps.forEach((cp, i) => {
		assert.equal(cp, 0x1d4d0 + i, `letter #${i} should be U+${(0x1d4d0 + i).toString(16)} not U+${cp.toString(16)}`)
	})
	// The specific glyphs that used to leak in must NOT appear.
	for (const bad of ['\u212c', '\u2130', '\u2131', '\u210b', '\u2110', '\u2112', '\u2133', '\u211b', '\u212f', '\u210a', '\u2134']) {
		assert.ok(!styled.includes(bad), `stray letterlike glyph U+${bad.codePointAt(0).toString(16)} must be gone`)
	}
	// Lowercase must also stay contiguous from U+1D4EA.
	const lower = styleText('abcdefghijklmnopqrstuvwxyz', 'script')
	;[...lower].map(ch => ch.codePointAt(0)).forEach((cp, i) => {
		assert.equal(cp, 0x1d4ea + i)
	})
})

test('unstyleText reverses offset styles and specials back to ASCII', () => {
	const sample = 'Hello World 2026'
	// Every non-lossy style must round-trip exactly.
	for (const st of listTextStyles()) {
		if (st === 'upsideDown' || st === 'smallcaps') continue // order-reversed / case-lossy
		assert.equal(unstyleText(styleText(sample, st)), sample, `round-trip failed for ${st}`)
	}
	// small-caps is case-lossy: normalizes to lowercase ASCII.
	assert.equal(unstyleText(styleText(sample, 'smallcaps')), sample.toLowerCase())
	// Unknown characters (emoji, punctuation) pass through untouched.
	assert.equal(unstyleText('hi 🎉 ' + styleText('BOT', 'bold') + '!'), 'hi 🎉 BOT!')
})

test('unstyleText tolerates nullish / empty input', () => {
	assert.equal(unstyleText(''), '')
	assert.equal(unstyleText(null), '')
	assert.equal(unstyleText(undefined), '')
})
