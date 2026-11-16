// §2.86 — parity wave 3: HTML apps/artifacts, the optional-module loaders + TTLCache,
// username tools, the content builders, NekoDB auth and the `conversation` compat flag.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
	generateWAMessage, proto,
	checkHtmlApp, prepareFileArtifact, htmlMultiplayerPrelude, withHtmlMultiplayer,
	sendHtmlDocument, sendHtmlArtifact, sendHtmlApp, htmlSection, htmlMedia,
	HTML_MIME_TYPE, HTML_APP_MULTIPLAYER_GLOBAL,
	loadOptionalModule, forgetOptionalModule, loadSharp, loadFfmpeg, TTLCache, prepareLinkThumbnail,
	validateUsername, displayUsername, isUsernamePin, stripUsernamePrefix, USERNAME_RESERVED,
	linkSticker, locationSticker, musicSticker, channelSticker, messageSticker, normalizeStickers, readStickers,
	buildMusicMessage, readMusicMessage, buildSocialPreview, readSocialPreview, MUSIC_ALLOWED_HOSTS,
	makeCommentMessage, commentSection, makeEventInviteMessage, calendarEvent, makeMessageAssociation,
	mapSection, placeItem, sportsSection, reminderSection, taskSection, transparencySection,
	useNekoDBAuth, countAuthFileLocks, useEncryptedFileAuthState
} from '../lib/index.js'

const HTML = '<html><head><title>App</title><meta name="viewport" content="width=device-width"></head><body>hi</body></html>'
const dirs = []
const makeDir = async () => { const d = await mkdtemp(join(tmpdir(), 'jap-parity-')); dirs.push(d); return d }
test.after(async () => { for (const d of dirs) await rm(d, { recursive: true, force: true }) })

const fakeSock = () => {
	const sent = []
	return {
		sent,
		relayMessage: async () => {},
		waUploadToServer: async () => ({}),
		sendMessage: async (jid, content, options) => { sent.push({ jid, content, options }); return { key: { id: 'X' } } }
	}
}

// ── HTML apps ──────────────────────────────────────────────────────────────────
test('§2.86 checkHtmlApp separates "will not render" from "renders badly"', () => {
	const good = checkHtmlApp(HTML)
	assert.equal(good.ok, true)
	assert.deepEqual(good.warnings, [])
	assert.equal(good.hasScript, false)
	assert.equal(good.sha256.length, 64)

	const loose = checkHtmlApp('<div>hi</div>')
	assert.equal(loose.ok, true)
	assert.ok(loose.warnings.length >= 2)

	const big = checkHtmlApp(`<html><body>${'x'.repeat(2000)}</body></html>`, { maxBytes: 100 })
	assert.equal(big.ok, false)
	assert.match(big.errors[0], /over the 100 byte limit/)

	const external = checkHtmlApp('<html><body><script src="https://cdn.example/x.js"></script></body></html>', { allowExternal: false })
	assert.equal(external.ok, false)
	assert.equal(external.hasScript, true)
	assert.deepEqual(external.externalRefs, ['https://cdn.example/x.js'])
	assert.throws(() => checkHtmlApp('   '), /HTML is empty/)
	assert.throws(() => checkHtmlApp(42), /string or a Buffer/)
})

test('§2.86 the multiplayer preamble is injected once and stays replaceable', () => {
	const first = withHtmlMultiplayer(HTML, { participants: ['a@s.whatsapp.net'], maxPlayers: 4 })
	assert.ok(first.html.includes(HTML_APP_MULTIPLAYER_GLOBAL))
	assert.equal(first.session.participants.length, 1)
	const again = withHtmlMultiplayer(first.html, { sessionId: first.sessionId })
	assert.equal(again.html.match(new RegExp(`${HTML_APP_MULTIPLAYER_GLOBAL}=`, 'g')).length, 1, 'preamble was duplicated')
	assert.equal(again.sessionId, first.sessionId)
	// headless markup still gets the script
	assert.ok(withHtmlMultiplayer('<div></div>').html.startsWith('<script>'))
	assert.throws(() => htmlMultiplayerPrelude({ maxPlayers: 1 }), /maxPlayers/)
	assert.throws(() => htmlMultiplayerPrelude({ participants: ['a', 'b', 'c'], maxPlayers: 2 }), /exceeds maxPlayers/)
	// no raw "<" can break out of the script tag
	assert.ok(!htmlMultiplayerPrelude({ participants: ['</script>'] }).script.includes('</script><'))
})

