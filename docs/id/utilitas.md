# Modul utilitas

[← kembali ke README](../../README.id.md)

## 🆕 Utilitas Sehari-hari

One-liner untuk kerjaan bot harian (bisa juga standalone — lihat `examples/`):

```js
// 📊 Poll (chat/grup) + Kuis (khusus channel)
await sock.sendPoll(jid, { name: 'Makan apa?', options: ['Nasi', 'Mie'] })
await sock.sendQuiz(channelJid, { name: 'Kuis', options: ['A', 'B'], correctAnswer: 'A' })

// 🎙️ Voice note — otomatis konversi mp3/wav/… ke Opus PTT (butuh fluent-ffmpeg)
await sock.sendVoiceNote(jid, './halo.mp3') // path | Buffer | { url }

// 📞 Tag semua orang (daftar @ terlihat vs tersembunyi)
await sock.tagAll(groupJid, 'Rapat jam 10!')
await sock.hideTag(groupJid, 'Pengumuman 📢')

// 🔍 LID → nomor telepon (best-effort, null kalau tidak diketahui)
await sock.getPhoneNumber('12345@lid') // → '62812…'
await sock.getLidForPhone('62812…')    // lookup kebalikannya

// 🧍 Kirim manusiawi — mengetik… + jeda natural + antrean per-chat
await sock.sendHumanized(jid, { text: 'Halo!' })

// 🛡️ Send Guard — pacing anti-ban global langsung di dalam sendMessage()
const sock = makeWASocket({
    sendRateLimit: {
        messagesPerMinute: 20, // plafon global token-bucket (0 = mati)
        perChatDelayMs: 1500,  // jeda minimum antar kirim ke chat yang sama
        jitterRatio: 0.2       // ±20% acak biar timing tidak terlihat robotik
    }
})
await sock.sendMessage(jid, { text: 'otomatis di-pace 🛡️' })          // di-pace
await sock.sendMessage(jid, { text: 'sekarang!' }, { skipRateLimit: true }) // bypass

// ✅ Pelacakan pengiriman — tunggu ack server untuk pesan keluar
const msg = await sock.sendMessage(jid, { text: 'penting!' })
await sock.waitForMessageAck(msg.key.id) // resolve saat di-ack, reject saat
                                         // error server / timeout 60 detik

// ✅ Varian satu panggilan — kirim + tunggu ack, bebas race (waiter didaftarkan
// SEBELUM pesan keluar, jadi ack yang datang cepat tidak mungkin lolos)
const { message, ack } = await sock.sendMessageAcked(jid, { text: 'penting banget!' }, { ackTimeoutMs: 30_000 })

// 📣 Broadcast ke banyak jid — ada jeda, hasil per-jid, tidak mati di tengah jalan
const report = await sock.sendBroadcast(jids, { text: 'promo!' }, { delayMs: 1500 })
// { sent: [...], failed: [{ jid, error }], total }

// 🔗 Link undangan grup
extractGroupInviteCode('https://chat.whatsapp.com/AbCdEf…') // 'AbCdEf…'
await sock.joinGroupViaLink('https://chat.whatsapp.com/AbCdEf…')

// 🏷️ Parse @mention dari teks → siap dipakai sendMessage
const mentions = parseMentions(text) // ['62812…@s.whatsapp.net', …]
await sock.sendMessage(jid, { text, mentions })

// 🤖 Chat Meta AI (eksperimental — butuh Meta AI di akun/region)
const { text } = await sock.askMetaAI('Jelaskan black hole!')
```

**Command router** untuk bot berprefix (`!menu`, `.sticker`) dengan middleware + auto-help:

```js
import { createRouter } from '@japofc/baileys'
const router = createRouter({ prefix: '!' })
router.command('ping', async (ctx) => ctx.reply('pong! 🏓'), { desc: 'Cek bot' })
router.attach(sock) // → detach()
```

**Penjadwal status / channel** (in-memory):

```js
import { StatusScheduler, ChannelScheduler, StatusHelper } from '@japofc/baileys'
new StatusScheduler(sock).schedule(StatusHelper.text('Pagi! ☀️'), new Date('2026-09-11T06:00:00+07:00'))
new ChannelScheduler(sock).schedule(channelJid, { text: 'Update' }, Date.now() + 3600_000)
```

**Atribusi musik di status** (`StatusAttribution.Type.MUSIC` — fitur resmi WA
Des-2025 "tambah musik ke status", terverifikasi wire terhadap WAProto):

```js
import { StatusHelper, withMusicAttribution } from '@japofc/baileys'

const status = withMusicAttribution(
  StatusHelper.text('vibes 🎵'),
  { title: 'Nama Lagu', authorName: 'Artis', songId: '<catalog-id>' }
)
await StatusHelper.send(sock, status, jidList)
```

> Klien resmi me-resolve lagu lewat katalog berlisensi Meta, jadi `songId`
> harus id katalog asli agar chip musiknya muncul di sana. Struktur atribusinya
> sendiri wire-correct apa pun isinya (round-trip tercakup di test).

**Ekspor chat & statistik** (offline — format "Ekspor chat" resmi, JSON, CSV):

```js
import { exportChatAsText, exportChatAsCSV, chatStatistics } from '@japofc/baileys'

// messages: WAMessage[] dari store / cache anti-delete / messages.upsert
console.log(exportChatAsText(messages))
// 14/09/2026, 10.32 - J.AP: halo!
// 14/09/2026, 10.33 - Rina: <Media omitted>

fs.writeFileSync('chat.csv', exportChatAsCSV(messages))

const stats = chatStatistics(messages)
// { total, bySender, byKind, byHour[24], byWeekday[7], topWords, ... }
```

Bisa juga tanpa kode sama sekali: `npx @japofc/baileys export dump.json --format text|json|csv`.

**Testing bot offline (`createMockSocket`)** — tes logika bot di CI tanpa akun
WhatsApp, tanpa jaringan, tanpa risiko banned:

```js
import { createMockSocket, createRouter } from '@japofc/baileys'
import assert from 'assert'

const mock = createMockSocket()
setupBotKu(mock.sock)              // kode bot asli, tanpa diubah

await mock.receiveText('628xx@s.whatsapp.net', '!ping')
const reply = await mock.waitForReply()
assert.equal(reply.content.text, 'pong! 🏓')
```

Permukaan `ev` dan signature `sendMessage()` sama dengan socket asli; pesan
keluar adalah `proto.WebMessageInfo` SUNGGUHAN lewat pipeline
`generateWAMessage()` yang sama. Mendukung injeksi grup, quoted reply, simulasi
lifecycle koneksi, capture read-receipt/presence, dan `reset()` antar tes.
Scope jujur: TIDAK mengemulasi server WhatsApp — rate limit, sesi, dan enkripsi
di luar cakupan by design.

`npm test` menjalankan suite offline (`tests/`, tanpa jaringan).

---

## 🧩 Modul Utilitas

<details>
<summary>📖 Buka referensi lengkap modul-utilitas (banyak konten)</summary>

<br/>

Sampel utilitas yang diekspor dari `lib/Utils` di luar builder pesan di atas:

| Modul | Fungsinya |
|---|---|
| `anti-delete` | Deteksi dan pulihkan pesan yang dihapus pengirim untuk semua orang |
| `anti-edit` | Tangkap isi pesan SEBELUM di-edit — teks before/after, riwayat revisi lengkap, edit berantai |
| `trackers` | Tracker reaksi / tanda terima / presence — siapa react apa, siapa sudah baca pesan grup, siapa online/ngetik |
| `serialize` | `serializeMessage` — objek pesan siap-bot dengan `.reply()`, `.react()`, `.download()`, quoted ke-unwrap |
| `call-guard` | Lacak panggilan masuk, auto-reject + pesan teks opsional, hitungan per penelepon, allowlist |
| `group-events` | Callback welcome/goodbye/promote/demote + log event per grup dari update grup |
| `view-once` | Deteksi, buka, dan tangkap pesan view-once sebelum hilang |
| `anti-link` | Deteksi (dan auto-hapus) link undangan grup/link apa pun di grup — allowlist chat & domain |
| `auto-read` | Auto centang-biru pesan masuk — filter grup/DM/status, allow/deny list, pause/resume |
| `afk` | Manajer AFK — tandai user pergi, tangkap @mention & reply selama pergi, auto welcome-back |
| `pairing-tools` | Siklus kode pairing — validasi/normalisasi kode custom, hitung mundur kedaluwarsa, alur sekali panggil `pairWithCode` |
| `flood-guard` | Deteksi spam per user — N pesan dalam satu jendela memicu satu alert per burst |
| `word-filter` | Moderasi kata/regex atas seluruh teks terekstrak (caption juga), auto-hapus, daftar kata runtime |
| `warn-manager` | Sistem strike — warn per user per chat, threshold, pardon, persistensi |
| `gatekeeper` | Ban user/chat dari bot; bungkus handler apa pun agar trafik banned tak pernah masuk |
| `level-system` | XP & level per user, event level-up, leaderboard global + per chat, persistensi |
| `sticker-exif` | Baca/tulis EXIF packname/author stiker di WebP murni JS — tanpa dependensi native, aman di Termux |
| `economy` | Saldo, transfer dengan fee, hadiah harian dengan bonus streak, leaderboard, persistensi |
| `group-scheduler` | Buka/tutup grup terjadwal harian ("mode malam"), filter hari |
| `verifier` | Captcha member baru grup — tantangan otomatis saat join, hook kick timeout/salah jawab |
| `command-stats` | Analitik command — command/user teratas, histogram per jam, middleware router, persistensi |
| `anti-tagall` | Tangkap spam mass-mention & hidetag tak terlihat dari member — threshold, pengecualian, auto-hapus |
| `shop` | Toko & inventory di atas economy — stok, consumable, jual balik, kirim item |
| `group-backup` | Snapshot setting + member grup ke JSON, diff dengan kondisi live, restore setting |
| `menfess` | Sesi relay DM anonim dua arah (bot "menfess") — alias, kata stop, TTL |
| `notes` | Catatan bernama per chat (`#save` / `#get`) — cari, rename, limit, persistensi |
| `birthday` | Buku ulang tahun — daftar hari ini/mendatang, ucapan otomatis sekali per tahun |
| `guess-game` | Engine tebak-tebakan — satu ronde per chat, tercepat menang, hadiah, jawaban dibuka saat timeout |
| `i18n` | Lapisan terjemahan mini — kamus, bahasa per chat, interpolasi `{var}` |
| `fancy-text` | Gaya teks Unicode untuk menu — 𝗯𝗼𝗹𝗱, 𝚖𝚘𝚗𝚘, ⓒⓘⓡⓒⓛⓔⓓ, ｆｕｌｌｗｉｄｔｈ, ꜱᴍᴀʟʟᴄᴀᴘꜱ (12 gaya) |
| `join-requests` | Auto setujui/tolak permintaan join grup — allowlist/denylist, routing manual, sweep pending |
| `session-tools` | Dokter sesi — analisis/perbaiki folder auth, export/import session-string portabel, migrasi antar backend |
| `shutdown` | Manajer shutdown rapi — creds diflush duluan, hook berurutan, tangani sinyal, jalan sekali |
| `conversation-flow` | Wizard multi-langkah per user — prompt, validasi, kata batal, timeout |
| `webhook-bridge` | POST event socket ke endpoint HTTP mana pun — tanda tangan HMAC, retry backoff |
| `wa-links` | Bangun/parse URL wa.me, undangan grup & channel; ekstrak URL dari teks |
| `media-probe` | Format + dimensi gambar murni JS (PNG/JPEG/GIF/WebP/BMP) — tanpa library gambar |
| `media-guard` | Blokir tipe media per chat ("dilarang stiker") — aturan per chat, auto-hapus |
| `health-monitor` | Kesehatan proses — memori, lag event-loop, probe custom, alert threshold |
| `text-extras` | Read-more, progress bar, durasi/ukuran manusiawi, pemenggalan, escape markdown, jarak fuzzy |
| `reminders` | "!remind 10m …" — parseDuration, timer, persistensi anti-restart (telat tetap bunyi) |
| `quota` | Jatah harian per user dengan tier — reset tengah malam, bonus, event kehabisan |
| `tiers` | Keanggotaan premium/VIP berkedaluwarsa — extend/stack, lifetime, penyapu expiry |
| `todo` | Daftar tugas bersama per chat — penanggung jawab, render ☐/☑, mention, persistensi |
| `url-watcher` | Pantau URL apa pun, alert saat konten berubah — extract view, diff SHA-256 |
| `bug-shield` | Deteksi pesan bug/crash — bom mention, zalgo, banjir karakter tak terlihat, spoof RTL; sanitizeText |
| `crash-guard` | Selamat dari exception/rejection tak tertangkap — alert owner, counter, safeStringify |
| `connection-watchdog` | Tangkap socket setengah-mati yang diam — alert stale sekali, re-arm saat aktif lagi |
| `secure-logger` | Logger pino dengan redaksi kredensial + redactSensitive() untuk objek apa pun |
| `call-log` | Riwayat panggilan + statistik per penelepon dari event `call` — hasil, durasi, persistensi |
| `always-online` | Titik hijau tetap nyala — penyegar presence dengan ganti mode live & counter gagal |
| `status-watcher` | Story sisi penerima — filter kontak, tipe media, hook download |
| `button-extras` | quickButtons, sendConfirm (ya/tidak), sendMenuButtons sekali panggil |
| `random-tools` | Notasi dadu, koin, pilihan berbobot, meter rate/"jodoh" deterministik |
| `jid-extras` | Konversi nomor↔jid, banding tanpa peduli device, cetak nomor cantik |
| `time-tools` | Waktu relatif ('5m ago'), jam, kejadian berikutnya, jendela lewat tengah malam, salam |
| `group-tools` | Helper groupMetadata murni — admin, owner, statistik, diff member, kartu info |
| `msg-tools` | messageTypeOf, info quoted, timestamp, preview pesan satu baris |
| `kv-store` | Database key-value JSON mini — namespace, counter, simpan atomik debounce |
| `warmup` | Pemanasan akun — naikkan volume kirim harian nomor baru bertahap (20→50→…→bebas) |
| `disconnect-classifier` | Error close → kategori + aksi yang disarankan (reconnect / pair ulang / stop) |
| `group-op-guard` | Tetap di bawah batas aksi grup WhatsApp (~3 add & 2 create per 10 menit) |
| `giveaway` | Undian masuk-via-keyword — undian adil, multi-pemenang, deadline, kartu status |
| `attendance` | Absen harian — jam check-in, daftar yang belum, render bernomor |
| `auction` | Lelang berwaktu — kenaikan minimum, perpanjangan anti-snipe, alert tersalip |
| `text-poll` | Polling balas-angka yang jalan di semua client — tally, bar, penanganan seri |
| `tictactoe` | Duel XO — tantang/terima, papan emoji, menang/seri/menyerah |
| `rps` | Suit batu-gunting-kertas — pilihan tersembunyi, alias Indonesia, taruhan |
| `word-games` | scrambleWord, generator soal matematika, engine "sambung kata" |
| `rental` | Sewa bot per chat — trial, peringatan kedaluwarsa, filter grup belum sewa |
| `message-counter` | Aktivitas harian per user — top chatter, rekap 🥇, riwayat harian |
| `command-lock` | Matikan command per chat/global + mode maintenance dengan bypass owner |
| `status-tools` | Auto-style status — font/warna acak untuk status teks, normalisasi media/audio (terpasang di jalur kirim status) |
| `newsletter-tools` | Operasi channel massal ber-jeda — follow/unfollow/mute banyak dengan hasil per-jid |
| `emoji-tools` | Deteksi/hitung/ekstrak/buang emoji, randomEmoji bertema |
| `array-tools` | chunk, unique-by, groupBy, sortBy, sample unik, range |
| `validate-tools` | isUrl/isEmail, parseBool id/en, clamp, ensureArray, pickFields |
| `timing-tools` | debounce, throttle, stopwatch lap, measureTime |
| `task-queue` | Job async konkuren terbatas + retry — aman untuk DM massal |
| `mask-tools` | maskPhone/maskEmail, censorText sadar batas kata |
| `math-eval` | Parser !calc AMAN (tanpa eval) + terbilang + angka Romawi |
| `chat-settings` | Toggle fitur per chat dengan default — tulang punggung !settings, kartu ✅/❌ |
| `voucher` | Buat & tukar kode (JAP-X7K2-9QMD) — batas pakai, kedaluwarsa, sekali per user |
| `quiz` | Sesi kuis multi-soal — skor berjalan, skip, peringkat |
| `socket-preflight` | validateSocketConfig — tangkap config rusak sebelum jadi 405 misterius (otomatis di makeWASocket) |
| `group-cache` | createGroupMetadataCache — TTL-LRU untuk `cachedGroupMetadata` dengan invalidasi via event |
| `reputation` | +rep/-rep dengan cooldown per pemberi, leaderboard, kartu rep |
| `invite-tracker` | Siapa mengundang siapa — hitungan aktif-vs-total (loop join/leave tak dibayar), papan top inviter |
| `level-rewards` | attachLevelRewards — payout otomatis (saldo/tier/custom) di ambang level, sekali saja |
| `marriage` | Registri lamar/terima/cerai — monogami ketat, hari jadi, daftar pasangan |
| `ai-groups` | ⚠️ EKSPERIMENTAL: tambah/hapus Meta AI di grup, createAiGroup — digerbang server per-akun oleh rollout Meta (tanpa flag = server menolak; tidak ada verifikasi manual) |
| `auto-reply` | Engine auto-responder sederhana berbasis kata kunci/pola |
| `message-search` | Cari pesan di cache/store, membuka wrapper ephemeral/view-once dulu |
| `message-retry-manager` | Menangani protokol retry-receipt WhatsApp untuk pesan yang gagal didekripsi |
| `scheduling` | Jadwalkan pesan/aksi untuk dikirim nanti |
| `business` | Helper profil bisnis & katalog |
| `chat-control` | Helper pin, mute, arsip, dan tandai dibaca/belum |
| `chat-history-helpers` | Bekerja dengan payload riwayat chat tersinkron |
| `link-preview` | Membuat metadata preview link untuk pesan keluar |

