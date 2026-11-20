/**
 * Harness: lift `groupAcceptInviteV4` / `communityAcceptInviteV4` out of their socket
 * closures and run them against stubs, so the accept path can be tested without building a
 * full socket. The REAL source text is executed.
 */
import { readFileSync } from 'node:fs'
import { proto } from '../../WAProto/index.js'
import { generateMessageIDV2, unixTimestampSeconds } from '../../lib/Utils/index.js'
import { jidNormalizedUser } from '../../lib/WABinary/index.js'
import { WAMessageStubType } from '../../lib/Types/index.js'

const FILES = {
	group: { url: new URL('../../lib/Socket/groups.js', import.meta.url), fn: 'groupAcceptInviteV4', query: 'groupQuery' },
	community: { url: new URL('../../lib/Socket/communities.js', import.meta.url), fn: 'communityAcceptInviteV4', query: 'communityQuery' }
}

export const makeAcceptInvite = (kind, { me = '628111@s.whatsapp.net', lid = '111111@lid' } = {}) => {
	const { url, fn, query } = FILES[kind]
	const src = readFileSync(url, 'utf8')
	const start = src.indexOf(`        ${fn}: ev.createBufferedFunction(async (key, inviteMessage) => {`)
	if (start === -1) {
		throw new Error(`${fn} not found — did it get renamed?`)
	}
	const end = src.indexOf('\n        }),', start)
	if (end === -1) {
		throw new Error(`could not find the end of ${fn}`)
	}
	const body = src.slice(start + `        ${fn}: `.length, end + '\n        })'.length)

	const queries = []
	const updates = []
	const upserts = []
	const deps = {
		ev: { createBufferedFunction: f => f, emit: (event, data) => updates.push({ event, data }) },
		upsertMessage: async (msg, type) => { upserts.push({ msg, type }) },
		authState: { creds: { me: { id: me, lid, name: 'JAP Bot' } } },
		sock: { user: { id: me } },
		proto,
		generateMessageIDV2,
		unixTimestampSeconds,
		jidNormalizedUser,
		WAMessageStubType,
		[query]: async (jid, type, content) => {
			queries.push({ jid, type, content })
			return { tag: 'iq', attrs: { from: jid } }
		}
	}
	const factory = new Function(...Object.keys(deps), `return (${body});`)
	return { accept: factory(...Object.values(deps)), queries, updates, upserts }
}
