// §2.94 — accepting a group/community invite records the inviter, not the chat it arrived in.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { makeAcceptInvite } from './helpers/invite-accept.mjs'
import { WAMessageStubType } from '../lib/index.js'

const ME = '628111@s.whatsapp.net'
const INVITER = '628999@s.whatsapp.net'
const INVITE = { groupJid: '120999@g.us', inviteCode: 'CODE', inviteExpiration: 1_999_999_999 }

for (const kind of ['group', 'community']) {
	test(`§2.94 (${kind}) an invite forwarded into a group credits the inviter, not the group`, async () => {
		const { accept, queries, upserts } = makeAcceptInvite(kind, { me: ME })
		await accept({ id: 'M1', remoteJid: '120363@g.us', participant: INVITER }, { ...INVITE })
		assert.equal(queries[0].content[0].attrs.admin, INVITER, 'the server must be told who invited us')
		assert.equal(upserts[0].msg.key.participant, INVITER)
		assert.equal(upserts[0].msg.participant, INVITER)
		assert.equal(upserts[0].msg.key.remoteJid, INVITE.groupJid)
		assert.equal(upserts[0].msg.messageStubType, WAMessageStubType.GROUP_PARTICIPANT_ADD)
	})

	test(`§2.94 (${kind}) a 1:1 invite still works, and a bare jid string still works`, async () => {
		const direct = makeAcceptInvite(kind, { me: ME })
		await direct.accept({ id: 'M2', remoteJid: INVITER }, { ...INVITE })
		assert.equal(direct.queries[0].content[0].attrs.admin, INVITER)
		assert.equal(direct.upserts[0].msg.key.participant, INVITER)

		const asString = makeAcceptInvite(kind, { me: ME })
		await asString.accept(INVITER, { ...INVITE })
		assert.equal(asString.queries[0].content[0].attrs.admin, INVITER)
		assert.equal(asString.upserts.length, 1)
		assert.equal(asString.updates.length, 0, 'no message key → nothing to expire')
	})

	test(`§2.94 (${kind}) the stub parameter is a jid, not our credential object`, async () => {
		const { accept, upserts } = makeAcceptInvite(kind, { me: ME })
		await accept({ id: 'M3', remoteJid: INVITER }, { ...INVITE })
		assert.deepEqual(upserts[0].msg.messageStubParameters, [ME])
		assert.equal(JSON.stringify(upserts[0].msg.messageStubParameters).includes('lid'), false, 'our LID must not leak into the store')
		assert.equal(JSON.stringify(upserts[0].msg.messageStubParameters).includes('JAP Bot'), false, 'our push name must not leak either')
	})

	test(`§2.94 (${kind}) a device-suffixed inviter jid is normalised`, async () => {
		const { accept, queries, upserts } = makeAcceptInvite(kind, { me: ME })
		await accept({ id: 'M4', remoteJid: '120363@g.us', participant: '628999:12@s.whatsapp.net' }, { ...INVITE })
		assert.equal(queries[0].content[0].attrs.admin, INVITER)
		assert.equal(upserts[0].msg.key.participant, INVITER)
	})
}

test('§2.94 both call sites really use the resolved inviter', () => {
	for (const file of ['../lib/Socket/groups.js', '../lib/Socket/communities.js']) {
		const src = readFileSync(new URL(file, import.meta.url), 'utf8')
		const code = src.split('\n').filter(line => !/^\s*(\*|\/\/|\/\*)/.test(line)).join('\n')
		assert.match(code, /const inviterJid = jidNormalizedUser\(key\.participant \|\| key\.remoteJid\);/, file)
		assert.match(code, /admin: inviterJid/, file)
		assert.doesNotMatch(code, /participant: key\.remoteJid/, file)
		assert.doesNotMatch(code, /JSON\.stringify\(authState\.creds\.me\)/, file)
	}
})
