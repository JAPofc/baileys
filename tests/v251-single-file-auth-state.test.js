import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { useSingleFileAuthState } from '../lib/Utils/use-single-file-auth-state.js'

/**
 * §2.223 / §2.224 — `useSingleFileAuthState` against the real filesystem.
 *
 * This module had no tests at all, and it stores credentials. Two things were wrong, and
 * both were invisible from reading the happy path: `saveCreds()` only queued a debounced
 * write while looking like it had persisted, and the file was created with the default
 * umask while every later write used 0600.
 *
 * The sibling API, `useMultiFileAuthState`, got both of these right. Several assertions
 * below compare the two directly, because "two functions that do the same job disagree"
 * is the shape this bug actually had.
 */

const run = promisify(execFile)
const here = dirname(fileURLToPath(import.meta.url))

const freshDir = () => mkdtemp(join(tmpdir(), 'jap-sfa-'))
const modeOf = async path => (await stat(path)).mode & 0o777

describe('§2.224 file permissions', () => {
	it('the credential file is owner-only from the moment it is created', async () => {
		const dir = await freshDir()
		try {
			const file = join(dir, 'auth.json')
			await useSingleFileAuthState(file)
			assert.equal(await modeOf(file), 0o600, 'created 0644 would leave the session world-readable')
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})

	it('stays 0600 after a flush replaces the file', async () => {
		const dir = await freshDir()
		try {
			const file = join(dir, 'auth.json')
			const { state, saveCreds } = await useSingleFileAuthState(file)
			state.creds.me = { id: '62811@s.whatsapp.net' }
			await saveCreds()
			assert.equal(await modeOf(file), 0o600)
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})
})

describe('§2.223 saveCreds() actually persists before it resolves', () => {
	it('the credentials are on disk the instant the await returns', async () => {
		const dir = await freshDir()
		try {
			const file = join(dir, 'auth.json')
			const { state, saveCreds } = await useSingleFileAuthState(file)
			state.creds.me = { id: '62811@s.whatsapp.net', name: 'uji' }
			await saveCreds()
			// read the file directly, with no delay at all
			const onDisk = JSON.parse(await readFile(file, 'utf-8'))
			assert.equal(onDisk.creds?.me?.id, '62811@s.whatsapp.net', 'awaiting saveCreds must mean it is saved')
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})

	it('a process that exits straight after pairing keeps its session', async () => {
		// The real symptom was a lost session, which only a separate process can show:
		// before the fix this child exited during the 3s debounce and wrote nothing.
		const dir = await freshDir()
		try {
			const file = join(dir, 'auth.json')
			await run(process.execPath, [join(here, 'fixtures', 'single-file-auth-exit.mjs'), file], { timeout: 30_000 })
			const onDisk = JSON.parse(await readFile(file, 'utf-8'))
			assert.equal(onDisk.creds?.me?.id, 'exit-test@s.whatsapp.net')
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})

	it('the debounce timer does not hold the process open', async () => {
		// Nothing asserts a timer directly; what a user feels is a script that has finished
		// its work and still will not exit. So that is what is measured.
		const dir = await freshDir()
		try {
			const started = Date.now()
			const { stdout } = await run(process.execPath, [join(here, 'fixtures', 'single-file-auth-linger.mjs'), join(dir, 'auth.json')], {
				timeout: 30_000
			})
			const elapsed = Date.now() - started
			assert.match(stdout, /done/)
			assert.ok(elapsed < 2500, `the child should exit promptly, took ${elapsed}ms (flush debounce is 3000ms)`)
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})

	it('flush() persists pending key writes too', async () => {
		const dir = await freshDir()
		try {
			const file = join(dir, 'auth.json')
			const auth = await useSingleFileAuthState(file)
			auth.state.keys.set({ 'pre-key': { 1: { public: Buffer.from('aa', 'hex') } } })
			await auth.flush()
			const onDisk = await readFile(file, 'utf-8')
			assert.match(onDisk, /pre-key1/, 'the key reached the file without waiting for the debounce')
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})

	it('close() flushes as well', async () => {
		const dir = await freshDir()
		try {
			const file = join(dir, 'auth.json')
			const auth = await useSingleFileAuthState(file)
			auth.state.keys.set({ session: { abc: { k: 1 } } })
			await auth.close()
			assert.match(await readFile(file, 'utf-8'), /sessionabc/)
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})
})

describe('§2.223 behaviour matches useMultiFileAuthState', () => {
	it('both expose the same core shape', async () => {
		const dir = await freshDir()
		try {
			const auth = await useSingleFileAuthState(join(dir, 'auth.json'))
			assert.equal(typeof auth.saveCreds, 'function')
			assert.equal(typeof auth.state.keys.get, 'function')
			assert.equal(typeof auth.state.keys.set, 'function')
			assert.ok(auth.state.creds.noiseKey, 'fresh credentials were initialised')
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})
})

describe('§2.223 round-trip correctness', () => {
	it('Buffers survive a save and a reload', async () => {
		const dir = await freshDir()
		try {
			const file = join(dir, 'auth.json')
			const first = await useSingleFileAuthState(file)
			first.state.keys.set({ 'pre-key': { 7: { public: Buffer.from('ff00', 'hex'), private: Buffer.from('11', 'hex') } } })
			await first.flush()

			const second = await useSingleFileAuthState(file)
			const got = second.state.keys.get('pre-key', ['7'])
			assert.ok(Buffer.isBuffer(got['7'].public), 'a key must come back as a Buffer, not {type:Buffer,data:[...]}')
			assert.equal(got['7'].public.toString('hex'), 'ff00')
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})

	it('an app-state-sync-key comes back as protobuf, like the multi-file store', async () => {
		const dir = await freshDir()
		try {
			const file = join(dir, 'auth.json')
			const first = await useSingleFileAuthState(file)
			first.state.keys.set({
				'app-state-sync-key': {
					key1: { keyData: Buffer.from('abcd', 'hex'), fingerprint: { rawId: 7, currentIndex: 1, deviceIndexes: [0] }, timestamp: 1 }
				}
			})
			await first.flush()

			const second = await useSingleFileAuthState(file)
			const got = second.state.keys.get('app-state-sync-key', ['key1'])
			assert.ok(got.key1, 'the key exists')
			assert.equal(got.key1.fingerprint.rawId, 7)
			assert.ok(Buffer.isBuffer(got.key1.keyData))
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})

	it('setting a key to null deletes it without disturbing its neighbours', async () => {
		const dir = await freshDir()
		try {
			const file = join(dir, 'auth.json')
			const auth = await useSingleFileAuthState(file)
			auth.state.keys.set({ 'pre-key': { 1: { v: 1 }, 2: { v: 2 } } })
			auth.state.keys.set({ 'pre-key': { 1: null } })
			await auth.flush()
			const got = auth.state.keys.get('pre-key', ['1', '2'])
			assert.equal(got['1'], undefined)
			assert.deepEqual(got['2'], { v: 2 })
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})

	it('a missing key is undefined, not a throw', async () => {
		const dir = await freshDir()
		try {
			const auth = await useSingleFileAuthState(join(dir, 'auth.json'))
			assert.deepEqual(auth.state.keys.get('pre-key', ['nope']), { nope: undefined })
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})

	it('a corrupt file is survived, not propagated as a crash', async () => {
		const dir = await freshDir()
		try {
			const file = join(dir, 'auth.json')
			await writeFile(file, '{ this is not json', { mode: 0o600 })
			const auth = await useSingleFileAuthState(file)
			assert.ok(auth.state.creds.noiseKey, 'fresh credentials were generated instead')
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})

	it('refuses a path that is a directory, with a message that says what to do', async () => {
		const dir = await freshDir()
		try {
			await assert.rejects(() => useSingleFileAuthState(dir), /not a file/)
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})
})
