// §2.81 — a damaged creds file must never be mistaken for "fresh install", and auth
// passwords must be rotatable without losing the session.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
	useEncryptedFileAuthState, useEncryptedSingleFileAuthState,
	rotateAuthPassword, isEncryptedPayload, decryptJSON
} from '../lib/index.js'

const PASSWORD = 'correct horse battery staple'
const NEW_PASSWORD = 'a different one entirely'
const dirs = []
const makeDir = async () => {
	const d = await mkdtemp(join(tmpdir(), 'jap-auth-test-'))
	dirs.push(d)
	return d
}
test.after(async () => { for (const d of dirs) await rm(d, { recursive: true, force: true }) })

const healthyPlaintextCreds = async () => {
	const { state } = await useEncryptedFileAuthState(await makeDir(), { password: PASSWORD })
	return JSON.stringify(state.creds)
}

test('§2.81 a damaged plaintext creds.json is refused, not replaced', async () => {
	const good = await healthyPlaintextCreds()
	const cases = [
		['truncated', good.slice(0, Math.floor(good.length / 2))],
		['empty', ''],
		['junk', '{not json at all'],
		['not an object', '"just a string"']
	]
	for (const [label, content] of cases) {
		const dir = await makeDir()
		await writeFile(join(dir, 'creds.json'), content)
		await assert.rejects(
			useEncryptedFileAuthState(dir, { password: PASSWORD }),
			err => {
				assert.match(err.message, /creds\.json/)
				assert.match(err.message, /Refusing to start a fresh session/)
				return true
			},
			label
		)
		assert.equal(await readFile(join(dir, 'creds.json'), 'utf-8'), content, `${label}: file was touched`)
	}
})

test('§2.81 a healthy plaintext creds.json still loads (transparent migration)', async () => {
	const dir = await makeDir()
	const good = await healthyPlaintextCreds()
	await writeFile(join(dir, 'creds.json'), good)
	const { state, saveCreds } = await useEncryptedFileAuthState(dir, { password: PASSWORD })
	assert.equal(state.creds.registrationId, JSON.parse(good).registrationId)
	await saveCreds()
	assert.ok(isEncryptedPayload((await readFile(join(dir, 'creds.json'), 'utf-8')).trim()))
})

test('§2.81 a damaged non-critical key file still degrades to null', async () => {
	const dir = await makeDir()
	const { state } = await useEncryptedFileAuthState(dir, { password: PASSWORD })
	await writeFile(join(dir, 'pre-key-1.json'), '{broken')
	const got = await state.keys.get('pre-key', ['1'])
	assert.deepEqual(got, { 1: null })
})

test('§2.81 the single-file state refuses an empty or unreadable file', async () => {
	const dir = await makeDir()
	const file = join(dir, 'auth.json')
	await writeFile(file, '')
	await assert.rejects(useEncryptedSingleFileAuthState(file, { password: PASSWORD }), /exists but is empty/)
	await writeFile(file, '{"keys":{}}')
	await assert.rejects(useEncryptedSingleFileAuthState(file, { password: PASSWORD }), /no "creds" object/)
	await writeFile(file, '{oops')
	await assert.rejects(useEncryptedSingleFileAuthState(file, { password: PASSWORD }), /wrong password or corrupt file/)
})

test('§2.81 rotateAuthPassword re-encrypts a folder and keeps the session usable', async () => {
	const dir = await makeDir()
	const { state, saveCreds } = await useEncryptedFileAuthState(dir, { password: PASSWORD })
	const registrationId = state.creds.registrationId
	await saveCreds()
	await state.keys.set({ 'pre-key': { 1: { public: Buffer.from([1, 2, 3]) } } })

	const report = await rotateAuthPassword(dir, { oldPassword: PASSWORD, newPassword: NEW_PASSWORD })
	assert.equal(report.rotated, 2)
	assert.equal(report.migratedFromPlaintext, 0)
	assert.deepEqual(report.failed, [])

	await assert.rejects(useEncryptedFileAuthState(dir, { password: PASSWORD }), /cannot decrypt creds\.json/)
	const reopened = await useEncryptedFileAuthState(dir, { password: NEW_PASSWORD })
	assert.equal(reopened.state.creds.registrationId, registrationId)
	assert.deepEqual([...(await reopened.state.keys.get('pre-key', ['1']))['1'].public], [1, 2, 3])
})

test('§2.81 rotateAuthPassword encrypts a legacy plaintext folder', async () => {
	const dir = await makeDir()
	const good = await healthyPlaintextCreds()
	await writeFile(join(dir, 'creds.json'), good)
	const report = await rotateAuthPassword(dir, { newPassword: NEW_PASSWORD })
	assert.equal(report.rotated, 1)
	assert.equal(report.migratedFromPlaintext, 1)
	const raw = (await readFile(join(dir, 'creds.json'), 'utf-8')).trim()
	assert.ok(isEncryptedPayload(raw))
	assert.equal(decryptJSON(raw, NEW_PASSWORD).registrationId, JSON.parse(good).registrationId)
	assert.equal((await readdir(dir)).filter(f => f.includes('.tmp-')).length, 0, 'a temp file was left behind')
})

test('§2.81 rotateAuthPassword validates input and never deletes what it cannot read', async () => {
	const dir = await makeDir()
	await assert.rejects(rotateAuthPassword(dir, {}), /newPassword is required/)
	await assert.rejects(rotateAuthPassword(dir, { oldPassword: 'x', newPassword: 'x' }), /must differ/)
	await writeFile(join(dir, 'creds.json'), 'JAPENC1.aaa.bbb.ccc.ddd')
	await writeFile(join(dir, 'app-state-sync-key-A.json'), '')
	const report = await rotateAuthPassword(dir, { oldPassword: 'wrong', newPassword: NEW_PASSWORD })
	assert.equal(report.rotated, 0)
	assert.equal(report.failed.length, 2)
	assert.deepEqual(report.failed.map(f => f.file).sort(), ['app-state-sync-key-A.json', 'creds.json'])
	assert.equal(await readFile(join(dir, 'creds.json'), 'utf-8'), 'JAPENC1.aaa.bbb.ccc.ddd')
})
