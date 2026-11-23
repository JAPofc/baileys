import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'

import { QueryIds, XWAPaths } from '../lib/Types/index.js'

/**
 * §2.219 — `newsletterAction()` and `newsletterReactionMode()`, ported from community
 * forks that expose a runtime-chosen channel action.
 *
 * These are socket methods, so a live WhatsApp connection would be needed to call them for
 * real. What CAN be verified offline, and is what actually went wrong in similar ports
 * elsewhere, is that they route to query ids this library already owns. A fork that
 * invents a query id ships a method that fails at the server with an opaque error; the
 * check below fails the build instead.
 */

const source = readFileSync(new URL('../lib/Socket/newsletter.js', import.meta.url), 'utf8')

describe('§2.219 newsletterAction routes only to query ids we already ship', () => {
	it('every action in the table maps to a real QueryId and XWAPath', () => {
		const table = source.match(/const NEWSLETTER_ACTIONS = \{([\s\S]*?)\};/)
		assert.ok(table, 'the action table is still a literal we can audit')
		const entries = [...table[1].matchAll(/(\w+):\s*\{\s*queryId:\s*'(\w+)',\s*path:\s*'(\w+)'\s*\}/g)]
		assert.equal(entries.length, 4, 'FOLLOW, UNFOLLOW, MUTE, UNMUTE')
		for (const [, action, queryId, path] of entries) {
			assert.ok(QueryIds[queryId], `${action} points at QueryIds.${queryId}, which must exist`)
			assert.ok(XWAPaths[path], `${action} points at XWAPaths.${path}, which must exist`)
			assert.match(QueryIds[queryId], /^\d+$/, 'a query id is a numeric string, not a placeholder')
		}
	})

	it('the action and the query id agree — no silently crossed wires', () => {
		const table = source.match(/const NEWSLETTER_ACTIONS = \{([\s\S]*?)\};/)[1]
		const entries = [...table.matchAll(/(\w+):\s*\{\s*queryId:\s*'(\w+)'/g)]
		for (const [, action, queryId] of entries) {
			assert.equal(queryId, action, `${action} must dispatch to the ${action} query, not ${queryId}`)
		}
	})

	it('an unknown action is rejected locally, by name', () => {
		assert.match(source, /unknown newsletter action/, 'the method refuses rather than sending garbage')
		assert.match(source, /statusCode: 400/, 'and does so as a 400, not a generic throw')
	})

	it('no query id is hardcoded inside the new methods', () => {
		const added = source.slice(source.indexOf('newsletterAction:'))
		assert.doesNotMatch(added, /['"]\d{10,}['"]/, 'a long numeric literal here would be an invented query id')
	})
})

describe('§2.219 newsletterReactionMode', () => {
	it('validates the mode against the documented set', () => {
		const modes = source.match(/const NEWSLETTER_REACTION_MODES = \[([^\]]*)\]/)
		assert.ok(modes)
		assert.deepEqual(
			modes[1].split(',').map(m => m.trim().replace(/'/g, '')),
			['ALL', 'BASIC', 'NONE']
		)
		assert.match(source, /unknown reaction mode/)
	})

	it('rides the existing UPDATE_METADATA mutation instead of a new query', () => {
		const method = source.slice(source.indexOf('newsletterReactionMode:'))
		assert.match(method, /newsletterUpdate\(jid, \{ settings: \{ reaction_codes: \{ value \} \} \}\)/)
		assert.doesNotMatch(method, /executeWMexQuery/, 'no second route to the same mutation')
	})

	it('§2.219 settings is nested under settings, not spread at the top level', () => {
		// The pre-existing newsletterUpdate() hardcoded `settings: null`, which would have
		// silently dropped a reaction_codes passed as a sibling of name/description.
		const update = source.slice(source.indexOf('const newsletterUpdate'), source.indexOf('const newsletterUpdate') + 600)
		assert.match(update, /const \{ settings = null, \.\.\.rest \} = updates \|\| \{\}/)
		assert.match(update, /\.\.\.rest,\s*\n\s*settings/)
	})

	it('callers that pass no settings still send null, exactly as before', () => {
		const update = source.slice(source.indexOf('const newsletterUpdate'), source.indexOf('const newsletterUpdate') + 600)
		assert.match(update, /settings = null/, 'the default preserves the old wire shape')
	})
})