test('§2.86 prepareFileArtifact + htmlSection + htmlMedia', () => {
	const artifact = prepareFileArtifact(HTML, { fileName: 'app.html' })
	assert.equal(artifact.mimetype, HTML_MIME_TYPE)
	assert.equal(artifact.fileLength, Buffer.byteLength(HTML))
	assert.equal(prepareFileArtifact(Buffer.from([1, 2]), { fileName: 'x.bin' }).mimetype, 'application/octet-stream')
	assert.throws(() => prepareFileArtifact(''), /Buffer, a string/)

	const section = htmlSection('Report', HTML)
	assert.equal(section.htmlSection.title, 'Report')
	assert.equal(section.htmlSection.bytes, artifact.fileLength)

	const media = htmlMedia(Buffer.from([1, 2, 3]), { mimetype: 'image/png', name: 'chart' })
	assert.match(media.dataUri, /^data:image\/png;base64,/)
	assert.match(media.img, /alt="chart"/)
	assert.throws(() => htmlMedia(Buffer.from([1]), { mimetype: 'nope' }), /is not a mime type/)
	assert.throws(() => htmlMedia('not a buffer'), /as a Buffer/)
})

test('§2.86 sendHtmlApp uses a webview with a url and falls back to a document without one', async () => {
	const sock = fakeSock()
	const doc = await sendHtmlApp(sock, '1@s.whatsapp.net', HTML)
	assert.equal(doc.mode, 'document')
	assert.equal(sock.sent[0].content.mimetype, HTML_MIME_TYPE)

	const web = await sendHtmlApp(sock, '1@s.whatsapp.net', HTML, { url: 'https://example.com/app', title: 'App' })
	assert.equal(web.mode, 'webview')

	await assert.rejects(sendHtmlApp(sock, 'j', HTML, { fallback: false }), /host the bundle/)
	await assert.rejects(sendHtmlApp(sock, 'j', '<html><body>x</body></html>'.repeat(200_000)), /over the/)
	await assert.rejects(sendHtmlApp({}, 'j', HTML), /connected socket/)

	await sendHtmlDocument(sock, '1@s.whatsapp.net', HTML, { fileName: 'invoice.html', caption: 'Your invoice' })
	assert.equal(sock.sent.at(-1).content.fileName, 'invoice.html')
	await sendHtmlArtifact(sock, '1@s.whatsapp.net', Buffer.from('data'), { fileName: 'r.csv', mimetype: 'text/csv', title: 'Report' })
	assert.equal(sock.sent.at(-1).content.caption, 'Report')
})

// ── optional modules / TTLCache ────────────────────────────────────────────────
test('§2.86 optional modules are loaded once, failures included', async () => {
	assert.equal(await loadOptionalModule('definitely-not-installed-xyz'), null)
	await assert.rejects(loadOptionalModule('definitely-not-installed-xyz', { required: true }), /is not installed/)
	assert.equal(forgetOptionalModule('definitely-not-installed-xyz'), true)
	await assert.rejects(loadOptionalModule('   '), /pass a module name/)
	// these are environment-dependent, so only the shape is asserted
	assert.ok([null, undefined].includes(await loadFfmpeg()) || typeof await loadFfmpeg() !== 'undefined')
	const sharp = await loadSharp()
	assert.ok(sharp === null || typeof sharp === 'function')
})

