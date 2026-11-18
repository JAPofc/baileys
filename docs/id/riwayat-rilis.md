# Riwayat rilis (arsip)

[← kembali ke README](../../README.id.md)

## 🆕 Baru di v2.4.5

Helper baru di rilis ini. Semua diekspor dari root paket dan sudah bertipe lengkap.

### 🗳️ Poll manager — lacak siapa memilih apa (`createPollManager`)

`getAggregateVotesInPollMessage` itu stateless dan menghitung ganda pemilih yang berubah pikiran (WhatsApp mengirim ulang *seluruh* pilihan pemilih tiap ada perubahan). `createPollManager` menyimpan state itu — tiap pemilih dihitung sekali, pilihan terakhir yang menang:

```js
import { createPollManager } from '@japofc/baileys'

const polls = createPollManager()
const sent = await sock.sendMessage(jid, { poll: { name: 'Makan apa?', values: ['Pizza', 'Sushi'], selectableCount: 1 } })
polls.register(sent) // ingat opsi + key

// beri vote yang sudah didekripsi (nama opsi, hash sha256 hex, atau Buffer hash mentah dari WA):
polls.applyVote(sent.key.id, voterJid, ['Pizza'])

polls.tally(sent.key.id)   // [{ name:'Pizza', count, voters:[] }, ...]
polls.winner(sent.key.id)  // { winners:['Pizza'], count } (sadar seri)
console.log(polls.render(sent.key.id)) // bar chart langsung
```

### ❤️‍🩹 Monitor kesehatan sesi (`createSessionHealthMonitor`)

Mendeteksi ledakan pesan yang gagal didekripsi (sesi Signal mati / Bad-MAC drift) per kontak lalu memberi peringatan — murni observasi, tidak pernah melempar error ke event loop:

```js
import { createSessionHealthMonitor } from '@japofc/baileys'

const health = createSessionHealthMonitor({ badMacThreshold: 3, windowMs: 60_000 })
health.bind(sock)
health.onUnhealthy(({ jid, failures }) => console.warn(`sesi ${jid} bermasalah (${failures} gagal dekripsi)`))
health.onRecover(({ jid }) => console.log(`${jid} pulih`))
```

Dilengkapi `canonicalizeJid()` dan `makeJidCanonicalizer(sock)` untuk menyatukan identitas kontak lintas pemisahan PN/LID.

### 🔁 Anti-duplikat pesan / idempotensi (`createMessageDedupe`)

Mencegah balasan dobel saat WhatsApp mengirim ulang pesan (reconnect, history sync, placeholder resend, retry):

```js
import { createMessageDedupe } from '@japofc/baileys'

const dedupe = createMessageDedupe({ maxSize: 5000 }) // opsional ttlMs
sock.ev.on('messages.upsert', ({ messages }) => {
  for (const m of messages) {
    if (dedupe.seen(m.key)) continue // sudah ditangani → lewati
    // ...tangani tepat sekali
  }
})
```

### 🔗 Helper LID ↔ PN di socket

Helper pemetaan kini jadi method socket kelas satu (tak perlu lagi menyentuh `signalRepository`):

```js
await sock.getLIDForPN('62812…@s.whatsapp.net') // → '…@lid' | null
await sock.getPNForLID('123…@lid')              // → '…@s.whatsapp.net' | null
await sock.getLIDsForPNs([...])                  // batch
await sock.getPNsForLIDs([...])                  // batch
await sock.storeLIDPNMappings([{ lid, pn }])     // isi cache
```

### 🧩 Helper toolkit kecil

Sepuluh helper murni & bertipe, diekspor dari root:

```js
import { partition, zip, formatCountdown, wordCount, ellipsisMiddle,
         jidType, randomString, isNumeric, firstEmoji, maskJid } from '@japofc/baileys'

partition([1, 2, 3, 4], n => n % 2 === 0) // [[2,4],[1,3]]
zip([1, 2], ['a', 'b'])                    // [[1,'a'],[2,'b']]
formatCountdown(90_061_000)                // '1d 01:01:01'
ellipsisMiddle('abcdefgh', 5)             // 'ab…gh'
jidType('123@g.us')                        // 'group'
maskJid('628123456789@s.whatsapp.net')     // '628******89@s.whatsapp.net'
```

---

## 🆕 Baru di v2.4.8 — ringkasan rilis

**37 bug nyata diperbaiki · 58 penambahan · 1804 tes hijau · `tsc --strict` bersih · 1299 export.**

Setiap perbaikan di bawah berawal dari skrip reproduksi di `scripts/` dan dikunci oleh test
regresi; setiap penambahan dibangun di atas protobuf asli, bukan stub. Detail lengkap:
[`CHANGELOG.md`](../../CHANGELOG.md) dan [`BUGREPORT.md`](../../BUGREPORT.md) §2.44–§2.97.

**Perbaikan yang paling berdampak**

| Yang rusak | Kenapa menyakitkan |
|---|---|
| Kirim grup gagal tapi "semua device sudah punya sender key" terlanjur dipersist **sebelum** stanza terkirim | retry tidak mendistribusikan apa pun — seluruh grup melihat *waiting for this message* sampai key rotasi |
| Read receipt mengirim id `null` dan duplikat | WhatsApp membuang seluruh receipt, jadi id **valid** di stanza yang sama ikut tak ter-ack |
| Frame audio panggilan adalah jendela ke memori WASM hidup | konsumen yang tidak sinkron merekam audio belakangan, atau senyap |
| `creds.json` plaintext rusak/kosong dibaca sebagai "instalasi baru" | identitas baru dibuat dan `saveCreds()` berikutnya menimpa sesi asli |
| Logger non-pino membuat handshake Noise crash | `console`, bunyan/winston, pino v8, atau `{}` mati dengan `logger.child is not a function` |
| Pesan dengan pembungkus lebih dari 5 lapis tetap terbungkus | `getContentType()` menjawab nama wrapper dan bot melewatkan pesannya |
| Menerima undangan yang diteruskan ke grup mencatat **grup** sebagai pengundang | server diberi tahu `admin: <jid grup>` dan stub join difilekan ke sana |
| `cachedGroupMetadata` basi membuat grup PN mengaku LID | semua pesan ke grup itu dialamatkan dengan cara yang salah |
| Timestamp tc-token tak terbaca berarti "jangan pernah refresh" | kontak itu diam-diam berhenti mendapat privacy token |
| Cache ikon undangan grup ada tapi tak pernah dipakai | 5 undangan = 5 query foto profil (dan 404 gagal tiap kali untuk grup tanpa ikon) |

**Penambahan besar**