```js
// anti-delete + anti-edit berbagi satu MessageStore
import { MessageStore, createMessageStoreHandler, createAntiDeleteUpsertHandler, createAntiEditUpsertHandler } from '@japofc/baileys'

const store = new MessageStore()
sock.ev.on('messages.upsert', createMessageStoreHandler(store))     // daftarkan DULUAN
sock.ev.on('messages.upsert', createAntiDeleteUpsertHandler(store, (info) => {
    console.log('terhapus:', info.originalMessage)                  // konten terpulihkan
}))
sock.ev.on('messages.upsert', createAntiEditUpsertHandler(store, (info) => {
    console.log(`edit #${info.editCount}: "${info.beforeText}" -> "${info.afterText}"`)
    info.history // semua revisi sebelumnya, dari yang paling lama
}))
```

```js
// tracker event — reaksi / tanda-baca / presence
import { createReactionTracker, createReceiptTracker, createPresenceTracker } from '@japofc/baileys'

const reaksi = createReactionTracker()
reaksi.bind(sock)                          // messages.reaction
reaksi.getSummary(msg.key)                 // { '👍': ['628…@s.whatsapp.net'], … }
reaksi.onReaction(({ user, emoji, removed }) => { /* update live */ })

const tandaTerima = createReceiptTracker()
tandaTerima.bind(sock)                     // message-receipt.update + messages.update
tandaTerima.getReceipts(msg.key)           // { delivered: [...], read: [...], played: [...] }
tandaTerima.isReadBy(msg.key, jid)         // user INI sudah baca?
tandaTerima.onRead(({ key, user }) => { /* sekali per pembaca */ })

const presence = createPresenceTracker()
presence.bind(sock)                        // presence.update
await sock.presenceSubscribe(jid)          // WA hanya kirim presence untuk jid yang di-subscribe
presence.isOnline(jid); presence.isTyping(jid); presence.get(jid)?.lastSeen
presence.onChange(({ user, presence }) => { /* transisi online/offline/ngetik */ })
```

```js
// toolkit bot — serializer, call guard, event grup, view-once, anti-link
import {
    serializeMessage, createCallGuard, createGroupEventsTracker,
    createViewOnceCapture, createAntiLinkGuard
} from '@japofc/baileys'

sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = serializeMessage(sock, messages[0])
    if (!m || m.fromMe) return
    if (m.body === 'ping') await m.reply('pong')      // otomatis quote pesan asli
    if (m.isMedia) { const buf = await m.download() } // media jadi Buffer
    if (m.quoted) console.log('membalas:', m.quoted.body)
})

const panggilan = createCallGuard({ autoReject: true, rejectMessage: 'Bot tidak bisa angkat telepon.' })
panggilan.bind(sock)                                  // event 'call'
panggilan.onRejected(call => console.log('ditolak', call.from, call.isVideo ? '(video)' : ''))

const grup = createGroupEventsTracker()
grup.bind(sock)                                       // group-participants.update + groups.update
grup.onJoin(({ id, participants }) =>
    sock.sendMessage(id, { text: `Selamat datang ${participants.join(', ')}! 👋` }))
grup.onLeave(({ participants }) => console.log('keluar:', participants))

const brankas = createViewOnceCapture()
brankas.bind(sock)                                    // messages.upsert
brankas.onViewOnce(({ msg, unwrapped }) =>
    console.log('view-once', unwrapped.mediaType, 'dari', msg.key.remoteJid))

const antilink = createAntiLinkGuard({ autoDelete: true }) // link undangan di grup
antilink.bind(sock)
antilink.onDetected(({ chat, sender }) =>
    sock.sendMessage(chat, { text: `@${sender.split('@')[0]} dilarang share link grup!`, mentions: [sender] }))
```

```js
// auto-read, AFK & tag-all
import { createAutoRead, createAfkManager, sendMentionAll, sendHideTag } from '@japofc/baileys'

