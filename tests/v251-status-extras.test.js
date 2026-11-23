import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { generateWAMessageFromContent } from '../lib/index.js'
import * as SE from '../lib/Utils/status-extras.js'
import { proto } from '../WAProto/index.js'

/**
 * §2.225 / §2.226 / §2.227 — `status-extras.js` had 284 lines and no tests.
 *
 * The decisive technique here was not reading the code, it was encoding its output.
 * Three of these builders returned fields that protobufjs silently discards: `Message`
 * has no top-level `contextInfo`, so anything placed there vanished on encode and no
 * error was ever raised. A unit test that only inspected the returned object would have
 * passed happily while the data never left the process.
 *
 * So every builder below is round-tripped through the real encoder, and the assertion is
 * that nothing the builder produced disappeared.
 */

const KEY = { id: 'ABC123' }
const GROUP = '12345-67890@g.us'
const C = ['62811111111@s.whatsapp.net', '62822222222@s.whatsapp.net', '62833333333@s.whatsapp.net']

/** Encode, decode, and report which top-level fields did not survive. */
const lostFields = content => {
	const decoded = JSON.stringify(proto.Message.decode(proto.Message.encode(proto.Message.create(content)).finish()).toJSON())
	return Object.keys(content).filter(key => !decoded.includes(`"${key}"`))
}

describe('§2.225 every builder survives protobuf encoding', () => {
	const builders = {
		statusMention: () => SE.makeStatusMentionMessage({ message: { extendedTextMessage: { text: 'hi' } } }),
		statusMentionGroup: () => SE.makeStatusMentionMessage({ message: { extendedTextMessage: { text: 'hi' } } }, { group: true }),
		questionAnswer: () => SE.makeStatusQuestionAnswerMessage(KEY, 'jawaban'),
		stickerInteraction: () => SE.makeStatusStickerInteractionMessage(KEY),
		statusQuoted: () => SE.makeStatusQuotedMessage(KEY, { text: 'halo' }),
		groupReaction: () => SE.makeGroupStatusReactionMessage(KEY, '🔥', { groupJid: GROUP })
	}

	for (const [name, build] of Object.entries(builders)) {
		it(`${name} produces no field that the encoder throws away`, () => {
			assert.deepEqual(lostFields(build()), [], 'a dropped field is data the recipient never sees')
		})
	}
})

describe('§2.225 the reshare attribution actually reaches the wire', () => {
	it('is carried on the quoted content, where ContextInfo exists', () => {
		const content = SE.makeStatusMentionMessage({ message: { imageMessage: { url: 'https://x', mimetype: 'image/jpeg' } } })
		const full = generateWAMessageFromContent('status@broadcast', content, { userJid: '0@s.whatsapp.net' })
		const json = JSON.stringify(full.message)
		assert.ok(json.includes('statusAttributionType') || json.includes('RESHARED'), 'attributionType must not be silently dropped')
	})

	it('works for a text status as well as a media one', () => {
		const content = SE.makeStatusMentionMessage({ message: { extendedTextMessage: { text: 'hi' } } })
		const full = generateWAMessageFromContent('status@broadcast', content, { userJid: '0@s.whatsapp.net' })
		assert.match(JSON.stringify(full.message), /statusAttributionType|RESHARED/)
	})

	it('an existing contextInfo on the quoted content is preserved, not replaced', () => {
		const quoted = { message: { extendedTextMessage: { text: 'hi', contextInfo: { isForwarded: true } } } }
		const content = SE.makeStatusMentionMessage(quoted)
		const inner = content.statusMentionMessage.message.extendedTextMessage.contextInfo
		assert.equal(inner.isForwarded, true)
		assert.ok(inner.statusAttributionType !== undefined)
	})

	it('the original status object is not mutated', () => {
		const quoted = { message: { extendedTextMessage: { text: 'hi' } } }
		SE.makeStatusMentionMessage(quoted)
		assert.equal(quoted.message.extendedTextMessage.contextInfo, undefined, 'a builder must not edit its input')
	})

	it('rejects something that is not a status message', () => {
		assert.throws(() => SE.makeStatusMentionMessage(null), /pass the status message/)
	})
})

describe('§2.226 an explicitly undefined key field must not erase the default', () => {
	// The obvious caller writes `{ id: msg.key.id, remoteJid: msg.key.remoteJid }`. When
	// that message has no remoteJid, spread copies the key as present-and-undefined and
	// the status@broadcast default was deleted.
	it('questionAnswer keeps status@broadcast', () => {
		const built = SE.makeStatusQuestionAnswerMessage({ id: 'X', remoteJid: undefined }, 'a')
		assert.equal(built.statusQuestionAnswerMessage.key.remoteJid, 'status@broadcast')
	})

	it('stickerInteraction keeps status@broadcast', () => {
		const built = SE.makeStatusStickerInteractionMessage({ id: 'X', remoteJid: undefined })
		assert.equal(built.statusStickerInteractionMessage.key.remoteJid, 'status@broadcast')
	})

	it('statusQuoted keeps status@broadcast', () => {
		const built = SE.makeStatusQuotedMessage({ id: 'X', remoteJid: undefined }, { text: 'hi' })
		assert.equal(built.statusQuotedMessage.originalStatusId.remoteJid, 'status@broadcast')
	})

	it('a real remoteJid still overrides the default', () => {
		const built = SE.makeStatusQuestionAnswerMessage({ id: 'X', remoteJid: C[0] }, 'a')
		assert.equal(built.statusQuestionAnswerMessage.key.remoteJid, C[0])
	})

	it('other undefined fields are dropped rather than sent as nulls', () => {
		const built = SE.makeStatusQuestionAnswerMessage({ id: 'X', participant: undefined }, 'a')
		assert.ok(!('participant' in built.statusQuestionAnswerMessage.key))
	})
})