- **Album** (`sendAlbumMessage`), **Newsletter Status API** (posting/react/revoke/fetch sebagai channel), helper **status & story**, **pesan terjadwal** (+ conditional reveal), **poll & kuis**, **uang & split payment**, **HTML app**, sisa **A2UI / AI-rich**, **verifikasi tanda tangan bot**, **VoIP** (`makeVoipClient`, `VideoFeeder`, `bindVoiceRecognition`, `call.audioStream()`).
- **Kenyamanan**: logger apa pun lewat `ensureLogger()`, pino jadi opsional, `MessageBuilder.bind(sock)`, definisi native-flow yang bisa di-refresh, `TTLCache`, perkakas JID ketat, blokir read-receipt, dan banner startup akhirnya bisa dimatikan (`printBanner: false` / `JAP_NO_BANNER`).

## 🆕 Baru di v2.4.6

Rilis v2.4.6 menambah banyak hal yang belum pernah tercatat di file ini. Berikut semuanya,
dikelompokkan. Semua diekspor dari root paket dan sudah bertipe.

### ✨ AIRich — stack, primitive mentah, kartu profil

`addHStack(...)` / `addVStack(...)` menata primitive berdampingan atau bertumpuk (ala
SwiftUI), dan `addProfileCard(profile)` merender kartu avatar + nama + subjudul:

```js
import { AIRich } from '@japofc/baileys' // RichAI adalah kelas yang sama, dengan nama brand

await new AIRich(sock)
    .addHStack(['**Hari ini**', '12 order', 'Rp 1,4jt'])
    .addProfileCard({ username: 'tokojap', full_name: 'Toko JAP', subtitle: 'Toko online', picture_url: 'https://…/logo.jpg', is_verified: true })
    .send(jid)
```

Meta terus merilis primitive unified-response baru, jadi ada dua pintu darurat untuk yang
belum punya helper:

```js
// view_model apa pun lewat nama — prefix GenAI ditambahkan otomatis
rich.addViewModel('HStackLayoutViewModel', ['**kiri**', '**kanan**'], { fallback: 'kiri / kanan' })
// satu primitive saja, dibungkus SingleLayoutViewModel
rich.addRawPrimitive('SomeBrandNewUXPrimitive', { title: 'hai' })
```

`META_RICH_PREFIX` (`'GenAI'`) ikut diekspor bila kamu mau menyusun namanya sendiri.

### 🚨 Melihat kegagalan dekripsi tanpa mengorek log

Sesi Signal yang mati dulu hanya terlihat sebagai banjir log. Sekarang jadi event, dan
banjir lognya dibatasi secara default:

```js
sock.ev.on('messages.decrypt-failed', ({ key, error, willRetry }) => {
    if (!willRetry) metrics.increment('decrypt.dead', { jid: key.remoteJid })
})
```

Proteksi banjir log **aktif secara default** (`decryptFailureLog: { windowMs: 60000, maxPerWindow: 5 }`);
beri `decryptFailureLog: false` pada socket untuk log tanpa batas, atau buat pembatas
sendiri dengan `createDecryptFailureTracker({ windowMs, maxPerWindow, max })` — `hit(key)`
mengembalikan `{ log, occurrences, suppressedSincePrevWindow }`, jadi kamu mencatat hanya
saat `log` bernilai true dan tetap bisa melaporkan berapa yang ditelan.

### 🤖 Bot framework — command router, broadcaster, scheduler

`CommandRouter` adalah dispatcher dengan prefix, alias, argumen terurai, cooldown per user,
gerbang owner/admin/grup, dan help otomatis:

```js
import { CommandRouter, createGroupAdminResolver } from '@japofc/baileys'

const router = new CommandRouter({
    prefixes: ['.', '!'],
    ownerJids: ['628111@s.whatsapp.net'],
    isAdmin: createGroupAdminResolver(sock)
})

router.command({
    name: 'kick', aliases: ['remove'], category: 'Grup',
    groupOnly: true, adminOnly: true, botAdmin: true, cooldownMs: 3000,
    handler: async ctx => ctx.reply(`mengeluarkan ${ctx.args._[0]}`)
})

console.log(router.help())      // teks help terkelompok & terformat
await router.handle(ctx)        // { matched, executed, outcome, … }
```

`createBroadcaster({ send, throttleMs, maxRetries, onProgress })` menyebar satu pesan ke
banyak chat dengan tempo aman, lengkap dengan retry, progres, dan `cancel()`:

```js
const caster = createBroadcaster({ send: (jid, msg) => sock.sendMessage(jid, msg), throttleMs: 1500 })
const run = caster.broadcast(jids, { text: 'Promo hari ini!' })
const summary = await run.done  // { total, sent, failed, cancelled, results }
```

`createScheduler()` menjalankan sesuatu nanti tanpa membocorkan timer — `scheduleAt(date, fn)`,
`scheduleAfter(ms, fn)`, `cancel(id)`, `cancelAll()`, `list()`, `size`.

### 🔐 Link Mini App yang tidak bisa di-replay

Deep link kini bisa ditandatangani dan kedaluwarsa, dan request masuk bisa diverifikasi:

```js
const nonceStore = createNonceStore({ ttlMs: 10 * 60_000 })

const link = createMiniAppLink('https://app.example/order', { orderId: 42 }, {
    secret: process.env.MINIAPP_SECRET,
    expiresIn: 5 * 60_000,       // link mati setelah 5 menit
    audience: jid,               // hanya chat ini yang boleh membukanya
    nonce: nonceStore.issue()    // dan hanya sekali
})

// di sisi web kamu
const params = verifyMiniAppRequest(req.url, {
    secret: process.env.MINIAPP_SECRET, audience: jid, nonceStore
})
```

`createNonceStore({ ttlMs, max })` membuat tiap link bertanda tangan hanya sekali pakai,
jadi link yang diteruskan orang lain tak bisa dipakai ulang. `parseMiniAppParams` membaca
parameter tanpa verifikasi, untuk link yang kamu terbitkan tanpa tanda tangan.

### 🧰 Utilitas harian

```js
import {
    unstyleText, parseArgs, paginate, textTable,
    compactNumber, ordinal, formatIDR, detectCountry, countryFlagOf,
    mimeToExtension, extensionToMime, mediaKindFromMime, retryWithBackoff
} from '@japofc/baileys'

unstyleText('𝓙𝓸𝓱𝓷')                    // 'John' — Unicode gaya balik ke ASCII, supaya
                                        //  word filter & pencarianmu benar-benar cocok

parseArgs('ban @x --days 3 "dua kata"')  // { _: ['ban','@x','dua kata'], days: '3' }

paginate(items, { page: 2, perPage: 10 }) // { items, page, pages, hasPrev, hasNext, … }

console.log(textTable([['Item', 'Qty'], ['Kopi', '12']])) // tabel monospace rapi

compactNumber(1234567)  // '1.2M'
ordinal(23)             // '23rd'
formatIDR(15000)        // 'Rp15.000'

detectCountry('6281234567890') // { dialCode: '62', iso2: 'ID', name: 'Indonesia' }
countryFlagOf('6281234567890') // '🇮🇩'

mimeToExtension('image/webp')  // 'webp'
extensionToMime('mp3')         // 'audio/mpeg'
mediaKindFromMime('audio/ogg') // 'audio'
```