const reader = createAutoRead({ denylist: ['bos@s.whatsapp.net'] })
reader.bind(sock)                       // sisanya auto centang biru begitu masuk
reader.pause(); reader.resume()

const afk = createAfkManager()
afk.bind(sock)
afk.setAfk(sender, 'istirahat makan 🍜') // mis. dari command !afk
afk.onAfkMention(({ chat, afkUser, reason, msg }) =>
    sock.sendMessage(chat, { text: `@${afkUser.split('@')[0]} lagi AFK: ${reason}`, mentions: [afkUser] }, { quoted: msg }))
afk.onReturn(({ user, missed }) => console.log(user, 'sudah balik,', missed.length, 'ping selama pergi'))

await sendMentionAll(sock, groupJid, 'Rapat 5 menit lagi!')  // @everyone kelihatan
await sendHideTag(sock, groupJid, 'Pengumuman diam-diam')    // semua ke-ping, teks bersih

// upgrade serializeMessage: m.isViewOnce, m.viewOnce, m.expiration, m.forward(jid), m.delete()
```

```js
// pairing jadi nyaman — sekali panggil dari socket sampai terpasang
import { pairWithCode, getPairingCodeInfo } from '@japofc/baileys'

const hasil = await pairWithCode(sock, '628123456789', {
    customCode: 'abcd-efgh', // opsional — format bebas, dinormalisasi otomatis
    onCode: (code, formatted) => console.log('Masukkan di HP:', formatted)
})
if (hasil.restartRequired) { /* buat ulang socket — standar setelah pairing */ }

const info = getPairingCodeInfo(state.creds)
console.log(info.formatted, '— kedaluwarsa dalam', Math.round(info.remainingMs / 1000), 'detik')
// requestPairingCode sendiri kini juga menerima kode custom "abcd-efgh" / "ABCD EFGH"
```

```js
// paket komunitas & moderasi
import {
    createFloodGuard, createWordFilter, createWarnManager,
    createGatekeeper, createLevelSystem
} from '@japofc/baileys'

const flood = createFloodGuard({ maxMessages: 8, windowMs: 10_000 })
flood.bind(sock)
flood.onFlood(({ chat, user }) => warns.warn(user, { chat, reason: 'spam beruntun' }))

const filter = createWordFilter({ words: ['judol'], patterns: [/j\s*u\s*d\s*o\s*l/i], autoDelete: true })
filter.bind(sock)
filter.onMatch(({ chat, sender }) => warns.warn(sender, { chat, reason: 'kata terlarang' }))

const warns = createWarnManager({ threshold: 3 })
warns.onThreshold(async ({ user, chat }) => {
    await sock.groupParticipantsUpdate(chat, [user], 'remove') // tiga strike, keluar
    warns.reset(user, chat)
})

const gate = createGatekeeper()
gate.banUser('pengganggu@s.whatsapp.net', 'spam')
sock.ev.on('messages.upsert', gate.filter(async ({ messages }) => { /* hanya trafik bersih */ }))

const levels = createLevelSystem()
levels.bind(sock)
levels.onLevelUp(({ user, chat, level }) =>
    sock.sendMessage(chat, { text: `🎉 @${user.split('@')[0]} naik ke level ${level}!`, mentions: [user] }))
levels.getLeaderboard(10, chat) // top 10 di grup ini
```

```js
// branding stiker, economy, mode malam & captcha join
import {
    setStickerExif, readStickerExif, createEconomy,
    createGroupScheduler, createVerifier
} from '@japofc/baileys'

// murni JS — tanpa node-webpmux, jalan di webp statis DAN animasi
const stiker = setStickerExif(webpBuffer, { packName: 'Pack Gue', author: 'gue', emojis: ['🔥'] })
await sock.sendMessage(jid, { sticker })
readStickerExif(stiker) // { 'sticker-pack-name': 'Pack Gue', … }

const eco = createEconomy({ dailyAmount: [100, 200], streakBonus: 25, transferFee: 0.05 })
eco.claimDaily(user)          // { claimed, amount, streak } atau { remainingMs }
eco.transfer(userA, userB, 100)

const modeMalam = createGroupScheduler()
modeMalam.add({ group, action: 'close', at: '22:00' })  // hanya admin
modeMalam.add({ group, action: 'open',  at: '06:00' })  // semua bisa chat
modeMalam.start(sock)

const verifier = createVerifier({ timeoutMs: 120_000 })
verifier.bind(sock) // captcha matematika otomatis untuk member baru
verifier.onChallenge(({ chat, user, question }) =>
    sock.sendMessage(chat, { text: `👋 @${user.split('@')[0]} verifikasi: ${question}`, mentions: [user] }))
verifier.onFailed(({ chat, user }) => sock.groupParticipantsUpdate(chat, [user], 'remove'))

// upgrade router — guard & menu berkategori:
router.command('kick', handler, { adminOnly: true, category: 'Admin' })  // otomatis khusus grup: ditolak di DM
router.command('shutdown', handler, { ownerOnly: true })         // owners: [...] di createRouter
router.command('daily', handler, { cooldownMs: 60_000, category: 'Economy' })
```

```js
// analitik, anti-tagall, toko, backup grup & menfess
import {
    createCommandStats, createAntiTagAllGuard, createShop,
    backupGroup, diffGroupBackup, restoreGroupSettings, createMenfessRelay
} from '@japofc/baileys'

const stats = createCommandStats()
router.use(stats.middleware())          // hitung setiap command yang jalan
stats.getTopCommands(5); stats.getBusiestHours()

const antiTag = createAntiTagAllGuard({ threshold: 5, autoDelete: true })
antiTag.bind(sock)
antiTag.onDetected(({ sender, hidden }) => console.log(sender, hidden ? 'hidetag!' : 'tag-all'))

const toko = createShop(eco)            // nyambung ke createEconomy()
toko.addItem({ id: 'potion', name: 'Potion', price: 250, consumable: true })
toko.buy(user, 'potion', 2); toko.useItem(user, 'potion')
eco.bet(user, 100, { winChance: 0.5, multiplier: 2 }) // upgrade economy

const backup = await backupGroup(sock, groupJid)      // setting + member, aman disimpan
const diff = await diffGroupBackup(sock, backup)      // joined/left/promoted/changed
await restoreGroupSettings(sock, backup)              // subjek, deskripsi, kunci grup

const menfess = createMenfessRelay()
menfess.bind(sock)
await menfess.start(sock, sender, targetJid, 'pesan anonim pertama')
// kedua pihak chat lewat bot sebagai Anon-1 / Anon-2 sampai kirim "stop"

// upgrade lain: verifier { challenge: 'emoji' }, rank level (Newbie→Legend)
```

```js
// catatan, ulang tahun, game, i18n, menu keren & permintaan join
import {
    createNotes, createBirthdayManager, createGuessGame,
    createI18n, styleText, createJoinRequestManager
} from '@japofc/baileys'

const notes = createNotes()
notes.set(chat, 'rules', 'Dilarang spam. Santun.')  // !save rules …
notes.get(chat, 'rules')?.content                   // !get rules

const ultah = createBirthdayManager()
ultah.set(user, { day: 17, month: 8, year: 2000, chat })
ultah.onBirthday(({ user, age, chat }) =>
    sock.sendMessage(chat, { text: `🎂 HBD @${user.split('@')[0]} (${age})!`, mentions: [user] }))
ultah.start()