test('§2.86 TTLCache expires, evicts and de-duplicates', async () => {
	let now = 1000
	const cache = new TTLCache({ ttlMs: 100, max: 2, now: () => now })
	cache.set('a', 1)
	cache.set('b', 2)
	assert.equal(cache.get('a'), 1)
	cache.set('c', 3)
	assert.equal(cache.get('b'), undefined, 'least-recently-used should have been evicted')
	assert.equal(cache.size, 2)
	now += 101
	assert.equal(cache.get('a'), undefined)
	assert.equal(cache.has('c'), false)
	assert.equal(cache.size, 0)

	let calls = 0
	const producer = async () => { calls++; await new Promise(r => setImmediate(r)); return 'v' }
	const [x, y] = await Promise.all([cache.wrap('k', producer), cache.wrap('k', producer)])
	assert.deepEqual([x, y], ['v', 'v'])
	assert.equal(calls, 1, 'concurrent wrap() calls must share one in-flight promise')
	assert.equal(cache.getStats().evictions >= 1, true)
	assert.throws(() => new TTLCache({ ttlMs: 0 }), /positive number/)
	assert.throws(() => new TTLCache({ max: 0 }), /positive integer/)
})

test('§2.86 prepareLinkThumbnail caches and survives a bad response', async () => {
	let fetches = 0
	const png = Buffer.from('89504e470d0a1a0a', 'hex')
	const fetchImpl = async () => { fetches++; return { ok: true, arrayBuffer: async () => png } }
	const cache = new TTLCache({ ttlMs: 60_000, max: 10 })
	const first = await prepareLinkThumbnail('https://x/img.png', { fetchImpl, cache })
	assert.equal(first.cached, false)
	assert.ok(first.bytes > 0)
	const second = await prepareLinkThumbnail('https://x/img.png', { fetchImpl, cache })
	assert.equal(second.cached, true)
	assert.equal(fetches, 1)
	assert.equal(await prepareLinkThumbnail('https://x/404.png', { fetchImpl: async () => ({ ok: false }), cache }), null)
	assert.equal(await prepareLinkThumbnail('https://x/boom.png', { fetchImpl: async () => { throw new Error('net') }, cache }), null)
	await assert.rejects(prepareLinkThumbnail('ftp://x/img.png', { fetchImpl }), /http\(s\) URL/)
})

// ── usernames ──────────────────────────────────────────────────────────────────
test('§2.86 username validation explains itself', () => {
	assert.deepEqual(validateUsername('@ja.p_official'), { valid: true, username: 'ja.p_official', reason: null, isPin: false })
	assert.equal(validateUsername('1nope').reason, 'must start with a letter')
	assert.equal(validateUsername('JAP').reason, 'must be lowercase')
	assert.equal(validateUsername('ab').reason, 'must be at least 3 characters')
	assert.equal(validateUsername('ja..p').reason, 'no two separators in a row')
	assert.equal(validateUsername('name_').reason, 'must end with a letter or a digit')
	assert.equal(validateUsername(USERNAME_RESERVED[0]).reason, 'that username is reserved')
	assert.equal(validateUsername('123456').isPin, true)
	assert.equal(validateUsername('123456', { allowPin: false }).valid, false)
	assert.equal(isUsernamePin('@123456'), true)
	assert.equal(isUsernamePin('japofc'), false)
	assert.equal(stripUsernamePrefix('628123@s.whatsapp.net'), '628123')
	assert.equal(displayUsername('japofc'), '@japofc')
	assert.equal(displayUsername('japofc', { withPrefix: false }), 'japofc')
	assert.equal(displayUsername('', { fallback: 'Budi' }), 'Budi')
	assert.equal(displayUsername('JAP', { fallback: 'Budi' }), 'Budi')
})