`retryWithBackoff(fn, { retries, signal })` kini bisa dibatalkan — signal membatalkan
sebelum percobaan pertama bila sudah abort, dan memotong jeda backoff di tengah jalan.

`createInviteTracker()` dapat total lintas chat: `getGlobalCount(inviter)` mengembalikan
`{ total, active }` dari semua grup terlacak dan `getGlobalLeaderboard(limit)` memeringkat
pengundang secara global — jadi "siapa paling banyak mengajak orang" berlaku untuk bot di
banyak grup.

### 📞 VoIP — jembatan audio WhatsApp ⇆ RTP/SIP

`createCallBridge()` menyatukan codec G.711, packetizer RTP, dan jitter buffer menjadi satu
objek yang tidak terikat transport, jadi panggilan WhatsApp bisa disambung ke kaki SIP/PBX:

```js
const bridge = createCallBridge({
    codec: 'pcmu',
    onRtp: (rtp) => sipSocket.send(rtp),            // WA → SIP
    onPcm: (pcm) => waCall.sendAudio(pcm)           // SIP → WA
})

bridge.sendAudio(pcmDariWhatsApp)   // transcode + memancarkan paket RTP
bridge.receiveRtp(paketDariSip)     // dibuffer agar urutannya benar
bridge.drainAudio()                 // mendekode yang siap, memanggil onPcm
bridge.stats()                      // codec, ssrc, jumlah frame, statistik jitter
```

Komponennya juga diekspor terpisah: `encodeMulaw`/`encodeAlaw` (+ decoder),
`createRtpPacketizer`, `createJitterBuffer`, `rtpSequenceNext`/`rtpTimestampNext`, dan
helper PCM.

### 🎨 Banner startup

Banner memilih tema dan tagline baru tiap kali dijalankan. Kunci satu tema dengan
`JAP_BANNER_THEME=leaf|ocean|sunset|violet|aurora|ember` (atau `=daily` untuk rotasi harian).
Warna mengikuti konvensi umum dan dibaca saat pemanggilan: `NO_COLOR` / `FORCE_COLOR=0`
mematikan warna (banner tetap tampil), `FORCE_COLOR=1|2|3` memaksa warna menyala meski
bukan TTY — berguna di CI dan dasbor pm2.

## 🗂️ Album, status channel, interaksi status & penjadwalan (v2.4.8)

```js
// Album — 2+ gambar/video jadi satu galeri (divalidasi di depan, jeda hanya ANTAR item)
await sock.sendAlbumMessage(jid, [{ image: { url: './1.jpg' } }, { video: { url: './2.mp4' } }], {
    caption: 'Dump akhir pekan',  // menempel di item pertama
    delayMs: 1500                 // jeda ANTAR item (tidak pernah setelah item terakhir)
})
await sock.sendAlbum(jid, medias)                       // sama, nama netral

// Siapa yang boleh lihat status — kontak, allowlist, atau semua kecuali beberapa
const audience = makeStatusAudienceMetadata({ contacts, except: ['628x@s.whatsapp.net'] })
// → { type: 'denylist', statusJidList, excluded, truncated, limit }
await sock.sendMessage('status@broadcast', { image }, { statusJidList: audience.statusJidList })

// Posting status SEBAGAI channel (di HP penerima tampil "dari <channel>")
await sock.sendNewsletterStatus('1234@newsletter', { image: { url: './promo.jpg' } }, {
    statusJidList: audience.statusJidList, newsletterName: 'JAP News'
})
await sock.fetchNewsletterStatus('1234@newsletter', { count: 20 })
// → [{ serverId, timestamp, views, reactions: [{ code, count }] }, …]
await sock.sendNewsletterAdminInvite(jid, { newsletterJid: '1234@newsletter', newsletterName: 'JAP News' })

// Interaksi status — reshare mention, jawab stiker pertanyaan, reaksi ke stiker
await sock.sendStatusReshare(statusMsg, { statusJidList: audience.statusJidList })
await sock.sendStatusQuestionAnswer(jid, statusMsg.key, 'Nasi goreng, jelas')
await sock.sendStatusStickerInteraction(jid, statusMsg.key, stickerKey)

// Pesan terjadwal — encode/decode amplopnya, atau biarkan socket yang pegang timer-nya
const handle = sock.scheduleMessage(jid, { text: 'Selamat tahun baru!' }, { at: new Date('2027-01-01T00:00:00Z') })
handle.scheduleId; handle.scheduledAt; handle.status   // 'pending' → 'sent' | 'cancelled'
handle.cancel()                                        // true kalau belum sempat terkirim
await sock.unscheduleMessage(jid, key, { scheduleId }) // minta sisi lain membatalkannya
const { content } = encodeScheduledMessage({ text: 'nanti' }, { at: Date.now() + 60_000 })
decodeScheduledMessage(content)                        // { scheduleId, scheduledAt, isDue(), content }
```

Semua potongannya juga diekspor lepas — `makeStatusAudienceMetadata`,
`makeStatusMentionMessage`, `makeStatusQuestionAnswerMessage`,
`makeStatusStickerInteractionMessage`, `STATUS_AUDIENCE_*`; `withNewsletterStatusAttribution`,
`buildNewsletterStatusNode`, `makeNewsletterAdminInviteMessage`, `makeNewsletterStatusSender`,
`makeNewsletterStatusFetcher`; `encodeScheduledMessage`, `decodeScheduledMessage`,
`buildUnscheduleProtocolMessage`, `SCHEDULED_MSG_*` — jadi payload bisa dibuat di satu proses
dan dikirim di proses lain.

### A2UI / Bloks secara deklaratif

```js
import { a2uiSurface, a2uiCard, a2uiColumn, a2uiRow, a2uiText, a2uiButton,
         bloksWidget, embeddedScreen, sendA2UI } from '@japofc/baileys'

const surface = a2uiSurface([
    a2uiCard(a2uiColumn([
        a2uiText('Order #1234', { variant: 'title' }),
        a2uiText('Sedang diantar')
    ])),
    a2uiRow([a2uiButton(a2uiText('Lacak'), { action: { name: 'cta_url', url: 'https://…' } })])
])

await sendA2UI(sock, jid, surface)       // kirim
bloksWidget(surface)                     // atau cuma payload { uuid, data, type }
embeddedScreen(surface, { title: 'Checkout' })   // surface embedded layar penuh
```

