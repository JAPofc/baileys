/**
 * Harness: lift `handleNewsletterNotification` out of lib/Socket/messages-recv.js and run it
 * against stubs. The function lives inside the socket closure, so building a whole socket
 * just to exercise one notification branch is not practical — this executes the REAL source
 * text, so the test cannot drift from the implementation.
 */
import { readFileSync } from 'node:fs'
import {
	areJidsSameUser, getAllBinaryNodeChildren, getBinaryNodeChild, getBinaryNodeChildString, getBinaryNodeChildren
} from '../../lib/WABinary/index.js'
import { unixTimestampSeconds } from '../../lib/Utils/index.js'
import { proto } from '../../WAProto/index.js'

const SOURCE = new URL('../../lib/Socket/messages-recv.js', import.meta.url)

export const extractNewsletterHandler = () => {
	const src = readFileSync(SOURCE, 'utf8')
	const start = src.indexOf('    const handleNewsletterNotification = async (node) => {')
	if (start === -1) {
		throw new Error('handleNewsletterNotification not found — did the function get renamed?')
	}
	const end = src.indexOf('\n    };', start)
	if (end === -1) {
		throw new Error('could not find the end of handleNewsletterNotification')
	}
	return src.slice(start, end + '\n    };'.length)
}

export const makeNewsletterHandler = ({ me = '628111@s.whatsapp.net', lid } = {}) => {
	const body = extractNewsletterHandler()
	const events = []
	const upserts = []
	const logs = []
	const deps = {
		authState: { creds: { me: { id: me, ...(lid ? { lid } : {}) } } },
		areJidsSameUser,
		unixTimestampSeconds,
		ev: { emit: (event, data) => events.push({ event, data }) },
		logger: {
			debug: (...a) => logs.push(['debug', ...a]),
			info: (...a) => logs.push(['info', ...a]),
			warn: (...a) => logs.push(['warn', ...a]),
			error: (...a) => logs.push(['error', ...a])
		},
		upsertMessage: async (msg, type) => { upserts.push({ msg, type }) },
		getAllBinaryNodeChildren,
		getBinaryNodeChild,
		getBinaryNodeChildString,
		getBinaryNodeChildren,
		proto
	}
	const factory = new Function(...Object.keys(deps), `${body}\n    return handleNewsletterNotification;`)
	return { handle: factory(...Object.values(deps)), events, upserts, logs }
}