const game = createGuessGame({ timeoutMs: 60_000 })
game.bind(sock)
game.start(chat, { answer: 'Jakarta', hint: 'ibukota', reward: 500 })
game.onCorrect(({ user, reward }) => eco.add(user, reward, 'menang kuis'))

const i18n = createI18n({ defaultLang: 'id' })
i18n.addLanguage('en', { greet: 'Hello {name}!' })
i18n.setChatLang(chat, 'en')                        // !lang en
i18n.tFor(chat, 'greet', { name: 'Budi' })

styleText('Menu Bot', 'bold')                       // 𝗠𝗲𝗻𝘂 𝗕𝗼𝘁

const joins = createJoinRequestManager({ denylist: [spammer] })
joins.bind(sock)                                    // event join-request live
joins.onRequest(({ user, approve, reject }) => approve())
await joins.sweep(sock, groupJid)                   // proses daftar pending

// upgrade CLI: npx @japofc/baileys sticker in.webp out.webp --pack "Pack Gue" --author gue
```

```js
// perkakas sesi & sistem
import {
    analyzeAuthState, repairAuthFolder,
    exportAuthToString, importAuthFromString, migrateFolderToAuthState,
    backupAuthStateRotating, createShutdownManager
} from '@japofc/baileys'

const laporan = await analyzeAuthState('./auth')    // dokter sesi
laporan.registered; laporan.counts; laporan.corrupted
await repairAuthFolder('./auth')                    // karantina file rusak

// kirim seluruh login sebagai SATU string (pola SESSION_ID) — rahasiakan!
const sessionString = await exportAuthToString('./auth')
await importAuthFromString(sessionString, './auth') // di perangkat baru

// pindahkan sesi folder ke adapter apa pun (SQLite/Redis/Mongo/single-file):
const { state, saveCreds } = await useSQLiteAuthState('auth.db')
await migrateFolderToAuthState('./auth', state, saveCreds)

// backup terenkripsi bertimestamp yang bersih-bersih sendiri:
await backupAuthStateRotating('./auth', './backups', { password, keep: 5 })

// ganti password auth (atau enkripsi folder plaintext lama) tanpa kehilangan sesi:
await rotateAuthPassword('./auth', { oldPassword: lama, newPassword: baru })
// → { rotated: 112, migratedFromPlaintext: 0, failed: [], skipped: [] }

const shutdown = createShutdownManager({ sock, saveCreds })
shutdown.register('tutup db', () => db.close())
shutdown.attach()                                   // SIGINT/SIGTERM → keluar rapi
```

```bash
# CLI: kelola sesi tanpa nulis kode
npx @japofc/baileys session analyze ./auth
npx @japofc/baileys session repair  ./auth
npx @japofc/baileys session export  ./auth --out session.txt
npx @japofc/baileys session import  session.txt ./auth-baru
```

```js
// wizard, webhook, link, perkakas media & kesehatan
import {
    createConversationFlow, createWebhookBridge, buildWaMeLink, parseWaLink,
    getImageDimensions, createMediaGuard, createHealthMonitor
} from '@japofc/baileys'

const flows = createConversationFlow()
flows.define('order', [
    { id: 'item', prompt: 'Mau pesan apa?' },
    { id: 'qty', prompt: 'Berapa banyak?', validate: t => /^\d+$/.test(t) || 'Angka saja!' }
])
flows.bind(sock)
await flows.start(sock, chat, sender, 'order')   // mis. dari command !order
flows.onComplete(({ answers }) => console.log(answers.qty, 'x', answers.item))

const bridge = createWebhookBridge('https://server.gue/hook', { secret, retries: 2 })
bridge.bind(sock)                                // pesan → backend/n8n lu

buildWaMeLink('+62 812-3456-7890', 'Halo!')      // https://wa.me/62812…?text=Halo%21
parseWaLink('https://chat.whatsapp.com/AbC…')    // { type: 'group-invite', code }

getImageDimensions(buffer)                       // { format: 'png', width, height }

const media = createMediaGuard({ blocked: ['sticker'], autoDelete: true })
media.bind(sock)                                 // "dilarang stiker di grup ini"

const health = createHealthMonitor({ thresholds: { heapUsedMb: 400, eventLoopLagMs: 200 } })
health.onAlert(({ metric, value }) => sock.sendMessage(owner, { text: `⚠️ ${metric}: ${value}` }))
health.start()
```

```js
// pengerasan keamanan & stabilitas
import {
    createBugShield, sanitizeText, installCrashGuard,
    createConnectionWatchdog, createSecureLogger,
    exportAuthToString, checkAuthPermissions, hardenAuthFolder, autoReconnect
} from '@japofc/baileys'

const shield = createBugShield({ autoDelete: true })   // anti pesan bug
shield.bind(sock)
shield.onDetected(({ sender, reasons }) => gate.banUser(sender, reasons.join(',')))
sanitizeText(teksKotor)                                // buang RTLO/zalgo/banjir invisible

installCrashGuard({                                     // bot tak pernah mati diam-diam
    onError: ({ type, error }) =>
        sock.sendMessage(owner, { text: `💥 ${type}: ${error?.message}` }).catch(() => {})
})

const watchdog = createConnectionWatchdog({ staleMs: 5 * 60_000 })
watchdog.bind(sock)
watchdog.onStale(() => sock.end(new Error('koneksi basi'))) // auto-reconnect ambil alih
watchdog.start()

const logger = createSecureLogger()                     // kredensial TAK PERNAH masuk log
const sock2 = makeWASocket({ auth: state, logger })

await exportAuthToString('./auth', { password })        // export JAPSESS2 terenkripsi AES
await hardenAuthFolder('./auth')                        // chmod 700/600 semuanya
await checkAuthPermissions('./auth')                    // audit kebocoran izin file

autoReconnect(factory, {
    onGiveUp: ({ reason, attempts }) => kabariOwner(reason) // baru: hook nyerah + getStatus()
})
```

```js
// kartu JAP AI dari markdown, perkakas panggilan, presence & pintasan button
import { AIRich, createCallLog, createCallGuard, createAlwaysOnline,
         createStatusWatcher, quickButtons, sendConfirm } from '@japofc/baileys'

// satu kartu AI utuh dari string markdown (heading/kode/tabel otomatis)
await AIRich.fromMarkdown('# Laporan\n\n```js\nconst x = 1\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |', sock).send(jid)
new AIRich(sock).addChecklist([{ text: 'sudah', done: true }, 'belum'])
    .addKeyValue({ Nama: 'JAP', Versi: '2.4.5' })
    .addProgressBar('Unduhan', 70, 100)

const callLog = createCallLog()                // siapa nelpon, hasil, durasi
callLog.bind(sock)
createCallGuard({                              // jam tenang + blokir keras
    autoReject: true,
    schedule: { from: '22:00', to: '06:00' },  // tolak hanya malam hari
    denylist: [pengganggu]                     // …kecuali mereka: selalu
}).bind(sock)

createAlwaysOnline(sock).start()               // titik hijau nyala terus
const statuses = createStatusWatcher()         // simpan story kontak
statuses.bind(sock)
statuses.onStatus(({ download }) => download())

await sendConfirm(sock, jid, 'Hapus semua data?')           // confirm_yes/confirm_no
await sendButtons(sock, jid, { text: 'Pilih', buttons: quickButtons(['A', 'B']) })

// ronde 50+ — perkakas harian:
import { rollDice, matchScore, phoneToJid, prettyPhone, formatRelative,
         getGroupAdmins, diffParticipants, summarizeMessage, createKVStore } from '@japofc/baileys'