Builder `A2UI` imperatif dan `sendA2UIWidget()` tidak berubah — helper ini menghasilkan format
wire yang persis sama, jadi dua gaya itu bisa dicampur bebas.

### Ekstra AI rich

```js
import { chainOfThoughtSection, decodeAIRich, forwardRichResponse,
         AI_RICH_RESPONSE_TYPE_STANDARD, AI_RICH_SUBMESSAGE_TYPE } from '@japofc/baileys'

await jap(sock, { ...chainOfThoughtSection(['cari dulu', 'cek dokumentasi']),
                  markdown: '# Jawaban\nIya.' }).send(jid)

decodeAIRich(msg)                        // blok terstruktur (alias readRichMessage)
await forwardRichResponse(sock, jidLain, msg)    // teruskan kartunya utuh
```

`MessageBuilder` / `MB` adalah alias hub builder `JapBaileys`, untuk kode yang ditulis dengan
penamaan itu.

## 🧾 Paritas poll, uang, status & penjadwalan (v2.4.8)

```js
// Poll & kuis
getPollOptionHash('Nasi goreng', 'hex')          // bucket tempat vote diakumulasi
makePollAddOptionMessage(pollMsg, ['Soto'])      // → { values, optionHashes, content } untuk dikirim ulang
makeQuestionMessage('Pilih', { answers: ['a', 'b'], allowMultiple: true })
makeQuestionReplyMessage(questionKey, 'baik')
makeQuestionResponseMessage(questionKey, 1, { answers: ['a', 'b'] })
quizQuestion('Ibukota Indonesia?', ['Bandung', 'Jakarta'], { correct: 1 })
quizSection('Geografi', [q1, q2]); sideBySideSurveyItem('Kopi atau teh?', 'Kopi', 'Teh')

// Uang — bilangan bulat + offset, bukan float
money(25.5, 'USD')              // { value: 25500, offset: 1000, currencyCode: 'USD' }
money(15000, 'IDR')             // mata uang tanpa desimal dapat offset 1
readMoney(value)                // → { amount, currencyCode, offset }
const split = buildSplitPayment({ total: 100000, currencyCode: 'IDR', note: 'Makan malam',
                                  participants: [a, b, c] })   // bagi rata, sisa pembagian aman
buildSplitPaymentUpdate(split, { jid: a })      // status pending → partial → settled
readSplitPayment(split)                          // siapa yang masih nunggak
buildPaymentReminder({ jid, amount: 50, currencyCode: 'USD', dueAt })
quotaUpsellButton('Upgrade', { url, price: 5, currencyCode: 'USD' }); quotaUpsellSection({ buttons })

// Status, bagian sisanya
makeStatusQuotedMessage(statusKey, { text: 'mantap' })
makeStatusAddYoursAssociation(content, originalStatusKey)
makeStatusNotificationMessage(originalKey, responseKey, { type: STATUS_NOTIFICATION_TYPES.STATUS_RESHARE })
makeGroupStatusAttribution(content, '123@g.us', { subject: 'Squad' })
makeGroupStatusReactionMessage(statusKey, '🔥', { groupJid })
StatusFont.BEBASNEUE; StatusLinkType.PREVIEW

// Status channel, bagian sisanya
await sock.reactToNewsletterStatus('1234@newsletter', serverId, '👍')
await sock.revokeNewsletterStatus('1234@newsletter', serverId)
await sock.fetchNewsletterStatusUpdates('1234@newsletter', { since })   // hanya yang berubah
const serverId = await waitForNewsletterStatusServerId(sock, key.id)
makeNewsletterFollowerInviteMessage({ newsletterJid, newsletterName })
buildNewsletterAdminProfileStatusMessage({ newsletterJid, text: 'hai' })

// Penjadwalan + conditional reveal
isScheduledTimeValid(kapan)     // { valid, reason: 'in the past' | 'too soon' | 'too far ahead' | null }
buildScheduledMsgMetaNode({ scheduleId, scheduledAt })
const key = generateRevealKey()
const locked = buildConditionalRevealMessage({ text: 'Kejutan!' }, key, { revealAt: besok })
await sock.sendMessage(jid, locked.content)   // cuma ciphertext — tidak ada yang bocor duluan
locked.reveal(key)                            // → { text: 'Kejutan!' }
```

### Mematikan banner startup

```js
makeWASocket({ ...config, printBanner: false })   // per socket
setBannerEnabled(false)                            // lewat kode
JAP_NO_BANNER=1 node bot.js                        // atau NO_BANNER=1
```

## 🤖 Bot terverifikasi, feed video & nama tombol yang bisa di-refresh (v2.4.8)

```js
// VoIP: bikin client dulu, kirim video, transkrip panggilan
const voip = makeVoipClient({ autoAccept: false })
await voip.connectWithSocket(sock)

const feeder = new VideoFeeder(640, 480, 15, frame => call.sendVideo(frame), 'lavfi:testsrc')
feeder.start()                       // frame I420 15 fps; frame hitam saat idle
i420FrameSize(640, 480)              // 460800 — error kalau dimensinya ganjil
feeder.getStats()                    // { framesEmitted, droppedFrames, underflowFrames, … }

const rec = bindVoiceRecognition(call, async pcm => (await transcribeAudio(pcm)).text, {
    chunkMs: 3000, onText: t => console.log('terdengar:', t)
})
await rec.stop()                     // → transkrip lengkap

// Verifikasi pesan bot, bukan sekadar percaya
const root = loadBotSignatureRoot(process.env.BOT_TRUST_ROOT_PEM)
verifyBotSignature(msg, { root })    // { verified, reason, useCase, version, chainLength }
readSignedRichResponse(msg, { root })// `rich` null kalau buktinya tidak lolos
verifyRichResponseSignature(msg, { root })
isParsableCertificateChain(chain)    // cek struktur DER sebelum kripto jalan
```

Tanpa trust root, `verifyBotSignature()` mengembalikan `{ verified: false, reason: 'no trust root' }`
— tidak pernah mengaku terverifikasi padahal belum dicek.

```js
// Nama tombol native-flow, bisa di-refresh saat runtime
getExports()                          // { buttonNames, source, version, updatedAt }
isKnownButtonName('quick_reply')      // yang diterima validator saat ini
await update(['brand_new_flow'])      // gabungkan nama baru dari WhatsApp
await update({ url: 'https://…/nativeflow.json' })
enableAutoUpdate({ url, intervalMs: 3600_000 })   // timer di-unref
disableAutoUpdate(); reloadExports()  // balik ke bawaan build ini
```

`sendMessage({ interactiveButtons })` memvalidasi ke tabel hidup itu, jadi nama tombol baru
tidak lagi menunggu rilis library.

