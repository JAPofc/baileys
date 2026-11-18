// §2.103 repro -- processSyncAction() drops app-state actions it has no branch for.
// Clearing a chat on the phone is the loud one: we build that patch ourselves, but we never
// processed an incoming one, so the bot's store kept every message of a cleared chat.
import { execFileSync } from 'node:child_process'
import { processSyncAction } from '../lib/Utils/index.js'
import { toNumber } from '../lib/Utils/generics.js'
import { LabelAssociationType } from '../lib/Types/index.js'

// pull the pre-fix processSyncAction straight out of git so BEFORE and AFTER are both real
const oldSrc = execFileSync('git', ['show', 'HEAD:lib/Utils/chat-utils.js'], { encoding: 'utf8' })
const from = oldSrc.indexOf('export const processSyncAction')
const body = oldSrc.slice(from, oldSrc.indexOf('\n};', from) + 3).replace('export const', 'const')
const oldProcess = new Function('toNumber', 'LabelAssociationType', 'processContactAction', 'emitSyncActionResults',
	`${body}\nreturn processSyncAction`)(toNumber, LabelAssociationType, () => [], () => {})

const events = []
const ev = { emit: (name, data) => events.push({ name, data }) }
const logged = []
const logger = { trace() {}, debug: (o, m) => logged.push(m) }

const once = (fn, syncAction) => {
	events.length = 0; logged.length = 0
	fn(syncAction, ev, { id: '1@s.whatsapp.net' }, undefined, logger)
	return events.length ? events.map(e => e.name).join(', ') : `DROPPED ("${logged[0]}")`
}

const run = (syncAction, label) => {
	const before = oldProcess ? once(oldProcess, syncAction) : 'n/a'
	const after = once(processSyncAction, syncAction)
	console.log(`${label.padEnd(26)} BEFORE: ${before.padEnd(34)} AFTER: ${after}`)
}

run({ syncAction: { value: { clearChatAction: { messageRange: {} } } }, index: ['clearChat', '62@s.whatsapp.net', '1', '0'] }, 'chat cleared on phone')
run({ syncAction: { value: { quickReplyAction: { shortcut: 'hi', message: 'Hello!' } } }, index: ['quickReply', 'hi'] }, 'business quick reply')
run({ syncAction: { value: { chatAssignment: { deviceAgentID: 'agent-7' } } }, index: ['agentChatAssignment', '62@s.whatsapp.net'] }, 'chat assigned to an agent')
run({ syncAction: { value: { removeRecentStickerAction: { lastStickerSentTs: 1 } } }, index: ['removeRecentSticker', 'abc'] }, 'recent sticker removed')
run({ syncAction: { value: { archiveChatAction: { archived: true } } }, index: ['archive', '62@s.whatsapp.net'] }, 'chat archived (handled)')