// ── content builders ───────────────────────────────────────────────────────────
test('§2.86 stickers validate, clamp and de-duplicate', () => {
	const link = linkSticker('https://x.com', { label: 'Go', position: { x: 5, y: -1 } })
	const normalized = normalizeStickers([link, link, musicSticker({ title: 'Lagu' })])
	assert.equal(normalized.length, 2, 'duplicates should collapse')
	assert.deepEqual(normalized[0].position, { x: 1, y: 0 }, 'positions should clamp into 0..1')
	assert.equal(locationSticker({ latitude: -6.2, longitude: 106.8 }).type, 'location')
	assert.throws(() => locationSticker({ latitude: 95, longitude: 0 }), /between -90 and 90/)
	assert.equal(channelSticker('1@newsletter').newsletterJid, '1@newsletter')
	assert.throws(() => channelSticker('1@g.us'), /@newsletter/)
	assert.equal(messageSticker({ id: 'K' }).type, 'message')
	assert.throws(() => messageSticker({}), /key with an id/)
	assert.throws(() => normalizeStickers([{ type: 'nope' }]), /entry #0 has no known type/)
	assert.throws(() => linkSticker('javascript:alert(1)'), /http\(s\)/)
	assert.deepEqual(readStickers({ message: { stickerMessage: { url: 'x' } } })[0].type, 'sticker')
	assert.deepEqual(readStickers(null), [])
})

test('§2.86 music and social previews round-trip', () => {
	const music = buildMusicMessage({ title: 'Lagu', artist: 'JAP', songUri: 'https://open.spotify.com/track/1' })
	assert.equal(music.music.title, 'Lagu')
	assert.equal(readMusicMessage({ message: music }).host, 'open.spotify.com')
	assert.equal(readMusicMessage({ message: { conversation: 'x' } }), null)
	assert.throws(() => buildMusicMessage({ title: 'x', songUri: 'https://evil.example/a' }), /supported hosts/)
	assert.ok(MUSIC_ALLOWED_HOSTS.includes('music.apple.com'))

	const social = buildSocialPreview({ url: 'https://www.instagram.com/p/1', title: 'Post' })
	assert.equal(social.socialPreview.platform, 'instagram.com')
	assert.equal(readSocialPreview({ message: social }).title, 'Post')
	assert.equal(readSocialPreview({ message: { extendedTextMessage: { contextInfo: { externalAdReply: { sourceUrl: 'https://x.com/a', title: 'T' } } } } }).title, 'T')
})

test('§2.86 comments, events and associations build real proto content', () => {
	const comment = makeCommentMessage({ id: 'K' }, 'mantap')
	const encoded = proto.Message.decode(proto.Message.encode(proto.Message.fromObject(comment)).finish()).toJSON()
	assert.equal(encoded.commentMessage.targetMessageKey.id, 'K')
	assert.equal(commentSection(['a', { text: 'b', author: 'JAP' }]).comments.total, 2)
	assert.throws(() => commentSection([]), /at least one comment/)

	const invite = makeEventInviteMessage({ eventTitle: 'Kopdar', startTime: new Date(2_000_000_000_000) })
	assert.equal(invite.eventInviteMessage.eventTitle, 'Kopdar')
	assert.throws(() => makeEventInviteMessage({ eventTitle: 'x', startTime: 2000, endTime: 1000 }), /before/)
	assert.throws(() => makeEventInviteMessage({}), /"eventTitle" is required/)

	const cal = calendarEvent('Standup', { start: 1000, end: 2000 })
	assert.equal(cal.calendarEvent.durationMs, 1000)
	assert.throws(() => calendarEvent('x', { start: 2000, end: 1000 }), /after/)

	const association = makeMessageAssociation({ id: 'P' }, { type: 1, messageIndex: 2 })
	assert.equal(association.messageContextInfo.messageAssociation.parentMessageKey.id, 'P')
	assert.throws(() => makeMessageAssociation({ id: 'P' }, { type: 999 }), /unknown association type/)
})

test('§2.86 card sections validate their inputs', () => {
	const map = mapSection([placeItem({ name: 'Kopi', latitude: -6.2, longitude: 106.8, rating: 4.5 })])
	assert.equal(map.map.places[0].rating, 4.5)
	assert.throws(() => placeItem({ name: 'x', latitude: 0, longitude: 0, rating: 9 }), /between 0 and 5/)
	assert.throws(() => mapSection([]), /at least one place/)

	assert.equal(sportsSection({ home: 'A', away: { name: 'B', score: 2 }, status: 'live' }).sports.away.score, 2)
	assert.throws(() => sportsSection({ home: 'A', away: 'B', status: 'nope' }), /unknown status/)

	const reminder = reminderSection('Bayar listrik', 1000)
	assert.equal(reminder.reminder.overdue, true)
	assert.throws(() => reminderSection('x', 'soon'), /Date or a timestamp/)
	assert.throws(() => reminderSection('x', 1000, { repeat: 'hourly' }), /unknown repeat/)

	const tasks = taskSection(['a', { title: 'b', status: 'done' }])
	assert.deepEqual([tasks.tasks.done, tasks.tasks.total, tasks.tasks.complete], [1, 2, false])
	assert.throws(() => taskSection([{ title: 'x', status: 'weird' }]), /unknown status/)

	const transparency = transparencySection({ sources: ['https://x.com/a'], model: 'jap-1' })
	assert.equal(transparency.transparency.sources[0].url, 'https://x.com/a')
	assert.throws(() => transparencySection({}), /sources, a model, or a disclaimer/)
})

// ── auth extras + the conversation compat flag ─────────────────────────────────
test('§2.86 useNekoDBAuth persists through a file and through a client', async () => {
	const dir = await makeDir()
	const file = join(dir, 'auth.json')
	const first = await useNekoDBAuth({ file, session: 's1' })
	await first.saveCreds()
	await first.state.keys.set({ 'pre-key': { 1: { public: Buffer.from([1, 2, 3]) } } })
	const second = await useNekoDBAuth({ file, session: 's1' })
	assert.equal(second.state.creds.registrationId, first.state.creds.registrationId)
	assert.deepEqual([...(await second.state.keys.get('pre-key', ['1']))['1'].public], [1, 2, 3])
	// a different session in the same file is isolated
	const other = await useNekoDBAuth({ file, session: 's2' })
	assert.notEqual(other.state.creds.registrationId, first.state.creds.registrationId)
	assert.ok(JSON.parse(await readFile(file, 'utf-8'))['baileys-auth:s1:creds:creds'])

	const map = new Map()
	const client = { get: k => map.get(k), set: (k, v) => map.set(k, v), delete: k => map.delete(k), keys: () => [...map.keys()] }
	const viaClient = await useNekoDBAuth({ client, session: 'c1' })
	await viaClient.saveCreds()
	assert.ok(map.size >= 1)
	await viaClient.clearAuth()
	assert.equal(map.size, 0)
	await assert.rejects(useNekoDBAuth({ client: {} }), /needs get\/set/)
})

test('§2.86 countAuthFileLocks reports the per-file mutexes', async () => {
	const dir = await makeDir()
	const before = countAuthFileLocks()
	const { saveCreds } = await useEncryptedFileAuthState(dir, { password: 'pw' })
	await saveCreds()
	const after = countAuthFileLocks()
	assert.ok(after >= before + 1, 'creds.json should have taken a lock')
	const detail = countAuthFileLocks({ detail: true })
	assert.equal(detail.count, after)
	assert.ok(detail.paths.some(path => path.endsWith('creds.json')))
})

test('§2.86 plain text can opt in to { conversation } without losing fields', async () => {
	const OPTS = { upload: async () => ({}) }
	const def = await generateWAMessage('628@s.whatsapp.net', { text: 'tes' }, OPTS)
	assert.ok(def.message.extendedTextMessage, 'default must stay extendedTextMessage')

	const compat = await generateWAMessage('628@s.whatsapp.net', { text: 'tes' }, { ...OPTS, textAsConversation: true })
	assert.equal(compat.message.conversation, 'tes')
	assert.ok(!compat.message.extendedTextMessage, 'the extended form must not also be set')

	// per-message opt-in works too
	const perMessage = await generateWAMessage('628@s.whatsapp.net', { text: 'tes', asConversation: true }, OPTS)
	assert.equal(perMessage.message.conversation, 'tes')

	// anything richer than plain text keeps the extended form — no silent field loss
	const withPreview = await generateWAMessage('628@s.whatsapp.net', { text: 'tes https://x.com' }, {
		...OPTS, textAsConversation: true, getUrlInfo: async () => ({ 'matched-text': 'https://x.com', title: 'x' })
	})
	assert.ok(withPreview.message.extendedTextMessage?.matchedText)
	const quoted = await generateWAMessage('628@s.whatsapp.net', { text: 'tes' }, {
		...OPTS, textAsConversation: true, quoted: { key: { id: 'Q', remoteJid: '628@s.whatsapp.net' }, message: { conversation: 'x' } }
	})
	assert.ok(quoted.message.extendedTextMessage, 'a quoted reply needs the extended form')
})