```js
// Sisa permukaan A2UI / AI-rich
a2uiWidget([{ id: 't', component: 'Text', text: 'hai' }])  // komponen bebas
decodeBloksWidget(widget)             // → { components, byId, text, surfaceId, … }
await sendBloksWidget(sock, jid, widget, { body, footer })
bloksSection('Detail', [a2uiText('…')])
embeddedTabbedContent([embeddedTab('Ringkasan', tree), embeddedTab('Spesifikasi', tree2)])
thinkingSection(['cari dulu', 'cek dokumentasi'])
searchPlannerSection('kopi', [plannerStep('cari', { status: 'done' })], { sources })
multipleResponseSection(['draf A', 'draf B'], { selected: 1 })
fusedComparisonSection(['HP A', 'HP B'], [{ label: 'Harga', values: ['$1', '$2'] }], { recommend: 1 })
```

## 🧰 HTML app, username, stiker & sakelar kompatibilitas (v2.4.8)

```js
// HTML app — dokumen di akun apa pun, kartu webview kalau bundlenya kamu hosting
checkHtmlApp(html)                     // { ok, bytes, errors, warnings, hasScript, externalRefs }
await sock.sendHtmlDocument(jid, html, { fileName: 'invoice.html', caption: 'Invoice kamu' })
await sock.sendHtmlApp(jid, html, { url: 'https://kamu.host/app', title: 'Dashboard' })
await sock.sendHtmlApp(jid, html)      // tanpa url → { mode: 'document' }, bukan kartu mati
await sock.sendHtmlArtifact(jid, csvBuffer, { fileName: 'laporan.csv', title: 'Laporan' })

const { html: shared, sessionId } = withHtmlMultiplayer(html, { participants: [a, b], maxPlayers: 4 })
// bundle bisa membaca window.__JAP_MULTIPLAYER__ — injeksinya idempoten

htmlSection('Laporan', html); htmlMedia(pngBuffer, { mimetype: 'image/png', name: 'grafik' })
prepareFileArtifact(buffer, { fileName: 'app.html' })   // { mimetype, fileLength, sha256, document }
```

```js
// Dependency opsional, cache, thumbnail
const sharp = await loadSharp()        // null kalau belum terpasang — default tidak melempar
await loadFfmpeg({ required: true })   // …kecuali kamu minta
const cache = new TTLCache({ ttlMs: 60_000, max: 500 })
await cache.wrap('user:1', () => fetchUser(1))          // memoised + anti-duplikat
await prepareLinkThumbnail(url, { size: 192 })          // cache 10 menit, jalan tanpa sharp

// Username
validateUsername('@ja.p_official')     // { valid, username, reason }  ← menjelaskan *kenapa* gagal
displayUsername(value, { fallback: pushName })
isUsernamePin('123456'); stripUsernamePrefix('628…@s.whatsapp.net')

// Stiker, musik, social preview, komentar, event, asosiasi
normalizeStickers([linkSticker(url), locationSticker({ latitude, longitude }), musicSticker({ title })])
buildMusicMessage({ title, artist, songUri })           // host dicek ke MUSIC_ALLOWED_HOSTS
buildSocialPreview({ url, title }); readSocialPreview(msg)
makeCommentMessage(targetKey, 'mantap'); makeEventInviteMessage({ eventTitle, startTime })
makeMessageAssociation(parentKey, { type: MESSAGE_ASSOCIATION_TYPES.MEDIA_ALBUM })

// Section kartu
mapSection([placeItem({ name, latitude, longitude })]); sportsSection({ home, away, status: 'live' })
reminderSection('Bayar listrik', kapan); taskSection(['a', { title: 'b', status: 'done' }])
transparencySection({ sources, model: 'jap-1' })

// Ekstra auth
const { state, saveCreds } = await useJAPDBAuth({ file: './auth.json' })   // atau { client }
countAuthFileLocks({ detail: true })   // { count, paths } — pastikan tabel mutex tidak membengkak
```

### Sakelar kompatibilitas

```js
makeWASocket({ textAsConversation: true })          // teks biasa dikirim sebagai { conversation }
await sock.sendMessage(jid, { text: 'hai', asConversation: true })   // atau per pesan
```

Hanya teks *polos* yang turun bentuk: link preview, quote, atau font tetap memakai
`extendedTextMessage`, jadi tidak ada field yang hilang diam-diam. Default tidak berubah.

## 🔌 Logger apa pun, builder ter-bind & auth JAPDB (v2.4.8)

```js
// Logger selain pino bawaan tidak lagi membuat handshake crash
makeWASocket({ logger: console })                 // jalan
makeWASocket({ logger: ensureLogger(pinoV8) })    // pino versi apa pun
makeWASocket({ logger: ensureLogger(false) })     // senyap
ensureLogger(myLogger).child({ class: 'ns' })     // binding anak digabung ala pino
```

```js
// Pasang semua sender ke socket (gaya mbuilder)
const unbind = MessageBuilder.bind(sock)          // atau MB.bind(sock)
await sock.sendButtons(jid, { text: 'Hai', buttons })
await sock.sendRich(jid, { markdown: '# Hai' })
sock.mb.carousel().addCard(…)
unbind.skipped                                     // nama yang sudah ada di socket — tidak ditimpa
unbind()                                           // mengembalikan persis seperti semula
MessageBuilder.bind(sock, { prefix: 'jap' })       // → sock.japSendButtons(…)
```

```js
// Auth key-value untuk document store sederhana, atau file JSON biasa
const { state, saveCreds } = await useJAPDBAuth({ file: './auth.json' })
const { state, saveCreds } = await useJAPDBAuth({ client: db, session: 'bot-1' })
// `useNekoDBAuth` tetap ada sebagai alias drop-in — layout penyimpanannya sama
```

### pino itu opsional

```bash
npm i @japofc/baileys            # pino tidak ikut ter-install
npm i @japofc/baileys pino@8     # pino versimu sendiri — tidak ada salinan kedua
```

Kalau pino terpasang (v8, v9, atau v10) dia dipakai persis seperti sebelumnya. Kalau tidak,
logger JSON-lines bawaan yang mengambil alih, jadi tidak ada yang rusak:

```js
import logger, { usingPino, createFallbackLogger } from '@japofc/baileys'
usingPino                                   // false saat pino tidak ada
createFallbackLogger({ level: 'debug' })    // bentuk sama: level, child(), filter level
```

### Postingan channel datang dengan timestamp aslinya — plus server id

```js
sock.ev.on('newsletter.message', post => {
    post.server_id      // pegangan yang dibutuhkan react/revoke/fetch (messages.upsert membuangnya)
    post.fromMe         // true kalau notifikasinya bilang penulisnya kamu
    post.timestamp      // detik, dari notifikasi (dulu 0 → 1 Jan 1970)
    post.message        // Message yang sudah di-decode
})
```