rollDice('2d6+3')                       // { rolls: [4, 2], total: 9 }
matchScore('budi', 'ani')               // 0-100, "jodoh meter" deterministik
phoneToJid('+62 812-3456-7890')         // 6281234567890@s.whatsapp.net
prettyPhone('6281234567890')            // +62 812-3456-7890
formatRelative(msg.timestamp)           // '5m ago'
getGroupAdmins(await sock.groupMetadata(jid))
summarizeMessage(msg)                   // '📷 image: caption…' buat log

const db = await createKVStore('./botdata.json')   // DB persisten mini
db.namespace('settings').set(jid, { welcome: true })

// paket anti-ban — nomor baru, aksi grup aman, reconnect cerdas
import { createAccountWarmup, classifyDisconnect, explainDisconnect,
         createGroupOpGuard, randomGaussian, createPresenceCycler } from '@japofc/baileys'

const warmup = createAccountWarmup({ startedAt: loginPertamaTs })
if (warmup.trySend().allowed) await sock.sendMessage(jid, content)
// hari 1 → 20 pesan, lalu 50, 100, 200, 400, 800, bebas

sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection !== 'close') return
    const verdict = classifyDisconnect(lastDisconnect)
    verdict.shouldReconnect ? restart() : console.log(explainDisconnect(lastDisconnect))
    // 🔑 [auth 401] Keluar dari HP — sesi hilang, pairing ulang.
})

const ops = createGroupOpGuard()
const safe = ops.wrap(sock)                        // otomatis dijaga
await safe.groupParticipantsUpdate(jid, users, 'add') // throw kalau lewat ~3 add/10 menit

await sleep(randomGaussian(2000, 600, { clamp: [500, 5000] })) // jeda ala manusia
createPresenceCycler(sock, { chats: [ownerJid] }).start()      // aktivitas opt-in

// acara komunitas — giveaway, absen, lelang, polling
import { createGiveaway, createAttendance, createAuction, createTextPoll } from '@japofc/baileys'

const giveaway = createGiveaway({ keyword: 'ikut' })
giveaway.bind(sock)
giveaway.start(chat, { prize: 'Voucher 50k', durationMs: 3600_000, winners: 2 })
giveaway.onEnd(({ winners }) => umumkan(winners))        // adil, RNG bisa diinjeksi

const absen = createAttendance()
absen.bind(sock)
absen.open(chat, { title: 'Absen Pagi 🌞' })             // member ketik "absen"
await sock.sendMessage(chat, { text: absen.render(chat), mentions: absen.getMentions(chat) })

const lelang = createAuction()
lelang.start(chat, { item: 'Akun ML', startBid: 50_000, minIncrement: 5_000, antiSnipeMs: 30_000 })
lelang.bid(chat, user, 60_000)                           // → accepted / too-low / already-leading
lelang.onEnd(({ winner, amount }) => terjual(winner, amount))

const polls = createTextPoll()
polls.bind(sock)                                          // vote = balasan angka "1".."9"
polls.start(chat, { question: 'Mabar jam?', options: ['19:00', '20:00', '21:00'] })
polls.onEnd(({ results }) => sock.sendMessage(chat, { text: polls.formatResults(results) }))

// paket game — duel & permainan kata
import { createTicTacToe, createRPS, scrambleWord, generateMathProblem,
         createWordChain } from '@japofc/baileys'

const ttt = createTicTacToe()
ttt.challenge(chat, penantang, lawan); ttt.accept(chat, lawan)
ttt.play(chat, user, 5)                      // kotak 1-9 → next/menang/seri
await sock.sendMessage(chat, { text: ttt.render(chat) }) // papan emoji ❌⭕3️⃣

const suit = createRPS()
suit.challenge(chat, a, b, { bet: 5000 }); suit.accept(chat, b)
suit.pick(chat, a, 'batu')                   // pilihan tetap rahasia
suit.onResult(({ winner, loser, bet }) => eco.transfer(loser, winner, bet))

game.start(chat, { answer: scrambleWord('bandung') })       // acak kata
game.start(chat, generateMathProblem('hard'))               // 17 × 8 - 24 = ?
const sambung = createWordChain()                           // sambung kata
sambung.start(chat, { firstWord: 'makan' })
await sambung.play(chat, user, 'nasi')       // ✅ n… — skor = panjang kata

eco.rob(maling, korban)  // upgrade: rampok dompet — uang bank tetap aman

// operasional bisnis bot — sewa, aktivitas, kunci
import { createRentalManager, createMessageCounter, createCommandLock } from '@japofc/baileys'

const sewa = createRentalManager()
sewa.add(groupJid, { days: 30 }); sewa.startTrial(grupBaru, { days: 3 })
sock.ev.on('messages.upsert', sewa.filter(handler))   // grup belum sewa diabaikan
sewa.onExpiring(({ chat }) => ingatkan(chat))          // pengingat perpanjang (24 jam)
sewa.onExpire(({ chat }) => sock.groupLeave(chat))
sewa.startSweeper()

const counter = createMessageCounter()
counter.bind(sock)
counter.renderDigest(chat)   // 🥇 @user — 42 pesan (top chatter harian)

const locks = createCommandLock({ owners: [ownerJid] })
locks.lock(chat, 'slot'); locks.lockGlobal('rob')
router.use(locks.middleware())                         // diblokir sebelum handler jalan
locks.setMaintenance(true, { message: '🛠️ maintenance' }) // owner tetap lolos

// SAPUAN UPGRADE BESAR (36 upgrade di seluruh toolkit):
// kv TTL + getOrSet · pin catatan 📌 · prioritas todo 🔴🟡 · pengingat
// berulang · warns.renderList · eco.getEconomyStats + eco.work() kerja ·
// shop.renderCatalog · tiers.extendAll (kompensasi downtime) ·
// quota.renderStatus · PRESTIGE level ⭐ · guess.revealHint('j_k__t_') ·
// rekor menang/kalah ttt + leaderboard · suit best-of-3 · syarat ikut
// giveaway (canJoin) · streak absen · harga beli-langsung lelang ·
// poll renderLive bar · menfess.listActiveSessions · afk.renderAfkList ·
// shield.getReasonStats · gate.banMany (bersih-bersih raid) · warmup.skip ·
// opGuard.waitAndAssert · watchdog autoRestart · sparkline kesehatan ▁▅▃█ ·
// command tersembunyi router + ctx.quotedText · i18n.addLanguages ·
// stats.renderTop · m.timestampMs · tag-all dipecah utk grup raksasa ·
// isForwarded/getForwardInfo · rental.renderList
//
// RONDE HUNT/UPDATE (ekosistem fork tuntas disapu — 0 gap tersisa):
// Versi WA → live 2.3000.1048680055 · backWords flow ('kembali' mundur) ·
// polling kondisional ETag/304 url-watcher · timeout probe health ·
// throttle alert crash-guard · batas body webhook · link bisnis
// wa.me/message/CODE · formatParticipantChanges(➕➖⬆️⬇️) · boxText('MENU') ╔═╗ ·
// reminders.renderList

// upgrade conversation-flow: langkah pilihan
flows.define('order', [{ id: 'size', prompt: 'Ukuran:', choices: ['S', 'M', 'L'] }])
// dirender bernomor; jawaban diterima via teks ATAU angka
// CLI: npx @japofc/baileys wa → versi paket + versi WA Web bawaan

