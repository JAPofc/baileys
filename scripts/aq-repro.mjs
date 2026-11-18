// §2.81 repro -- lib/Utils/auth-secure.js
//
// useEncryptedFileAuthState() already refuses to start over an existing session when
// creds.json cannot be DECRYPTED (wrong password). But the legacy-plaintext branch in the
// same reader returns null on ANY parse problem -- including a creds.json that is truncated,
// empty, or half-written -- and null means "fresh install": initAuthCreds() mints a new
// identity and the very next saveCreds() overwrites the file. The session is gone.
import { mkdtemp, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { useEncryptedFileAuthState } from '../lib/index.js'

const PASSWORD = 'correct horse battery staple'

const scenario = async (label, credsContent) => {
	const dir = await mkdtemp(join(tmpdir(), 'jap-auth-'))
	await writeFile(join(dir, 'creds.json'), credsContent)
	try {
		const { state, saveCreds } = await useEncryptedFileAuthState(dir, { password: PASSWORD })
		const id = state.creds.registrationId
		await saveCreds()
		const after = await readFile(join(dir, 'creds.json'), 'utf-8')
		const overwritten = after !== credsContent
		console.log(`  ${label.padEnd(34)} started with a ${id ? 'NEW identity' : '?'} ` +
			`${overwritten ? '-> *** ORIGINAL FILE OVERWRITTEN ***' : '(file intact)'}`)
	} catch (err) {
		console.log(`  ${label.padEnd(34)} refused: ${String(err.message).slice(0, 52)}…`)
	}
}

// a real, healthy plaintext creds file for reference
const { state: fresh } = await useEncryptedFileAuthState(await mkdtemp(join(tmpdir(), 'jap-ok-')), { password: PASSWORD })
const goodPlaintext = JSON.stringify(fresh.creds)

console.log('what happens to an existing session when creds.json is damaged?\n')
await scenario('truncated plaintext creds.json', goodPlaintext.slice(0, Math.floor(goodPlaintext.length / 2)))
await scenario('empty creds.json (0 bytes)', '')
await scenario('plaintext creds.json with junk', '{not json at all')
await scenario('encrypted creds, wrong password', 'JAPENC1.' + 'x'.repeat(10))
console.log('\n  (the encrypted/wrong-password case was already guarded; the plaintext ones were not)')