### Envelope yang tidak bisa kita dekripsi kini kelihatan

```js
sock.ev.on('messages.decrypt-failed', failures => {
    for (const f of failures) {
        f.error      // 'Unsupported encrypted envelope: msmsg' — dulu hilang tanpa jejak
        f.willRetry  // false: mengulang yang memang tak bisa didekripsi cuma bikin loop
    }
})

makeWASocket({ unsupportedEnvelopeTypes: [] })   // atau lewatkan ke jalur dekripsi normal
```

### Read receipt kini divalidasi dan dipecah

```js
await sock.readMessages(keys)                      // key tanpa id dibuang, id di-dedup
await sock.readMessages(keys, { batchSize: 25 })   // ...dan dipecah jadi stanza berisi 25
aggregateMessageKeysNotFromMe(keys)                // → [{ jid, participant, messageIds }]
```

Key tanpa id dulu terkirim sebagai `<item id=null/>`, dan WhatsApp membuang **seluruh**
receipt itu — termasuk id-id valid yang kebetulan satu stanza dengannya.

### Undangan grup berhenti query ikon grup berulang kali

```js
sock.groupInviteThumbnailCache          // satu per socket, bisa diperiksa/dibersihkan
makeWASocket({ groupInviteThumbnailCache: createGroupInviteThumbnailCache({ ttlMs, max }) })
makeWASocket({ groupInviteThumbnailCache: false })   // matikan sepenuhnya

// dua gaya penamaan kini sama-sama jalan — yang cocok dengan nama field proto dulu dibuang diam-diam
await sock.sendMessage(jid, { groupInvite: { jid: grup, inviteCode, inviteExpiration, subject, text } })
await sock.sendMessage(jid, { groupInvite: { jid: grup, inviteCode, inviteExpiration, groupName, caption } })
```

Lima undangan ke grup yang sama kini hanya butuh **satu** query foto profil, bukan lima — dan
grup tanpa ikon tidak lagi membayar round-trip 404 yang gagal setiap kali.

### Kirim grup yang gagal tidak lagi meracuni sender key

```js
await sock.readSenderKeyMemory(groupJid)          // { [grup]: { [deviceJid]: true } }
await sock.clearSenderKeyMemory(groupJid)         // → { cleared, devices }; kiriman berikutnya mendistribusi ulang
await sock.forgetSenderKeyDevices(groupJid, [deviceJid])   // cuma satu peserta yang nyangkut
```

Memory-nya baru ditulis setelah stanza benar-benar terkirim, jadi kiriman yang mati di
tengah jalan tidak bisa lagi membuat satu grup permanen gagal mendekripsi pesan kita.

### Undangan mencatat orang yang benar, dan addressing grup berhenti menebak

```js
// §2.94 — menerima undangan yang diteruskan ke dalam grup
await sock.groupAcceptInviteV4(key, inviteMessage)       // admin/participant = key.participant
await sock.communityAcceptInviteV4(key, inviteMessage)   // (dulu malah jid grupnya)

// §2.95 — grup ini pakai addressing mode apa?
resolveGroupAddressingMode(metadata)
// → { mode: 'pn' | 'lid', source: 'metadata' | 'participants' | 'default', confident }
isUsableGroupMetadata(cached, { requireAddressingMode: true })
// → { usable, reason: 'no addressingMode (cache predates LID)' }
```

`cachedGroupMetadata` yang ditulis sebelum `addressingMode` ada dulu membuat semua pesan ke
grup **PN** dikirim dengan alamat LID; sekarang mode-nya dibaca dari jid peserta dulu sebelum
jatuh ke default, dan cache yang tak layak pakai di-fetch ulang dengan alasannya dicatat.

### Helper paritas fork: JID/LID, native flow, read receipt

```js
// JID / LID — resolusinya lewat mapping store sesi, bukan tebak-tebakan
await lidToJid('111@lid', sock)      // → '628…@s.whatsapp.net' | null  (null = memang tidak diketahui)
await jidToLid('628…@s.whatsapp.net', sock)
normalizeJid('628:12@c.us')          // '628@s.whatsapp.net'
parseJid(jid); encodeJid('628', 'lid')
phoneToJid('0812-3456-7890', { defaultCountry: '62' })   // nomor lokal, harus diminta eksplisit
isJidLid(jid); isJidMetaAi(jid); isJidUserLike(jid)

// Membaca pesan bentuk apa pun
getTextFromMessage(msg)        // caption, balasan tombol, balasan list, nama poll, judul event…
getInteractiveResponse(msg)    // { type: 'button'|'template'|'list'|'native_flow', id, text, params }
getStatusMediaType(msg)        // 'text' | 'image' | 'video' | 'audio' | null
getSenderJid(msg); getSenderLid(msg); getSenderPn(msg)

// Tombol native-flow
checkNativeFlowButtons(buttons)          // { ok, errors, warnings: ['… tidak render di WhatsApp Web'] }
validateAndNormalizeButtons(buttons)     // input longgar → [{ name, buttonParamsJson }]
validateAndNormalizeSections(sections)   // row datar diterima, id diisi, limit ditegakkan

// Read receipt, secara lokal
setBlockReadReceipts(true)                             // seluruh sesi
setBlockReadReceipts(true, { chats: [jid] })           // hanya chat tertentu
getBlockReadReceipts(); clearBlockReadReceipts()
```

`sock.readMessages()` menghormati sakelar itu, jadi scraper bisa jalan tanpa menandai apa pun
terbaca — tanpa menyentuh setelan privasi asli akun.

### Paritas lanjutan: JID ketat, member label, panggilan terjadwal, helper media

```js
validateJid('12@s.whatsapp.net')   // { valid: false, reason: 'phone JIDs must be 5–16 digits' }
assertJid(jid); assertLid(lid); toJid('+62 812…'); jidKind(jid)   // 'group' | 'lid' | 'location' | …
isJidLocationBroadcast(jid)        // pseudo-chat live location

await sock.sendMessage(groupJid, buildMemberLabelMessage('Admin'))      // atau '' untuk menghapus
await sock.sendMessage(groupJid, makeScheduledCallCreationMessage({ title: 'Standup', at, callType: 'video' }))
await sock.sendMessage(groupJid, makeScheduledCallEditMessage(callKey)) // batalkan
readScheduledCall(msg)             // { title, at, callType }

await videoToJpeg('./clip.mp4', { at: '00:00:02' })        // satu frame, sebagai Buffer
await convertToOpusBuffer('./note.m4a')                    // → { buffer, mimetype, ptt: true }
```