// +18 upgrade: titleCase/slugify/generateId, shop.updateItem, notes.exportText,
// warns.getTop, stats.getTopChats, i18n.formatNumber/formatDate, levels.getRankPosition,
// quota.getAllUsage, tiers.renderStatus, birthday.renderUpcoming, guess.startNumberGame,
// flood.getTopFlooders, gate.listBans, health.setThreshold, watchdog.getReport

// 10 upgrade lain: ban sementara gate.banUser(jid, r, { expiresInMs }),
// flood autoMuteMs + isMuted, eco.applyInterest(0.01) bunga bank,
// item toko maxPerUser, warns.decay(30 hari), levels.setMultiplier(2) event XP,
// quota.setLimit live, tiers.getExpiring(3 hari) cron perpanjangan,
// reminders.snooze(id, 10m), todos.setDue + getOverdue (⏰ di render)
```

#### Helper metadata grup / komunitas (v2.4.7)

```js
import { extractLIDPNPairs, GROUP_PARTICIPANTS_CHUNK_SIZE } from '@japofc/baileys'

// Semua pasangan LID↔PN yang sudah dibawa oleh satu kali fetch metadata —
// ternormalisasi + tanpa duplikat. Socket kini menyimpannya otomatis pada
// groupMetadata() / groupFetchAllParticipating() / communityMetadata(), jadi
// getLIDForPN() dan getPNForLID() langsung mengenali anggota grup tanpa
// round-trip USync tambahan.
const meta = await sock.groupMetadata(jid)
extractLIDPNPairs(meta)        // [{ lid: '999@lid', pn: '628…@s.whatsapp.net' }, …]
extractLIDPNPairs(cachedMeta)  // murni + aman-null — bisa untuk metadata cache

GROUP_PARTICIPANTS_CHUNK_SIZE  // 25 — array peserta dipecah per ukuran ini
```

> Ikut diperbaiki di v2.4.7: metadata grup tidak lagi mengembalikan `NaN` untuk
> `subjectTime` / `creation` / `descTime` saat WhatsApp tidak mengirimnya (sekarang
> `undefined`, jadi tidak tersimpan sebagai `null`), dan metadata komunitas akhirnya
> melaporkan `addressingMode` serta menghormati atribut `size` dari server — keduanya
> sebelumnya berbeda hasil dari parser grup untuk payload yang sama.

#### Helper notifikasi grup `w:gp2` (v2.4.7)

```js
import { resolveNotificationActors, extractNotificationLIDPNPairs,
         parseNotificationParticipants } from '@japofc/baileys'

// Siapa pelakunya dan siapa targetnya — diselesaikan sebagai SATU KESATUAN. Sebelum
// v2.4.7 kedua sisinya jatuh ke fallback secara terpisah, jadi permintaan gabung bisa
// melaporkan LID pemohon berdampingan dengan nomor telepon admin.
const actors = resolveNotificationActors(notificationNode, actionChild)
// { actingLid, actingPn, actingUsername, affectedLid, affectedPn, affectedIsActor }

parseNotificationParticipants(actionChild)        // bentuk messageStubParameters
extractNotificationLIDPNPairs(node, actionChild)  // [{ lid, pn }] — hanya pasangan konsisten

// Socket kini menyimpan pasangan itu otomatis pada setiap notifikasi grup, dan pasangan
// basi bisa dihapus setelah event ganti nomor:
await sock.signalRepository.lidMapping.removeMapping('628…@s.whatsapp.net')
```

#### Diagnostik sinkronisasi app-state (v2.4.8)

```js
await sock.appStateSyncStatus()
// [ { name: 'critical_block', version: 0,  synced: false, mutations: 0 },
//   { name: 'regular_high',   version: 41, synced: true,  mutations: 183 }, … ]

await sock.appStateSyncStatus('regular_high')   // satu koleksi saja
await sock.resyncAppState(['regular_high'], false)
```

`version` = titik lanjut yang akan diminta ke server pada resync berikutnya, `synced` = apakah
kita punya state untuk koleksi itu sama sekali, `mutations` = berapa entri indeks yang dilacak
LT-hash — tiga angka yang benar-benar kamu butuhkan saat state chat (mute/arsip/pin) berhenti
mengikuti HP. Nama koleksi yang tidak dikenal gagal 400, bukan diam-diam kosong.

#### Download media sebagian (v2.4.8)

```js
// Intip tipe file sebenarnya sebelum menarik video 50 MB
const head = await sock.downloadMediaHeader(msg, 32)          // 32 byte plaintext pertama
const isMp4 = head.subarray(4, 8).toString() === 'ftyp'

// Potongan sesukamu: { start, end } (end eksklusif) atau { start, length }
const slice = await sock.downloadMediaRange(msg, { start: 1_000_000, length: 65_536 })

// Lanjutkan transfer yang terputus — semua byte dari N ke belakang
const rest = await sock.downloadMediaRange(msg, { start: bytesAlreadyOnDisk })
```

Keduanya lewat jalur pemulihan media kedaluwarsa yang sama dengan `sock.downloadMedia()` (410/404
→ minta HP re-upload → coba lagi sekali); pakai `{ disableRetry: true }` kalau tidak mau. Fungsi
lepasnya, `downloadMediaRange()` / `downloadMediaHeader()`, juga diekspor. Range divalidasi di
depan — `start` negatif, jendela kosong, atau mengirim `end` dan `length` sekaligus langsung
gagal 400, bukan error stream yang membingungkan. (Sebelum v2.4.8, range dengan `startByte` saja
menghasilkan **nol byte**; lihat BUGREPORT 2.77.)

#### Helper koneksi media & daftar perangkat (v2.4.7)

```js
import { parseMediaConnNode, isMediaConnExpired, MEDIA_CONN_DEFAULT_TTL,
         dedupeJidsByUser, dedupeDeviceList } from '@japofc/baileys'

// Handshake <media_conn>, diurai dengan aman. Sebelum v2.4.7 `ttl` yang hilang atau
// bukan angka menjadi NaN, dan `now - fetchDate > NaN * 1000` selalu false — jadi
// koneksi upload tak pernah di-refresh lagi dan terus memakai token auth basi.
const media = parseMediaConnNode(mediaConnNode)
// { hosts, auth, ttl, fetchDate } — ttl tak pernah NaN; jatuh ke 300 detik
MEDIA_CONN_DEFAULT_TTL              // 300

isMediaConnExpired(media)           // false selama masih segar
isMediaConnExpired({ ttl: NaN })    // true — apa pun yang tak terpakai dianggap kedaluwarsa

// Dedup yang mempertahankan urutan, dipakai fan-out perangkat USync. Mengirim pesan
// ke nomor sendiri dulu mendata (dan mengenkripsi ke) setiap perangkat Anda dua kali.
dedupeJidsByUser([{ jid: a }, { jid: a }, { jid: b }])   // → [a, b]
dedupeDeviceList(devices)  // kunci: user + indeks device; `u@s` === `u:0@s`
```

#### Membaca error USync (v2.4.7)

```js
import { extractUSyncErrors, hasUSyncQueryError, USyncQuery, USyncUser } from '@japofc/baileys'

const result = await sock.executeUSyncQuery(
    new USyncQuery().withContactProtocol().withUsers(
        new USyncUser().withPhone('+628111'),
        new USyncUser().withPhone('+628222')
    )
)