describe('§2.227 the group reaction carries no field the protocol cannot hold', () => {
	it('does not claim a parentGroupJid that ReactionMessage cannot carry', () => {
		const built = SE.makeGroupStatusReactionMessage(KEY, '🔥', { groupJid: GROUP })
		assert.ok(!('contextInfo' in built), 'removed rather than relocated: there is nowhere valid for it')
	})

	it('still identifies the group, through key.remoteJid', () => {
		const built = SE.makeGroupStatusReactionMessage(KEY, '🔥', { groupJid: GROUP })
		assert.equal(built.reactionMessage.key.remoteJid, GROUP)
	})

	it('falls back to status@broadcast with no group', () => {
		const built = SE.makeGroupStatusReactionMessage(KEY, '🔥', {})
		assert.equal(built.reactionMessage.key.remoteJid, 'status@broadcast')
	})
})

describe('makeGroupStatusAttribution is pre-generation content, and that is the difference', () => {
	// Its contextInfo is NOT dead: sendMessage merges a top-level contextInfo into the
	// message it builds. Only raw message nodes lose it. Asserting the distinction keeps
	// a future cleanup from "fixing" this one by symmetry.
	it('keeps its contextInfo, because sendMessage merges it', () => {
		const built = SE.makeGroupStatusAttribution({ text: 'hi' }, GROUP)
		assert.equal(built.contextInfo.parentGroupJid, GROUP)
	})

	it('rejects a non-group jid', () => {
		assert.throws(() => SE.makeGroupStatusAttribution({ text: 'hi' }, C[0]), /@g\.us/)
	})
})

describe('makeStatusAudienceMetadata — audience rules', () => {
	it('plain contacts become a contacts audience', () => {
		const a = SE.makeStatusAudienceMetadata({ contacts: C })
		assert.equal(a.type, 'contacts')
		assert.deepEqual(a.statusJidList, C)
		assert.equal(a.truncated, 0)
	})

	it('except filters and switches to denylist', () => {
		const a = SE.makeStatusAudienceMetadata({ contacts: C, except: [C[1]] })
		assert.equal(a.type, 'denylist')
		assert.deepEqual(a.statusJidList, [C[0], C[2]])
		assert.deepEqual(a.excluded, [C[1]])
	})

	it('only is an allowlist', () => {
		const a = SE.makeStatusAudienceMetadata({ only: [C[0]] })
		assert.equal(a.type, 'allowlist')
		assert.deepEqual(a.statusJidList, [C[0]])
	})

	it('refuses to combine only with contacts or except', () => {
		assert.throws(() => SE.makeStatusAudienceMetadata({ only: [C[0]], contacts: C }), /allowlist on its own/)
		assert.throws(() => SE.makeStatusAudienceMetadata({ only: [C[0]], except: [C[1]] }), /allowlist on its own/)
	})

	it('de-duplicates, and truncates after filtering', () => {
		assert.deepEqual(SE.makeStatusAudienceMetadata({ contacts: [C[0], C[0], C[1]] }).statusJidList, [C[0], C[1]])
		const capped = SE.makeStatusAudienceMetadata({ contacts: C, limit: 2 })
		assert.equal(capped.statusJidList.length, 2)
		assert.equal(capped.truncated, 1)
	})

	it('rejects an empty audience, a bad jid, a group jid and a bad limit', () => {
		assert.throws(() => SE.makeStatusAudienceMetadata({ contacts: [C[0]], except: [C[0]] }), /audience is empty/)
		assert.throws(() => SE.makeStatusAudienceMetadata({ contacts: ['not-a-jid'] }), /must contain user JIDs/)
		assert.throws(() => SE.makeStatusAudienceMetadata({ contacts: [GROUP] }), /must contain user JIDs/)
		assert.throws(() => SE.makeStatusAudienceMetadata({ contacts: C, limit: 0 }), /positive integer/)
		assert.throws(() => SE.makeStatusAudienceMetadata(), /audience is empty/)
	})
})

describe('the remaining interaction builders validate their input', () => {
	it('questionAnswer needs a key id and non-empty text', () => {
		assert.throws(() => SE.makeStatusQuestionAnswerMessage({}, 'a'), /key with an id/)
		assert.throws(() => SE.makeStatusQuestionAnswerMessage(KEY, '   '), /cannot be empty/)
	})

	it('stickerInteraction needs a key id and a sane type', () => {
		assert.throws(() => SE.makeStatusStickerInteractionMessage({}), /key with an id/)
		assert.throws(() => SE.makeStatusStickerInteractionMessage(KEY, null, { type: -1 }), /non-negative integer/)
	})

	it('statusQuoted rejects an unknown type', () => {
		assert.throws(() => SE.makeStatusQuotedMessage(KEY, { type: 999 }), /unknown type/)
	})
})