`processContactAction`, `emitSyncActionResults`, `readTcTokenIndex`, `shouldSendNewTcToken`,
`isTcTokenExpired`, dan `toTcTokenSeconds` kini diekspor dari root paket — modulnya sudah ada,
tapi tidak pernah di-re-export, jadi tak ada aplikasi yang bisa memakainya.

### Foto profil dipotong sama di semua backend, dan tombol turun bentuk alih-alih hilang

```js
// §2.98 — hasil crop tidak lagi tergantung library gambar mana yang terpasang
await sock.updateProfilePicture(jid, foto)                                // crop tengah (ala WhatsApp)
await sock.updateProfilePicture(jid, foto, { position: 'top' })           // pertahankan kepala, bukan bagian tengah
await sock.updateProfilePicture(jid, foto, { fit: 'contain' })            // foto utuh, dikasih bilah hitam
generateProfilePicture(foto, { width: 640, height: 640, position: 'left' })
// → { img, width, height, fit, position }

// Tombol yang tak bisa digambar perangkat terpasang jadi teks terbaca, bukan bubble kosong
supportsInteractiveButtons(sock)        // { supported, platform, reason }
await sendInteractiveSafe(sock, jid, { text: 'Pilih satu', interactiveButtons })
// → { mode: 'interactive' | 'text', reason, message }
describeButtonsAsText(content)          // "Pilih satu\n1. Ya (.ya)\n2. Situs — https://…"
getMessageDevice(msg)                   // 'ios' | 'android' | 'web' | 'desktop' | 'unknown'
```

### Kartu AI-rich di WhatsApp biasa dan WhatsApp Business

Kartu `AIRich` tinggal di `botForwardedMessage.richResponseMessage`, dan hanya permukaan
Meta-AI yang bisa menggambarnya — akun pribadi maupun Business menerimanya sebagai bubble
kosong. Opsi `compat` meratakan kartu yang sama persis ke format bawaan WhatsApp lalu
mengirimnya sebagai pesan biasa.

```js
const rich = new AIRich(sock)
  .addHeading('Cuaca Jakarta')
  .addText('Hujan **ringan**, 27 derajat')
  .addSuggest(['Besok?', 'Minggu ini?'])

await rich.send(jid)                            // tetap sama: kartu rich Meta-AI
await rich.send(jid, { compat: 'plain' })       // *Cuaca Jakarta* … sebagai pesan biasa
await rich.send(jid, { compat: 'interactive' }) // teks + saran jadi tombol nativeFlow
await rich.send(jid, { compat: 'auto' })        // interactive kalau kartunya punya saran

// Periksa dulu sebelum kirim
const { mode, reason, text, content, buttons } = await rich.buildPlain({ mode: 'auto' })

// Atau ratakan section-nya sendiri
renderAIRichSectionsAsText(sections, { title, footer })
buildPlainAIRichContent(text, { mode: 'interactive', buttons })
resolveAIRichCompatMode('auto', { hasButtons: true, supportsInteractive: false })

// Bukti bot asli, bukan placeholder bawaan
rich.setBotSignature({ certificateChain, signature })   // tanda tangan Ed25519 64 byte
rich.aiVerification                                     // 'signed' | 'placeholder'
```

**Default-nya tetap `'rich'`** — pengiriman Meta-AI yang sudah ada tidak berubah sedikit pun.

### Alamat LID, aksi sinkronisasi, dan antrean setelah reconnect

```js
// §2.103 — aksi dari WhatsApp yang belum punya event sendiri
sock.ev.on('app-state.action', ({ name, type, id, action }) => {
  if (name === 'quickReplyAction') console.log('balasan cepat', action.shortcut)
})
// chat yang dibersihkan dari HP kini sampai juga ke sini
sock.ev.on('messages.delete', item => { if ('all' in item) store.clearChat(item.jid) })

// §2.104 — kuras ledakan stanza setelah reconnect tanpa membekukan event loop
const offline = makeOfflineNodeProcessor(handlersByType, {
  isOpen: () => sock.ws.isOpen,
  onUnexpectedError: (err, ctx) => logger.error({ err }, ctx)
}, 10)
offline.enqueue('message', node)
await offline.waitUntilIdle()     // offline.pending / offline.clear() / offline.draining

hasInteractiveBinaryNode(additionalNodes)  // node <biz> kita dilewati kalau kamu sudah kirim sendiri
```

Chat yang dialamatkan via LID kini juga dikirim ke device LID dan memakai cache device, bukan
menembak USync IQ tiap pesan; migrasi sesi PN→LID pun tak lagi bergantung pada cache device-list
yang hangat (BUGREPORT 2.100 / 2.101).

### Pesan peer dan resync kunci app-state

```js
// §2.106 — kirim protocolMessage apa pun ke perangkatmu sendiri (category: 'peer')
await sock.sendPeerMessage({ type: 7, appStateSyncKeyRequest: { keyIds } })
await sock.sendPeerMessage(content, { pushPriority: 'low', appdata: 'critical_block' })

// minta HP membagikan ulang kunci app-state yang hilang
await sock.requestAppStateKeyResync([keyIdBuffer, 'base64KeyId', { keyId }])
```

> **ffmpeg:** jalur transcoding (`videoToJpeg`, `convertToOpusBuffer`, thumbnail video) ditutup 7 tes
> yang hanya jalan kalau binary-nya ada — set `FFMPEG_PATH`, pasang `ffmpeg-static`, atau taruh
> `ffmpeg` di `PATH`. Klip yang lebih pendek dari titik seek tak lagi menghasilkan thumbnail kosong
> (2.105), dan menutup panggilan tak lagi menyisakan proses ffmpeg hidup (2.107).

### Foto profil & detail bisnis dalam satu query

```js
import { USyncQuery, USyncUser } from '@japofc/baileys'

const query = new USyncQuery().withPictureProtocol('image').withBusinessProtocol()
for (const jid of jidAnggota) query.withUser(new USyncUser().withId(jid))

const { list } = await sock.executeUSyncQuery(query)   // sekali jalan, bukan 300 kali
list[0].picture   // { id, url, directPath, hash, type }
list[0].business  // { verifiedName, address, businessHours, catalogExists, cartEnabled }
```

### Pratinjau tautan lewat fetcher sendiri

```js
import { getUrlInfo } from '@japofc/baileys'

const info = await getUrlInfo('https://example.com/post', {
	fetcher: (url, options) => proxyCacheku.preview(url, options) // opsional; default tetap link-preview-js
})
info.title            // halaman tanpa gambar tetap menghasilkan pratinjau
info.jpegThumbnail    // undefined, bukan TypeError yang dilempar
```

### Katalog, sekaligus semuanya

```js
const { products, pages, truncated } = await sock.getCatalogAll({ jid: bizJid, pageSize: 50 })
products[0].availability   // 'in stock' | 'out of stock' | … — dibaca dari node, bukan diasumsikan
products[0].price          // undefined untuk produk "harga nego" (bukan NaN lagi)
```