// Sebelum v2.4.7 query yang ditolak ("rate overlimit") terurai jadi list kosong yang
// persis sama dengan "tidak ada yang cocok". Kini error server ikut di hasil.
result.errors            // [{ code: 479, text: 'rate overlimit' }]
hasUSyncQueryError(result.errors)   // true -> seluruh query gagal, jangan percaya `list`
                                    // false -> hanya user tertentu yang gagal (entri punya `jid`)

extractUSyncErrors(rawIqNode)       // ekstraksi yang sama, mandiri dan null-safe

// onWhatsApp() kini benar-benar menerima argumen @lid (dulu dibuang diam-diam), selalu
// mengembalikan array, dan memberi tahu LID asal setiap entri:
await sock.onWhatsApp('628111@s.whatsapp.net', '99887766@lid')
// [{ jid: '628111@s.whatsapp.net', exists: true, lid: undefined }, …]
```

#### Helper kamus store & daftar peserta (v2.4.7)

```js
import { makeOrderedDictionary } from '@japofc/baileys'
import { upsertParticipants, removeParticipants, setParticipantsAdmin } from '@japofc/baileys'

// Memulihkan snapshot dulu mengganti array tapi tidak indeks id-nya, jadi setiap pesan
// kembali dalam keadaan tak terlihat oleh get() dan upsert ulang malah menambah duplikat.
const dict = makeOrderedDictionary(m => m.key.id)
dict.fromJSON(JSON.parse(snapshot))
dict.get('AAA')          // pesan yang dipulihkan, bukan undefined
dict.update(versiBaru)   // true kalau benar-benar ter-update (dulu selalu false)
dict.has('AAA')          // baru di v2.4.7
dict.size()              // baru di v2.4.7

// Mutasi daftar peserta: mempertahankan urutan, tidak memutasi input, dan mencocokkan
// orang lewat `id` ATAU `phoneNumber` (dua sisi pasangan LID<->PN = anggota yang sama).
upsertParticipants(list, [{ id: '2@lid' }])        // merge, tidak pernah duplikat
setParticipantsAdmin(list, [{ id: '1@lid' }], null) // demote -> admin: null (bukan false)
removeParticipants(list, [{ phoneNumber: '628…@s.whatsapp.net' }])
```

#### Round-trip repositori label (v2.4.7)

```js
import { ObjectRepository } from '@japofc/baileys'

// toJSON() menghasilkan array, tapi constructor-nya hanya paham map { id: entity }, jadi
// memasukkan snapshot kembali menghasilkan entri ber-key '0', '1', … dan semua label hilang.
const labels = new ObjectRepository({ L1: { id: 'L1', name: 'Work' } })
const restored = ObjectRepository.fromJSON(JSON.parse(JSON.stringify(labels)))
restored.findById('L1')   // { id: 'L1', name: 'Work' } — bukan undefined
restored.hasId('L1')      // baru di v2.4.7
restored.load([{ id: 'L2', name: 'Family' }])
restored.clear()
```

#### Klasifikasi daftar chat (v2.4.7)

```js
import { classifyMessage, isMissedCallMessage, MISSED_CALL_STUB_TYPES } from '@japofc/baileys'

// Sebelum v2.4.7 panggilan tak terjawab tak pernah bisa jadi pesan "nyata" — cek konten
// ikut di-AND ke cabang stub — jadi chat-nya tak pernah naik ke atas daftar.
classifyMessage(missedCallStub, meId)
// { isReal: true, isStub: true, isMissedCall: true, isAboutMe: false,
//   incrementsUnread: false, contentType: undefined }

classifyMessage(textMessage, meId).contentType   // 'conversation'
isMissedCallMessage(msg)                         // true untuk 4 stub panggilan tak terjawab
MISSED_CALL_STUB_TYPES                           // tabelnya sendiri
```

#### Membaca `messageStubParameters` (v2.4.7)

```js
import { parseStubParticipant, stubParticipantIdentities, stubParticipantsInclude } from '@japofc/baileys'

// Parameter stub bentuknya tak seragam: pasangan JSON untuk sebagian tipe, jid polos untuk lainnya.
parseStubParticipant('{"lid":"1@lid","pn":"2@s.whatsapp.net"}')  // { lid, pn }
parseStubParticipant('628111@s.whatsapp.net')                    // { phoneNumber }
stubParticipantIdentities(p)   // semua jid yang bisa dipakai menyapa orang ini

// "Apakah salah satunya saya?" — cek lid DAN pn, jadi grup ber-LID ikut cocok.
stubParticipantsInclude(msg.messageStubParameters, sock.user.id, sock.user.lid)
```

> Permintaan gabung lewat invite link kini juga memancarkan `group.join-request` (dulu
> hanya varian admin-add), jadi `createJoinRequestManager()` bisa melihatnya.

```js
// ronde 20+: perkakas teks, pengingat, jatah, tier, todo & lainnya
import {
    readMore, progressBar, formatDuration, chunkText, similarity,
    parseDuration, createReminderManager, createQuotaManager,
    createTierManager, createTodoList, createUrlWatcher, getZodiac
} from '@japofc/baileys'

readMore('Promo!', 'detail panjang…')     // tersembunyi di balik "Baca selengkapnya"
progressBar(70, 100)                      // ███████░░░ 70%
formatDuration(93_784_000)                // 1d 2h 3m
chunkText(teksPanjang, 4000)              // pecah sesuai batas WA

const reminders = createReminderManager()
reminders.add({ chat, user, text: 'angkat gorengan', inMs: parseDuration('10m') })
reminders.onDue(({ chat, user, text }) =>
    sock.sendMessage(chat, { text: `⏰ @${user.split('@')[0]} ${text}`, mentions: [user] }))

const tiers = createTierManager()
tiers.setTier(user, 'premium', { days: 30 })
const quota = createQuotaManager({ defaultLimit: 20, limits: { premium: 200 } })
if (!quota.consume(sender, tiers.getTier(sender)?.name).allowed) return ctx.reply('Jatah habis!')

const todos = createTodoList()
todos.add(chat, 'bayar wifi', { assignee: member })
await sock.sendMessage(chat, { text: todos.render(chat), mentions: todos.mentions(chat) })

const watcher = createUrlWatcher('https://api.contoh.com/status.json', { intervalMs: 60_000 })
watcher.onChange(({ body }) => sock.sendMessage(owner, { text: `🔔 berubah: ${body.slice(0, 300)}` }))
watcher.start()

// upgrade: eco.deposit/withdraw + eco.getRank, levels.renderRankCard,
// router { onUnknownCommand } + router.remove, i18n.tn bentuk jamak,
// styleText 'negativeSquared'/'boldFraktur', getZodiac(17, 8) → 'Leo',
// hint "dikit lagi!" guess-game, formatHealthSnapshot buat DM owner
```
| `stickerpack` | Bangun dan kirim paket stiker (termasuk animasi/Lottie) |
| `templates` | Helper pesan template WhatsApp Business lama |
| `vcard` | Bangun payload vCard (kartu kontak) |
| `status` | Posting dan kelola update Status WhatsApp |
| `event-buffer` | Buffer/gabungkan event socket bervolume tinggi untuk bot berat |
| `doctor` | `checkEnvironment()` / `printEnvironmentReport()` — diagnosa lingkungan sekali panggil |

Setiap modul di atas punya `.d.ts` pasangan, jadi editormu menampilkan dokumentasi hover lengkap apa pun yang kamu import.

</details>

<div align="right"><a href="#top">⬆ kembali ke atas</a></div>

---