### Patungan & pengingat pembayaran

```js
// nominal ditulis apa adanya; penskalaan ke format wire diurus otomatis
await sock.sendSplitPayment(groupJid, {
  splitId: 'dinner-1', total: 300_000, currency: 'IDR', description: 'Makan malam',
  requesterJid: me,
  participants: [{ jid: a, amount: 100_000, status: 'PAID' }, { jid: b }, { jid: c }]
}, { splitEvenly: true })               // sisanya dibagi rata — jumlahnya selalu pas

await sock.sendSplitPaymentUpdate(groupJid, { splitId: 'dinner-1', participantJid: b })
await sock.sendPaymentReminder(jid, {
  reminderId: 'kos', amount: 1_500_000, currency: 'IDR', frequency: 'MONTHLY', payerJid: b
})

// membacanya kembali
readSplitPaymentMessage(msg.message)  // { total, participants, settled, outstanding, complete }
readPaymentMessage(msg.message)       // { type: 'split' | 'splitUpdate' | 'reminder', value }
```

> Hanya builder: `buildSplitPaymentMessage()`, `buildSplitPaymentUpdateMessage()`,
> `buildPaymentReminderMessage()`, `wireMoney()` / `readWireMoney()`, dan
> `toSplitPaymentMessage()` untuk mengangkat objek pembukuan lama (`buildSplitPayment()` di
> `Utils/payment.js`) menjadi pesan yang benar-benar bisa dikirim.

### Rotasi sender-key grup

```js
// buang kunci grup keluar kita + pembukuan distribusinya, kirim berikutnya mencetak kunci baru
const { rotated } = await sock.rotateGroupSenderKey('1203630000@g.us')

// primitif tingkat rendah
await sock.signalRepository.rotateSenderKey({ group, meId })
```

> Perubahan keanggotaan (pengeluaran, penurunan admin, keluar sendiri) kini merotasi kunci
> secara otomatis. Sebelum v2.4.9 hanya pembukuan "siapa sudah menerima kunci" yang dihapus,
> sehingga kirim berikutnya mendistribusikan **kunci yang sama** dan anggota yang baru saja
> dikeluarkan tetap bisa mendekripsi pesan grup (2.108). Panggil `rotateGroupSenderKey()`
> secara manual setelah pengeluaran anggota di luar jalur biasa.

> Dua perbaikan kripto grup lain ikut masuk, keduanya tanpa perubahan API: pesan grup yang
> datang terlambat/tidak berurutan dulu **tidak pernah bisa didekripsi** (2.110), dan rantai
> pengirim maju dua langkah per pesan sehingga record sender-key menggelembung satu kunci mati
> tiap kirim dan ditulis ulang setiap pesan (2.109). File auth lama tetap berfungsi apa adanya.

## 📝 Arsip Catatan Rilis

> Riwayat lengkap tiap versi ada di [CHANGELOG.md](../../CHANGELOG.md). Di bawah ini ringkasan rilis-rilis sebelumnya.

<details>
<summary>🗂️ Buka ringkasan rilis lama (v2.4.2 & v2.4.3)</summary>

<br/>

### v2.4.3

- **Acara komunitas**: `createGiveaway` (undian adil), `createAttendance` (absen + streak), `createAuction` (anti-snipe + beli-langsung), `createTextPoll` (polling balas-angka, jalan di semua client).
- **Game**: `createTicTacToe` (rekor + leaderboard), `createRPS` (suit, pilihan rahasia, best-of-N), `createWordChain` (sambung kata), `scrambleWord`, `generateMathProblem`.
- **Bisnis bot**: `createRentalManager` (sewa per chat, trial sekali seumur hidup, filter grup belum-sewa), `createMessageCounter` (rekap harian 🥇), `createCommandLock` (+mode maintenance dengan bypass owner).
- **Ekosistem fork tuntas disapu** (upstream rc14 + 8 fork hidup di-download & di-diff API-nya — nol gap tersisa): diambil `status-tools` (status teks auto-bergaya, terpasang di jalur kirim status) dan `newsletter-tools` (batch follow/unfollow/mute ber-jeda).
- **Grup AI (eksperimental, digerbang server)**: `addAiBotToGroup` / `createAiGroup` — Meta AI di grup; diterima/tidaknya tergantung rollout per-akun dari Meta, penolakan muncul sebagai kode status.
- **Sapuan 36 upgrade** di seluruh toolkit (kv TTL, pin catatan, pengingat berulang, economy `work()`/`rob()`/bunga, PRESTIGE level ⭐, `revealHint`, ban sementara, `waitAndAssert`, watchdog `autoRestart`, sparkline, `ctx.quotedText`, polling ETag, throttle alert, `boxText`, dll) + 9 lanjutan.
- **Banner startup v2**: kartu kesehatan berbingkai (versi paket + WA Web, node/platform/pid, tagline harian).
- Versi WA Web → live `2.3000.1048680055`; CLI dapat `wa` dan `sticker`.

### v2.4.2

- **Paket anti-ban**: `createAccountWarmup` (ramp harian 20→50→…→bebas), `classifyDisconnect`/`explainDisconnect`, `createGroupOpGuard` (~3 add/2 create per 10 menit + `wrap(sock)`), jitter Gaussian, `createPresenceCycler` opt-in.
- **Keamanan & stabilitas**: `createBugShield` (bom mention/zalgo/RTLO + `sanitizeText`), `createSecureLogger` + `redactSensitive`, string sesi terenkripsi `JAPSESS2`, `hardenAuthFolder`, `installCrashGuard` + `safeStringify`, `createConnectionWatchdog`.
- **Perkakas sesi & DB**: `analyzeAuthState` (dokter sesi), `repairAuthFolder`, export/import sesi portabel, `migrateFolderToAuthState`, `backupAuthStateRotating`, `createShutdownManager`, command CLI `session`.
- **Moderasi & komunitas**: flood/word-filter/warn/gatekeeper/level/quota/tier/economy+shop/command-stats/anti-tagall/verifier/join-requests/group-backup/menfess.
- **Toolkit bot**: `serializeMessage`, call guard + call log, group events, toolkit view-once, anti-link, anti-delete/edit, tracker reaction/receipt/presence, auto-read, AFK, tag-all/hidetag, pairing tools (`pairWithCode`), guard router, conversation flows, webhook bridge, health monitor, i18n, fancy-text — total 140+ modul utilitas.
- **EXIF stiker murni JS** — dependensi `node-webpmux` dihapus; branding stiker jalan di Termux; command CLI `sticker`.

</details>

<div align="right"><a href="#top">⬆ kembali ke atas</a></div>

---
