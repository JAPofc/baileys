<div align="center" id="top">

<img src="./Media/japofc-logo.png" width="140" alt="Logo JAPofc" />

# @japofc/baileys

### ⚡ WhatsApp Web API yang dirawat serius untuk Node.js

<em>ESM typed&nbsp;·&nbsp;versi WA&nbsp;Web selalu terkini&nbsp;·&nbsp;tooling protokol aman&nbsp;·&nbsp;140+ utilitas bot siap produksi</em>

<br/>

<!-- identitas -->
<p>
<a href="https://www.npmjs.com/package/@japofc/baileys"><img src="https://img.shields.io/npm/v/@japofc/baileys?color=25D366&label=npm&logo=npm&logoColor=white&style=for-the-badge" alt="versi npm" /></a>
<a href="https://www.npmjs.com/package/@japofc/baileys"><img src="https://img.shields.io/npm/dt/@japofc/baileys?color=128C7E&label=unduhan&logo=npm&logoColor=white&style=for-the-badge" alt="unduhan npm" /></a>
<a href="./LICENSE"><img src="https://img.shields.io/badge/lisensi-GPL--3.0--atau--lebih--baru-555?style=for-the-badge" alt="lisensi GPL-3.0-or-later" /></a>
</p>

<!-- kualitas -->
<p>
<img src="https://img.shields.io/badge/node-%E2%89%A5%2020-3C873A?style=flat-square&logo=node.js&logoColor=white" alt="Node >=20" />
<img src="https://img.shields.io/badge/module-ESM-F7DF1E?style=flat-square&logo=javascript&logoColor=black" alt="ESM only" />
<img src="https://img.shields.io/badge/types-bundled%20.d.ts-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="tipe TypeScript" />
<img src="https://img.shields.io/badge/tes-1804%20lulus-2ecc71?style=flat-square&logo=nodedotjs&logoColor=white" alt="tes lulus" />
<img src="https://img.shields.io/badge/audit-0%20kerentanan-2ecc71?style=flat-square&logo=npm&logoColor=white" alt="audit bersih" />
</p>

<p>
<a href="https://whatsapp.com/channel/0029VbEVFrILtOjAOu4FXa3r"><img src="https://img.shields.io/badge/Ikuti%20di%20WhatsApp-Channel%20JAPofc-25D366?style=for-the-badge&logo=whatsapp&logoColor=white" alt="Channel WhatsApp JAPofc" /></a>
</p>

<h4>

[📦 Instalasi](#instalasi)&nbsp;·&nbsp;[🚀 Mulai cepat](#mulai-cepat)&nbsp;·&nbsp;[🔥 Fitur](#-fitur)&nbsp;·&nbsp;[💡 Contoh](#-contoh-pemakaian)&nbsp;·&nbsp;[📘 TypeScript](#-dukungan-typescript)&nbsp;·&nbsp;[❓ FAQ](#-faq--troubleshooting)&nbsp;·&nbsp;[🇬🇧 English](./README.md)

</h4>

</div>

---

<table>
<tr>
<td width="33%" valign="top" align="center">

### 🔌 Inti yang andal

Socket stabil, resolusi versi WA-Web otomatis, toolkit reconnect + anti-ban — **tanpa efek samping tersembunyi**.

</td>
<td width="33%" valign="top" align="center">

### 🧩 Lengkap sejak awal

Tombol, native flow, carousel, kartu AIRich, poll, channel, VoIP, dan **140+ utilitas bot**.

</td>
<td width="33%" valign="top" align="center">

### 🛡️ Siap produksi

`.d.ts` bawaan, auth multi-backend, redaksi kredensial, session tools — **1804 tes, 0 kerentanan**.

</td>
</tr>
</table>

<details>
<summary><b>📑 Daftar isi</b> — klik untuk buka</summary>

<br/>

> **Mulai** &nbsp;›&nbsp; [Instalasi](#instalasi) · [Mulai cepat](#mulai-cepat) · [Ringkasan](#ringkasan) · [Instalasi lengkap](#-instalasi) · [Autentikasi](#-autentikasi) · [Backend store](#-backend-store)
>
> **Isi paket** &nbsp;›&nbsp; [Perbandingan](#-perbandingan) · [Fitur](#-fitur) · [Peningkatan eksklusif J.AP](#-peningkatan-eksklusif-jap) · [Baru di v2.4.5](#-baru-di-v245)
>
> **Pesan** &nbsp;›&nbsp; [Contoh pemakaian](#-contoh-pemakaian) · [Helper pesan](#-helper-pesan) · [Channel, riwayat & transkrip](#-channel-riwayat--transkrip) · [Kejar-tayang WA 2026](#-kejar-tayang-wa-2026)
>
> **Panggilan & sync** &nbsp;›&nbsp; [Panggilan suara & video](#-panggilan-suara--video) · [Query sinkronisasi user](#-query-sinkronisasi-user) · [Manajemen username](#-manajemen-username)
>
> **Toolkit** &nbsp;›&nbsp; [Utilitas sehari-hari](#-utilitas-sehari-hari) · [Paket keamanan](#-paket-keamanan) · [Bot framework](#-bot-framework) · [Modul utilitas](#-modul-utilitas)
>
> **Referensi** &nbsp;›&nbsp; [Lingkungan yang direkomendasikan](#-lingkungan-yang-direkomendasikan) · [Dukungan TypeScript](#-dukungan-typescript) · [FAQ & troubleshooting](#-faq--troubleshooting) · [Kontribusi](#-kontribusi) · [Kredit](#-kredit) · [Maintainer](#-maintainer)

</details>

---

## Instalasi

```bash
npm i @japofc/baileys
```

Butuh Node.js 20+. Package ini ESM-only dan tidak memakai install/postinstall script.

## Mulai cepat

```js
import makeWASocket, { useMultiFileAuthState } from '@japofc/baileys'

const { state, saveCreds } = await useMultiFileAuthState('auth_info')
const sock = makeWASocket({ auth: state, printQRInTerminal: true })

sock.ev.on('creds.update', saveCreds)
sock.ev.on('messages.upsert', async ({ messages }) => {
  const msg = messages[0]
  if (!msg?.message || msg.key.fromMe) return
  await sock.sendMessage(msg.key.remoteJid, { text: 'pong' }, { quoted: msg })
})
```

## Ringkasan

`@japofc/baileys` adalah library WhatsApp Web untuk builder bot yang butuh socket stabil, deklarasi TypeScript lengkap, dan utilitas yang dirawat tanpa efek samping tersembunyi.

- Fallback versi WA Web terbaru plus `makeWASocketAuto()` untuk resolusi versi live.
- Deklarasi WAProto lengkap dan deep export untuk pemakaian dari package ter-install.
- Backend auth file, SQLite, Redis, MongoDB, MySQL, dan PostgreSQL.
- Interactive messages, native flow, carousel, AIRich, channel/newsletter, status helper, dan modul bot.
- Fetch media/link lebih aman, redaksi kredensial, tool sesi, helper reconnect, dan protocol-capture.
- **Tidak ada auto join/follow grup atau saluran.** Helper join/follow tetap tersedia, tapi hanya jalan kalau dipanggil eksplisit oleh kode kamu.

---

## 🆚 Perbandingan

Posisi `@japofc/baileys` dibanding library Baileys lain:

| Kemampuan | `@japofc/baileys` | Fork lain (umumnya) |
|---|:---:|:---:|
| Tombol Native Flow (V1/V2/V3) | ✅ | ⚠️ sebagian |
| Pesan carousel | ✅ | ❌ |
| Kartu respons kaya (AIRich) | ✅ | ❌ |
| Alur commerce (katalog/order/pembayaran) | ✅ | ⚠️ sebagian |
| Panggilan suara (VoIP) | ✅ eksperimental | ❌ |
| Store multi-backend (SQL/Mongo/Redis) | ✅ | ⚠️ sebagian |
| Definisi TypeScript `.d.ts` lengkap | ✅ | ⚠️ sebagian |
| Query sinkronisasi user (WAUSync) | ✅ | ✅ |
| Manajemen username (cek/set/pin/rekomendasi) | ✅ | ❌ |
| Framework bot (middleware, sesi, statistik) | ✅ | ❌ |
| Render QR bawaan (terminal/SVG/PNG, nol deps) | ✅ | ❌ butuh `qrcode-terminal` |
| Resolusi versi WA Web otomatis | ✅ | ❌ hardcoded |
| Mention di status (notifikasi user/grup) | ✅ | ❌ |
| Toolkit anti-ban (ramp pemanasan, batas aksi grup, klasifikasi disconnect, jitter Gaussian) | ✅ | ❌ |
| Perisai pesan crash (bom mention, zalgo, spoof RTLO) | ✅ | ❌ |
| Dokter sesi + string sesi portabel/terenkripsi | ✅ | ❌ |
| Modul komunitas/bot (economy, game, sewa, moderasi — 140+ utils) | ✅ | ❌ |
| Branding EXIF stiker | ✅ murni JS | ⚠️ butuh `node-webpmux` |
| CLI (`doctor` / `session` / `sticker` / `export` / `wa`) | ✅ | ❌ |
| Logger dengan redaksi kredensial | ✅ | ❌ |

> Tabel ini menggambarkan fitur di level package, bukan benchmark performa. PR untuk memperbarui/mengoreksi tabel ini dipersilakan lewat [Kontribusi](#-kontribusi).

---

## 🔥 Fitur

<table>
<tr>
<th align="center">💬 Pesan Interaktif</th>
<th align="center">🛒 Commerce & Bisnis</th>
<th align="center">🧩 Fitur Utilitas</th>
</tr>
<tr>
<td valign="top">

- Native Flow
- Tombol (V1 / V2 / V3)
- List
- Pesan Carousel
- Pesan Poll & Kuis
- Pesan Respons Kaya (AIRich)
- Kartu HTML (eksperimental)
- Tombol CTA / Reply / URL
- Tombol Panggilan
- Tombol OTP
- Tombol Autentikasi

</td>
<td valign="top">

- Pesan Katalog
- Detail Order
- Status Order
- Review & Bayar
- Status Pembayaran
- Metode Pembayaran
- Lacak Order
- Pesan Ulang
- Batalkan Order

</td>
<td valign="top">

- Dukungan Status Grup
- Mention Semua
- Dukungan Stiker Lottie
- Dukungan Newsletter
- Helper ExternalAdReply
- Dukungan View Once
- Format Teks Kaya
- Highlight Kode

</td>
</tr>
</table>

<table>
<tr>
<th align="center">🔐 Auth & Penyimpanan</th>
<th align="center">📞 Realtime</th>
<th align="center">🛠 Tooling Developer</th>
</tr>
<tr>
<td valign="top">

- Auth state multi-file
- Auth state satu file
- Auth state SQLite
- Auth state cache-manager
- Store in-memory
- Adapter store SQLite / MongoDB /
  MySQL / PostgreSQL / Redis

</td>
<td valign="top">

- Panggilan suara (VoIP, engine WASM)
- Query sinkronisasi user (WAUSync)
- Cek presence / status / perangkat
- Event buffer untuk bot trafik tinggi

</td>
<td valign="top">

- Definisi TypeScript lengkap (`.d.ts`)
- Deteksi anti-delete & anti-edit (pulihkan pesan terhapus, tangkap isi sebelum edit)
- Helper pencarian pesan
- Engine auto-reply
- Helper penjadwalan
- Manajer retry pesan

</td>
</tr>
</table>

---

## ✨ Peningkatan Eksklusif J.AP

### Perbaikan Status Grup Audio
Status audio memakai implementasi yang lebih kompatibel untuk menghindari error unsupported-version di klien WhatsApp lama.

### AIRich — builder pesan respons kaya
Builder chainable (`AIRich`, juga diekspor sebagai `AIJap` / `LeafRich` / `JapAI` / `JapRich`) dengan 40+ method `add*()`/`set*()` yang mencakup heading, teks berformat (hyperlink/sitasi/LaTeX), blok kode, tabel, kartu gambar/video/produk/post, kartu tugas & progres, banner tips, dan saran quick-reply — tampilan kartu kaya yang biasanya cuma kamu lihat dari bot AI/asisten resmi. Lihat [Contoh Pemakaian](#airich--kartu-respons-kaya) di bawah.

### Tombol interaktif

`sendMessage()` merutekan konten interaktif ke handler set, jadi semua ini terkirim sebagai
tipe pesan yang disebutkan — tanpa helper tambahan, tanpa `relayMessage` manual:

```ts
// shorthand native-flow: id = quick_reply, url = cta_url, copy = cta_copy,
// call = cta_call, sections = single_select, webview, flow, catalog, … (~30 buah)
await sock.sendMessage(jid, {
    text: 'Pilih satu',
    footer: 'powered by JAP',
    nativeFlow: [
        { text: 'Ya', id: '.ya' },
        { text: 'Buka', url: 'https://example.com' },
        { text: 'Salin kode', copy: 'JAP2026' }
    ]
})

// atau tombol native-flow buatan sendiri, untuk yang tak tercakup shorthand
await sock.sendMessage(jid, {
    text: 'Setuju?',
    title: 'Konfirmasi',
    interactiveButtons: [
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'Ya', id: '.ya' }) }
    ]
})
```

Jalur yang sama menangani `interactiveMessage`, carousel, `requestPaymentMessage`,
`productMessage`, `groupInviteMessage`, `eventMessage`, `pollResultMessage`, dan
`groupStatusMessage`. Semuanya mengembalikan `WAMessage` biasa dan tetap muncul di
`messages.upsert` seperti pengiriman lain. Beri `{ disableJapyea: true }` pada options bila
ingin memaksa pemakaian builder inti.

Bentuk tombol yang tidak cocok dengan shorthand mana pun kini **ditolak dengan error**,
bukan dikirim sebagai tombol kosong tak terlihat — jadi salah ketik gagal secara jelas.

### Mengetahui kapan sinkronisasi app-state hanya sebagian

`decodePatches()` tidak lagi berpura-pura sebuah koleksi sudah tersinkron padahal ada patch
yang gagal diterapkan. State yang dikembalikan adalah patch terakhir yang benar-benar
diterapkan **dan** terverifikasi, dan kegagalannya dilaporkan, bukan ditelan:

```js
const { state, mutationMap, incomplete, synced } = await decodePatches(/* … */)

if (!synced) {
    // incomplete = { version, reason: 'decode-failed' | 'lthash-mismatch', error? }
    console.warn(`app state berhenti di v${state.version}, patch v${incomplete.version} gagal`)
}
```

Simpan `state` seperti biasa — karena ia tidak pernah mendahului mutasi yang benar-benar
terkirim, resync berikutnya akan mengambil ulang patch yang hilang, bukan melewatinya.
Socket sudah melakukan ini untukmu: sinkronisasi yang tidak lengkap diulang dengan snapshot
penuh, sama seperti perlakuan untuk error sinkronisasi yang melempar.

### Membedakan disconnect yang fatal

Tidak semua close pantas di-reconnect. `classifyDisconnect()` memberi label, dan
`autoReconnect()` benar-benar menindaklanjutinya:

| close | yang terjadi |
| --- | --- |
| `connectionReplaced` (440) | **berhenti** — proses lain memegang sesi ini; reconnect = saling tendang |
| `forbidden` (403) | **berhenti** — nomor dibatasi; terus mencoba bisa memperparah |
| `multideviceMismatch` (411) | **berhenti** — wajib pairing ulang |
| `loggedOut` (401) | **berhenti** — kredensial sudah mati |
| `badSession` (500) | tetap mencoba, berhenti hanya setelah **3× berturut-turut** (`badSessionStreak`) |
| `connectionLost`, `timedOut`, `restartRequired`, … | reconnect dengan backoff, seperti sebelumnya |

```ts
const manager = autoReconnect(() => makeWASocket({ auth: state }), {
    badSessionStreak: 3, // default
    onFatal: ({ verdict, message, badSessions }) => {
        console.error(message) // "⚔️ [conflict 440] … ↳ FATAL: STOP this process. …"
        if (verdict.category === 'auth') void wipeAuthFolder()
    }
})
```

`explainDisconnect(code)` memberi satu baris untuk kode apa pun, dan
`explainDisconnect(code, { streak: 2 })` melaporkan `2/3 in a row — retrying` alih-alih
memvonis sesi rusak pada kegagalan decrypt pertama. Pakai `reconnectOnFatal: true` bila
ingin kembali ke perilaku lama (selalu reconnect).

### Mengambil dari intranet sendiri

Guard SSRF yang melindungi link preview dan `getHttpStream()` menolak alamat loopback,
privat, link-local, dan metadata cloud — termasuk IPv6 bentuk IPv4-mapped seperti
`[::ffff:169.254.169.254]`. Untuk menjangkau satu host internal tertentu, kecualikan host
itu saja alih-alih mematikan guard-nya:

```ts
await assertSafeHttpUrl(url, { allowHosts: ['media.lan', '127.0.0.1'] })
```

`allowPrivate: true` tetap ada, tapi itu mematikan pengecekan untuk **semua** host — pakai
`allowHosts` bila URL-nya bisa datang dari mana saja.

### Mengecek rate limit tanpa menghabiskannya

`createRateLimiter()` (dipakai `withPairingGuard`) bisa dimintai keputusan tanpa menyedot
jatah:

```ts
const { allowed, retryAfterMs } = limiter.peek(phoneNumber)
if (!allowed) {
    console.log(`coba lagi dalam ${Math.ceil(retryAfterMs / 1000)} detik`)
}

console.log(`sisa ${limiter.remaining(phoneNumber)} percobaan pairing jam ini`)
```

`peek()` tidak menyentuh jendela maupun `stats` — hanya `check()` yang memakai jatah.
Pairing guard kini memakai ini, jadi permintaan yang ditolak tidak lagi memakan kuota.

### Menjaga ukuran persistent store

`maxMessagesPerChat` hanya membatasi yang dimuat ke memori — backend tetap menyimpan semua
pesan yang pernah ditulis. Pangkas sendiri:

```ts
const stored = await store.countStoredMessages(jid) // yang benar-benar ada di disk
const removed = await store.pruneStoredMessages(jid, 5_000) // sisakan 5rb terbaru
```

`pruneStoredMessages()` menghapus dari yang paling lama dan mengembalikan jumlah baris yang
terhapus; `keep: 0` mengosongkan chat. Tampilan di memori tidak disentuh (sudah dibatasi).

### ffmpeg mana yang sedang dipakai?

```ts
import { inspectFfmpegPath, setFfmpegPath } from '@japofc/baileys'

const { path, source, rejected } = await inspectFfmpegPath()
console.log(path, 'via', source) // mis. '/usr/bin/ffmpeg via PATH'
for (const r of rejected) {
    console.warn(`dilewati ${r.source} "${r.path}": ${r.problem}`)
}
```

Kandidat hanya diterima bila berupa file biasa yang executable, jadi path yang kehilangan
bit `+x` — atau salah ketik di `FFMPEG_PATH` — akan dilewati alih-alih diserahkan ke
`spawn()`, dan deteksi otomatis tetap lanjut ke `ffmpeg-static` / binary sistem. Daftar
`rejected` memberi tahu persis apa yang dilewati dan alasannya.

### Menunggu sebuah event

`waitForEvent` menunggu event berikutnya yang cocok dan selalu melepas listener-nya di
setiap jalur keluar — resolve, timeout, abort, maupun predikat yang melempar error —
sehingga pola "kirim sesuatu, lalu tunggu event konfirmasinya" tidak lagi membocorkan
listener.

```ts
import { waitForEvent } from '@japofc/baileys'

// tunggu metadata satu grup tertentu
const update = await waitForEvent(sock.ev, 'groups.update', {
    pick: updates => updates.find(u => u.id === groupJid), // undefined = terus menunggu
    timeoutMs: 10_000
})

// atau ambil seluruh payload, pakai abort signal alih-alih timeout
const upsert = await waitForEvent(sock.ev, 'messages.upsert', {
    filter: up => up.type === 'notify',
    timeoutMs: 0,
    signal: controller.signal
})
```

Default `timeoutMs` 30 detik; isi `0` (atau negatif) untuk mematikannya. Ingat bahwa event
yang dibuffer datang sudah terkonsolidasi, jadi payload-nya adalah hasil flush — untuk
itulah `pick` ada.

### Kartu HTML — eksperimental

Surface respons-kaya WhatsApp juga membawa primitif **yang belum dirilis resmi**: ia merender
dokumen HTML/CSS/JS utuh di dalam kartu chat, lewat webview tersandbox milik klien. Nama
internalnya `FOAHtmlPrimitiveDemoDONOTUSE` — akhiran `DemoDONOTUSE` itu penamaan feature-flag
dari WhatsApp sendiri, bukan peringatan dari library ini.

```js
await sock.sendMessage(jid, {
    html: `<!doctype html><html><head><style>
      body { background:#111b21; color:#e9edef; font-family:system-ui; text-align:center; padding:24px }
      button { background:#00a884; color:#0b141a; border:0; border-radius:10px; padding:12px 24px; font-weight:bold }
    </style></head><body>
      <h2>Mini Clicker</h2><div id="n" style="font-size:36px">0</div>
      <button onclick="document.getElementById('n').textContent = ++c">TAP SAYA</button>
      <script>let c = 0</script>
    </body></html>`
})
```

- Beberapa kartu sekaligus: `{ html: [docA, docB] }`.
- Dicampur dengan primitif lain: `{ richResponse: [{ text: 'main yuk:' }, { html: doc }] }`.
- Daftar origin yang boleh dihubungi dokumen: `{ html: doc, trustedSources: ['https://example.com'] }`.
- Helper tanpa socket: `assessHtmlCard(html)` / `assertHtmlCard(html)` (string tak kosong, batas
  default 256 KiB, dihitung per byte), plus `buildHtmlPrimitiveSection()` dan
  `buildHtmlUnifiedResponse()` kalau kamu merakit payload sendiri.

> **Anggap ini eksperimental.** Bukan tipe pesan yang terdokumentasi/stabil: hasil render
> tergantung versi klien penerima dan bisa hilang tanpa pemberitahuan. Markup dikirim apa
> adanya — jangan pernah menyisipkan input yang tidak tepercaya ke dalamnya.

### Ekspansi Native Flow

Tiap shorthand di bawah adalah key yang kamu pasang pada objek tombol di `nativeFlow: [...]`;
kolom kanan adalah `name` native-flow yang benar-benar dikirim. `text` mengatur labelnya,
`icon` opsional.

| shorthand | nama native-flow | | shorthand | nama native-flow |
| --- | --- | --- | --- | --- |
| `id` | `quick_reply` | | `card` | `card_message` |
| `reply` | `quick_reply` | | `orderDetails` | `order_details` |
| `url` (or `urlBtn`) | `cta_url` | | `orderStatus` | `order_status` |
| `copy` | `cta_copy` | | `reviewAndPay` | `review_and_pay` |
| `call` (or `phoneNumber`) | `cta_call` | | `paymentStatus` | `payment_status` |
| `sections` | `single_select` | | `paymentMethod` | `payment_method` |
| `webview` / `openWebview` | `open_webview` | | `trackOrder` | `track_order` |
| `reminder` | `cta_reminder` | | `reorder` | `reorder` |
| `cancelReminder` | `cta_cancel_reminder` | | `cancelOrder` | `cancel_order` |
| `address` | `address_message` | | `clearChat: true` | `clear_chat` |
| `location: true` | `send_location` | | `screen` | `navigateToScreen` |
| `catalog` | `catalog_message` | | `flow` | `flow` |
| `products` | `mpm` | | `voiceCall` / `videoCall` | `voice_call` / `video_call_button` |

```js
await sock.sendMessage(jid, {
    text: 'Order #1234',
    nativeFlow: [
        { text: 'Lacak', trackOrder: 'ORD-1234' },
        { text: 'Buka app', webview: { url: 'https://shop.example/track', inAppWebview: true } },
        { text: 'Menu', sections: [{ title: 'Bantuan', rows: [{ title: 'Hubungi CS', id: '.cs' }] }] }
    ]
})
```

**`open_webview` adalah tombol WebView in-app sungguhan** dan punya nama native-flow sendiri —
bukan hal yang sama dengan flag `webview_interaction` milik `cta_url`, yang diabaikan klien
WhatsApp modern. Isi dengan string url atau `{ url, title?, inAppWebview? }`.

**Sengaja tidak didukung:** `otp_button` / `authentication_button` adalah tombol template
WhatsApp Business Platform (Cloud API) yang terkunci di balik persetujuan template Meta —
tidak ada library protokol MD yang bisa membuatnya. Nama lama `call_button` / `url_button` /
`reply_button` berasal dari sistem `buttonsMessage` yang sudah usang dan diabaikan diam-diam
oleh klien sekarang; padanan yang berfungsi adalah `phoneNumber`, `urlBtn`, dan `reply` di
atas. Tombol commerce (`card_message`, `order_*`, `review_and_pay`, `payment_*`) hanya
render bila id-nya merujuk order Commerce nyata di katalog/akun bisnismu; `flow` butuh Flow
ID yang sudah dipublikasikan.

### Filter Notifikasi Sistem

Setiap pesan menyertakan:

```js
message.isSystemNotification
```

Berguna untuk memfilter:

- Pemberitahuan E2E
- Pemberitahuan layanan Meta
- Pesan lain yang dihasilkan sistem

---

## 📦 Instalasi

```bash
npm install @japofc/baileys
```

Langsung dari GitHub:

```bash
npm install github:JAPofc/baileys
```

> Butuh **Node.js 20+** — dicek saat import dengan pesan error yang jelas (tanpa install script: paket ini sengaja **nol** hook `preinstall`/`postinstall`, jadi `npm ci --ignore-scripts` dan kebijakan supply-chain ketat langsung jalan).

> **Pindahan dari `@whiskeysockets/baileys`?** Migrasi biasanya cuma ganti satu baris import — lihat [MIGRATION.md](./MIGRATION.md).

### Peer dependency opsional

Semua di bawah ini **opsional** — socket tetap jalan tanpa satu pun. Install hanya yang dibutuhkan fitur yang kamu pakai; yang belum terinstall akan gagal dengan petunjuk install yang jelas, bukan crash diam-diam.

| Paket | Membuka fitur |
|---|---|
| `sharp` | Resize/proses gambar cepat (dipakai `Toolkit.resize` milik builder pesan) |
| `@napi-rs/image` | Alternatif native yang lebih ringan dari `sharp` |
| `jimp` | Fallback gambar pure-JS kalau dua di atas tidak terinstall |
| `fluent-ffmpeg` | Konversi audio/video untuk pesan media |
| `ffmpeg-static` | **Binary** ffmpeg terbundel — auto-terdeteksi, nol konfigurasi (~80MB; tidak tersedia untuk Termux/Android, pakai `pkg install ffmpeg` di sana) |
| `@ffmpeg-installer/ffmpeg` | Binary ffmpeg terbundel alternatif — juga auto-terdeteksi |
| `audio-decode` | Ekstraksi waveform/durasi audio (voice note, capture VoIP) |
| `link-preview-js` | Preview link kaya untuk URL di pesan teks keluar |
| `better-sqlite3` | Auth state SQLite, adapter store SQLite, **dan** `SQLiteStore`/`StatsManager` milik [Bot Framework](#-bot-framework) |
| `mongodb` | Adapter store MongoDB |
| `mysql2` | Adapter store MySQL |
| `pg` | Adapter store PostgreSQL |
| `ioredis` | Adapter store Redis |
| `@roamhq/wrtc` | Binding WebRTC native untuk [panggilan suara](#-panggilan-suara--video) |

#### ffmpeg: cara dia ditemukan

Semua fitur yang memanggil ffmpeg (thumbnail video, konversi stiker, konversi voice note, feeding audio VoIP) mencari binary lewat satu resolver terpusat, dengan urutan:

1. **Override kamu** — `setFfmpegPath('/path/ke/ffmpeg')` (diekspor dari paket) atau env var `FFMPEG_PATH`
2. **`ffmpeg-static`** — kalau terinstall, binary bundelannya dipakai otomatis
3. **`@ffmpeg-installer/ffmpeg`** — sama, sebagai alternatif
4. **`ffmpeg` sistem** di `PATH` kamu

Jadi di server biasa cukup `npm i ffmpeg-static` dan tidak perlu mikir lagi. Di **Termux/Android** (di mana kedua paket npm itu tidak punya binary) install versi sistem — otomatis kepakai:

```sh
pkg install ffmpeg
```

Kalau tidak ketemu sama sekali, fiturnya gagal dengan petunjuk install per-platform, bukan error misterius `spawn ffmpeg ENOENT`.

#### Cek lingkunganmu (doctor)

Bingung kenapa suatu fitur tidak jalan? Satu panggilan ini mendiagnosa semuanya — versi Node, dependency opsional mana yang terinstall, ffmpeg ketemu di mana, backend gambar yang aktif:

```js
import { printEnvironmentReport } from '@japofc/baileys'
await printEnvironmentReport() // cetak laporan lengkap + return snapshot-nya
// atau versi data mentah tanpa cetak:
import { checkEnvironment } from '@japofc/baileys'
const env = await checkEnvironment() // { ok, platform, node, ffmpeg, imageBackend, optionalDeps, warnings }
```

Atau langsung dari terminal, tanpa nulis kode:

```sh
npx @japofc/baileys doctor    # exit code 0 = semua beres, 1 = ada warning
npx @japofc/baileys version
```

---

## 🚀 Mulai Cepat

```js
import { makeWASocketAuto, useMultiFileAuthState } from '@japofc/baileys'

const { state, saveCreds } = await useMultiFileAuthState('auth_info')

// makeWASocketAuto mengambil versi WA Web terbaru sebelum konek
// (sw.js WA -> fork -> fallback), mencegah error 405 pairing karena versi basi.
// Lebih suka sync? `makeWASocket({ auth: state })` tetap jalan seperti biasa.
const sock = await makeWASocketAuto({
    auth: state
})

// simpan kredensial setiap kali Baileys memperbaruinya
sock.ev.on('creds.update', saveCreds)

sock.ev.on('connection.update', (update) => {
    const { connection, qr } = update

    // Paling gampang: kasih `printQRInTerminal: true` ke makeWASocket dan QR
    // digambar otomatis oleh renderer bawaan (nol dependency).
    // Render manual/custom dari event juga bisa:
    //   import { renderQRToTerminal, qrToSVG, qrToPNG } from '@japofc/baileys'
    //   if (qr) console.log(renderQRToTerminal(qr))          // terminal (▀▄█)
    //   if (qr) fs.writeFileSync('qr.svg', qrToSVG(qr))      // untuk web UI
    //   if (qr) fs.writeFileSync('qr.png', qrToPNG(qr))      // raster (kirim ke mana saja)
    if (qr) console.log('Dapat QR pairing')

    if (connection === 'open') console.log('🍃 Terhubung!')
})

sock.ev.on('messages.upsert', ({ messages }) => {
    const msg = messages[0]
    if (!msg.message || msg.key.fromMe) return
    console.log('Pesan baru dari', msg.key.remoteJid)
})
```

**Tips produksi** — bungkus socket dengan `autoReconnect()` dan urusan disconnect selesai otomatis (exponential backoff, tidak pernah reconnect saat `loggedOut`, reconnect langsung setelah pairing):

```js
import { makeWASocketAuto, autoReconnect, useMultiFileAuthState } from '@japofc/baileys'

const { state, saveCreds } = await useMultiFileAuthState('auth_info')
const manager = autoReconnect(() => makeWASocketAuto({ auth: state, printQRInTerminal: true }), {
    onSocket: sock => {
        sock.ev.on('creds.update', saveCreds)
        sock.ev.on('messages.upsert', handler) // dipasang ulang di setiap reconnect
    },
    onLoggedOut: () => console.log('hapus auth_info/ lalu pairing ulang'),
})
await manager.start()
```

Versi lengkap yang bisa langsung dijalankan: [`examples/auto-reconnect-bot.js`](./examples/auto-reconnect-bot.js).

### Login pakai pairing code (tanpa QR)

```js
import { makeWASocket, useMultiFileAuthState, formatPairingCode } from '@japofc/baileys'

const { state, saveCreds } = await useMultiFileAuthState('auth_info')
const sock = makeWASocket({ auth: state, printQRInTerminal: false })
sock.ev.on('creds.update', saveCreds)

if (!state.creds.registered) {
    const code = await sock.requestPairingCode('628123456789') // nomor internasional lengkap
    console.log('Pairing code:', formatPairingCode(code))      // "ABCD-EFGH"
}

// kode custom 8 karakter (Crockford base32: 1-9, A-Z tanpa I/O/U)
await sock.requestPairingCode('628123456789', 'JAPJAP12')
```

Input divalidasi di awal dengan error yang jelas, bukan gagal diam-diam di sisi server: karakter format (`+`, spasi, strip) dibersihkan, prefix telepon internasional `00` di depan dihapus otomatis, dan dua penyebab klasik langsung dilempar error — **nomor format lokal** (`08123...` padahal harusnya `628123...`, penyebab #1 "pairing code gak pernah dateng") dan nomor lebih dari 15 digit (batas maksimum E.164). Pengecekan yang sama tersedia mandiri sebagai `normalizePairingPhone(nomor)`. Untuk bot publik, batasi percobaan pairing dengan `withPairingGuard`.

**Observability** — pasang `createDebugMonitor()` untuk snapshot terstruktur yang aman
(status koneksi, alasan disconnect, uptime, persentil latensi pesan, hitungan retry kirim,
hitungan error Signal, status VoIP/WASM, memori). Snapshot ini **tidak pernah** berisi
payload QR, kode pairing, kunci auth, token, atau private key — seluruh snapshot melewati
`redactSecrets()` sebelum dikembalikan, jadi aman untuk di-log atau dilampirkan ke laporan
bug apa adanya:

```js
import { createDebugMonitor } from '@japofc/baileys'

const monitor = createDebugMonitor(sock)
// nanti — di health endpoint, log cron, atau crash handler:
console.log(JSON.stringify(monitor.getDebugInfo(), null, 2))
// { connection: { state, uptimeMs, lastDisconnect: { code, reason } },
//   messages: { received, decryptFailed, latencyMs: { p50, p90, p99 } },
//   sendRetries, signalErrors: { noSession, badMac, ... }, voip, memory }
```

**Protocol capture eksperimental** — fitur WhatsApp baru jangan ditebak dari asumsi;
pertama capture bentuk BinaryNode dari akun test yang memang kamu izinkan, rahasia
akan diredaksi, lalu baru buat wrapper high-level setelah kontrak wire-nya jelas:

```js
import { bindProtocolCapture } from '@japofc/baileys'

const capture = bindProtocolCapture(sock, { file: './wa-protocol.ndjson' })
// trigger fitur di official client / akun test yang paired
// tiap baris adalah JSON redacted: { direction, summary, node }
await capture.close()
```

---

## 🔐 Autentikasi

Empat backend auth-state tersedia langsung. Semuanya mengembalikan bentuk `{ state, saveCreds }` yang sama seperti yang diharapkan `makeWASocket({ auth })`, jadi bisa saling tukar tanpa ubah kode.

| Fungsi | Penyimpanan | Cocok untuk |
|---|---|---|
| `useMultiFileAuthState(folder)` | Satu file JSON per kunci, di disk | Pilihan default — sederhana, mudah di-debug, jalan di mana saja |
| `useSingleFileAuthState(namaFile)` | Satu file JSON, di disk | Bot kecil yang lebih mudah kelola/backup satu file |
| `useSqliteAuthState(opsi)` | SQLite (`better-sqlite3`) | Bot yang sudah pakai SQLite, atau mau auth di satu file DB embedded |
| `useCacheManagerAuthState(store, kunciSesi)` | Store apa pun yang kompatibel [`cacheable`](https://www.npmjs.com/package/@cacheable/node-cache) | Panel hosting multi-sesi, setup berbasis Redis |
| `useRedisAuthState(opsi)` | Redis (client `ioredis` **atau** node-redis) | Bot multi-instance, penyimpanan sesi bersama yang cepat |
| `useMongoAuthState(opsi)` | MongoDB (collection `mongodb`) | Bot yang sudah pakai Mongo; satu dokumen per key |
| `usePostgresAuthState(opsi)` | Postgres (`pg` Pool/Client) | Deployment produksi di Postgres; tabel dibuat otomatis |
| `useMySQLAuthState(opsi)` | MySQL/MariaDB (`mysql2/promise`) | Setup shared-hosting; tabel dibuat otomatis |
| `makeAuthStateFromStore(store)` | Backend key-value **apa pun** buatanmu | Database kustom — cukup implementasikan 5 method kecil |

```js
import { makeWASocket, useMultiFileAuthState } from '@japofc/baileys'

const { state, saveCreds } = await useMultiFileAuthState('auth_info')
const sock = makeWASocket({ auth: state })
sock.ev.on('creds.update', saveCreds)
```

```js
// Varian SQLite
import { makeWASocket, useSqliteAuthState } from '@japofc/baileys'

const { state, saveCreds } = await useSqliteAuthState({ database: './auth.db' })
const sock = makeWASocket({ auth: state })
sock.ev.on('creds.update', saveCreds)
```


Keempat adapter database menerima **client/collection yang sudah ada** (disarankan — kamu pegang kendali pooling & lifecycle) atau `uri` (driver di-import lazy hanya saat itu; tak ada yang jadi dependency wajib):

```js
// Varian Redis — jalan dengan ioredis DAN node-redis
import { makeWASocket, useRedisAuthState } from '@japofc/baileys'

const { state, saveCreds } = await useRedisAuthState({ client: myRedis, session: 'bot-1' })
const sock = makeWASocket({ auth: state })
sock.ev.on('creds.update', saveCreds)
```
`useMultiFileAuthState` juga mengekspor `pruneStaleAuthFiles(folder, opsi)` untuk membersihkan file sender-key lama secara terjadwal — berguna untuk bot yang jalan lama dan menumpuk ribuan file kunci basi.

---

## 🗄️ Backend Store

`makeInMemoryStore()` dari `lib/Store` memberikan cache chat/kontak/pesan in-memory klasik. Untuk apa pun yang harus selamat dari restart, `makePersistentStore()` (dari `PersistentStore.js`) membungkus salah satu dari lima backend di balik interface yang sama:

| Backend | Fungsi |
|---|---|
| SQLite | `createSqliteStoreAdapter(opsi)` |
| MongoDB | `createMongoStoreAdapter(opsi)` |
| MySQL | `createMysqlStoreAdapter(opsi)` |
| PostgreSQL | `createPostgresStoreAdapter(opsi)` |
| Redis | `createRedisStoreAdapter(opsi)` |

```js
import { makeWASocket, makeInMemoryStore } from '@japofc/baileys'

const store = makeInMemoryStore({})
store.readFromFile('./baileys_store.json')
setInterval(() => store.writeToFile('./baileys_store.json'), 10_000)

const sock = makeWASocket({ /* ...auth dll */ })
store.bind(sock.ev)
```

---

## 💡 Contoh Pemakaian

### Tombol & Native Flow

```js
import { Button } from '@japofc/baileys'

await new Button(sock)
    .setTitle('Promo Spesial')
    .setBody('Diskon 20% cuma hari ini')
    .setFooter('@japofc/baileys')
    .addReply('Klaim Sekarang', 'claim_promo')
    .addUrl('Lihat Katalog', 'https://example.com/catalog')
    .addCall('Hubungi Kami', '628123456789')
    .send(jid)
```

### Poll

```js
import { Poll } from '@japofc/baileys'

await new Poll(sock)
    .setName('Mau makan apa hari ini?')
    .addOptions(['Nasi Goreng', 'Mie Ayam', 'Bakso'])
    .setSelectable(1)
    .send(jid)
```

> **v2.4.7** — builder poll sekarang memvalidasi sebelum mengirim. Opsi duplikat
> ditolak (hasil poll dikelompokkan berdasarkan teks opsi, jadi duplikat dulu menyatu
> jadi satu hasil), `setEndDate()` melempar error untuk tanggal yang tidak bisa
> diparsing alih-alih mengirim `endTime: NaN`, dan `setQuiz()` tidak lagi bisa
> digabung dengan `setAnnouncementGroup()` (jalur itu memakai
> `pollCreationMessageV2` yang tidak punya field `correctAnswer`, jadi mode kuis
> hilang diam-diam). Poll kuis juga akhirnya terbaca:
> `getAggregateVotesInPollMessage()` kini mengenali `pollCreationMessageV5`.

```js
const poll = new Poll(sock)
    .setName('Kuis: ibu kota Indonesia?')
    .addOptions(['Jakarta', 'Bandung', 'Surabaya'])
    .setQuiz('Jakarta')

poll.validate()        // [] kalau aman dikirim — mengumpulkan semua masalah sekaligus
poll.assertValid()     // melempar masalah pertama (dijalankan otomatis oleh build()/send())
poll.countOptions()    // 3
poll.getOptions()      // ['Jakarta', 'Bandung', 'Surabaya'] (salinan)
poll.removeOption('Surabaya')
Poll.MAX_OPTIONS       // 12 — ditegakkan, sama seperti MAX_NAME_LENGTH (255) / MAX_OPTION_LENGTH (100)

await poll.send(jid)
```

### Carousel

> Kartu biasanya dibuat dengan `Button(...).toCard()` dulu. Kartu media tetap jalan seperti sebelumnya, dan v2.4.7 juga mengizinkan kartu carousel text/button-only yang valid (WhatsApp memang merendernya) lewat `addTextCard()` atau kartu `Button(...).toCard()` tanpa header media.

```js
import { Button, Carousel } from '@japofc/baileys'

const kartuA = await new Button(sock)
    .setImage('https://example.com/a.jpg')
    .setTitle('Produk A')
    .addUrl('Lihat', 'https://example.com/a')
    .toCard()

const kartuB = await new Button(sock)
    .setImage('https://example.com/b.jpg')
    .setTitle('Produk B')
    .addUrl('Lihat', 'https://example.com/b')
    .toCard()

await new Carousel(sock)
    .setBody('Pilih salah satu produk di bawah ini')
    .addCard([kartuA, kartuB])
    .send(jid)

// Kartu text/button-only, tanpa gambar:
await new Carousel(sock)
    .setBody('Aksi cepat')
    .addTextCard({
        title: 'Bantuan',
        text: 'Pilih aksi',
        buttons: [
            { id: 'faq', text: 'FAQ' },
            { webview: 'https://example.com/help', text: 'Buka Bantuan' }
        ]
    })
    .send(jid)
```

### AIRich — kartu respons kaya

```js
import { AIRich } from '@japofc/baileys'

await new AIRich(sock)
    .addHeading('Ringkasan Order')
    .addText('Pesananmu sedang diproses.')
    .addTable([
        ['Item', 'Qty'],
        ['Kopi Susu', '2']
    ])
    .addTip('Pesanan biasanya siap dalam 15 menit')
    .addSuggest('Lacak Order')
    .send(jid)
```

Untuk kasus umum, v2.4.7 juga mengekspor wrapper one-liner di atas builder yang sama:

```js
import { sendJapRich, jap } from '@japofc/baileys'

await sendJapRich(sock, jid, {
    title: 'Ringkasan Order',
    markdown: '# Lunas\nPesananmu sedang diproses.',
    actions: { text: 'Lacak', url: 'https://example.com/order/123' },
    suggestions: ['Lacak Order', 'Hubungi CS']
})

// Atau tetap chaining setelah shortcut membangun kartunya:
await jap(sock, '# Laporan Cepat').addTip('Dibuat sekarang').send(jid)
```

Alias netral (`sendRich`, `Rich`, `createRich`, `buildRich`) tetap tersedia, tapi helper ber-brand JAP (`jap`, `japRich`, `createJapRich`, `buildJapRich`, `sendJapRich`) adalah nama yang disarankan untuk kode baru.

**Sejak v2.4.8 socket-nya bisa rich langsung** — tanpa free function, tanpa oper-oper `sock`:

```js
await sock.sendJapRich(jid, { title: 'Ringkasan Order', markdown: '# Lunas', suggestions: ['Lacak'] })
await sock.sendJapTable(jid, [['Item', 'Qty'], ['Kopi', '2']], { title: 'Keranjang' })
await sock.sendJapLatex(jid, 'E = mc^2')

// sendMessage() juga mengenali bentuk-bentuk ini
await sock.sendMessage(jid, { table: [['Item', 'Qty'], ['Kopi', '2']], title: 'Keranjang' })
await sock.sendMessage(jid, { latex: '\\frac{a}{b}' })
await sock.sendMessage(jid, { jap: { markdown: '# Halo', suggestions: ['Lanjut'] } })
```

`sendRich` / `sendTable` / `sendLatex` adalah alias netral dari ketiga method socket itu, dan
`{ disableJapyea: true }` membuat satu panggilan melewati seluruh layer auto-routing.

One-liner-nya sekarang mencakup **semua** primitive AIRich — `latex`, `task(s)`, `widget(s)`,
`progressStatus`, `thinking`, `quotaUpsell`, `bloks`, `reels`, `post(s)`, `product(s)`,
`socialEntity`, `inlineVideo`, `contentItems`, `generating` — dan kunci yang tidak dikenal kini
jadi error beserta saran (`unknown key 'tabel' (did you mean 'table'?)`), bukan kartu kosong
yang terkirim diam-diam. Pakai `{ allowUnknown: true }` kalau mau menitipkan field tambahanmu
sendiri, dan import `ONE_LINER_KEYS` kalau mau memvalidasi input sendiri.

`AIRich` mendukung `{ id, insertAt }` di setiap panggilan `add*()`/`set*()`, jadi kamu bisa menyisipkan blok relatif terhadap blok yang sudah ditambahkan sebelumnya, bukan selalu menambah di akhir — praktis untuk respons gaya streaming/edit-di-tempat yang dikombinasikan dengan `sendEdit(jid, id)`.

**`streamText()` — efek "AI lagi ngetik".** Satu bubble yang tumbuh lewat edit di tempat (persis cara Meta AI streaming jawabannya), bukan membanjiri chat:

```js
// kirim sekali, lalu patch bubble yang sama sampai teks lengkap keluar
await new AIRich(sock).streamText(jid, jawabanPanjang, {
    chunkSize: 120,  // ~karakter per tahap (dipotong di batas kata)
    intervalMs: 900, // jeda antar edit (min 300)
    cursor: ' ▍'     // tampil selama streaming, dihapus di akhir ('' menonaktifkan)
})
// bisa digabung blok lain: addHeading()/addTable() dulu, baru streamText()
```

**`readRichMessage()` — separuh pembacanya.** Parse kartu rich yang DITERIMA (dari bot AI/asisten mana pun) balik jadi blok terstruktur, bukan menatap proto mentah:

```js
import { readRichMessage } from '@japofc/baileys'

sock.ev.on('messages.upsert', ({ messages }) => {
    const rich = readRichMessage(messages[0])
    if (!rich.found) return
    rich.blocks      // [{ type: 'heading', text }, { type: 'code', language, code },
                     //  { type: 'table', rows, headerRows }, { type: 'text', text, entities }, …]
    rich.suggestions // teks semua pill saran
    rich.text        // render teks datar seluruh kartu
})
```

Mendukung dua bentuk wire (payload unified-response + fallback submessages proto), entity link inline dikembalikan jadi `[label](url)`, span kode ber-highlight digabung ulang, tidak pernah throw — input non-rich mengembalikan `{ found: false }`. Teruji roundtrip terhadap builder AIRich sendiri.

Builder lain yang layak diketahui: **`ButtonV2`** (tombol quick-reply sederhana), **`ButtonV3`** (`loadFrom(msg)` untuk mengedit pesan template yang sudah ada), dan **`Toolkit`** (helper statis: `Toolkit.resize()`, `Toolkit.fetchBuffer()`, `Toolkit.waitAllPromises()`, `Toolkit.extractIE()` untuk mem-parse link/sitasi/LaTeX `[label](url)` dari teks biasa).

### 📁 Peta Folder Builders (`lib/Builders/`)

Setiap builder pesan tinggal di file-nya sendiri di `lib/Builders/`, jadi kamu bisa melacak persis dari mana sebuah class berasal, bukan mengubek satu `MessageBuilder.js` raksasa. `index.js` hanyalah barrel file yang me-re-export semuanya (plus alias-aliasnya) untuk sintaks `import { ... } from '@japofc/baileys'` di level teratas.

| File | Ekspor | Untuk apa |
|---|---|---|
| `shared.js` | `Toolkit`, `BaseBuilder`, `RowBuilder` | Fondasi bersama semua builder lain. `BaseBuilder` memegang plumbing `send()`/context-info chainable yang umum, `RowBuilder` helper baris/section bersama, dan `Toolkit` kumpulan helper statis (`resize`, `fetchBuffer`, `waitAllPromises`, `extractIE`, helper durasi/preview media). Tidak ada yang dimaksudkan untuk dipakai langsung di kode bot — dia ada supaya `Button`, `Poll`, `Carousel`, dll. tidak mengimplementasi ulang plumbing yang sama. |
| `Button.js` | `Button`, `CardBuilder` | Builder tombol interaktif/native-flow utama — header (gambar/video/dokumen), helper CTA (`addUrl`, `addCall`, `addReply`, dan set native-flow yang lebih luas), plus `.toCard()` untuk mengubah pesan tombol menjadi kartu `Carousel`. |
| `ButtonV2.js` | `ButtonV2` | Varian legacy `buttonsMessage` yang lebih ringan dan terbatas maksimal 3 tombol quick-reply — punya `validate()`/`assertValid()`, `countButtons()`/`getButtons()`/`clearButtons()`, dan relay memakai envelope canonical `getBizBinaryNode()` yang sama dengan jalur socket. |
| `ButtonV3.js` | `ButtonV3` | Berpusat pada `loadFrom(msg)` — memuat `templateMessage` yang sudah ada (misalnya yang kamu fetch atau di-quote) supaya bisa diedit di tempat. Juga memvalidasi hydrated quick-reply/url/call button dan relay dengan biz node canonical. |
| `Carousel.js` | `Carousel` | Merangkai hasil `Button(...).toCard()` menjadi carousel kartu yang bisa digeser. Menerima kartu media dan kartu text/button-only (`addTextCard()`), memvalidasi sebelum kirim, dan dibatasi `Carousel.MAX_CARDS` (10) karena WhatsApp diam-diam memotong apa pun di atas itu. |
| `Poll.js` | `Poll` | Builder pesan poll/voting — pertanyaan, opsi, single/multi-select, mode pemilih tersembunyi, penandaan jawaban benar, kedaluwarsa. |
| `AIRich.js` | `AIRich` (+ alias `ORich`, `AIJap`, `LeafRich`, `JapAI`, `JapRich`, `RichJap`) | Builder respons gaya asisten AI yang dijelaskan di atas — heading, teks berformat, tabel, kartu media/produk/post, kartu tugas/progres, banner tips, saran quick-reply. |
| `Rich.js` | `jap`, `japRich`, `createJapRich`, `buildJapRich`, `sendJapRich` (+ alias netral `Rich`, `createRich`, `buildRich`, `sendRich`) | Wrapper one-liner di atas `AIRich` untuk kartu umum (`markdown`, `text`, `actions`, `suggestions`, media, dll.) tanpa mengganti builder chainable penuh. |
| `A2UI.js` | `A2UI`, `sendA2UIWidget` | Builder widget A2UI/Bloks level rendah. Membangun tree `components` flat (Column/Row → `children`, Card/Button → `child`, Modal → `trigger`/`content`) yang diharapkan widget Bloks dan mengirimnya lewat jalur `getBizBinaryNode()` yang sama dengan `Button`/`ButtonV2`, jadi node level wire selalu cocok dengan nama tombol yang benar-benar terkirim. |
| `JapBaileys.js` | `JapBaileys` | **Hub** builder terpadu — satu objek yang membungkus semua builder di atas di balik nama method pendek (`.button()`, `.buttonV2()`, `.buttonV3()`, `.carousel()`, `.poll()`, `.airich()`, `.rich()`, `.a2ui()`), plus alias PascalCase (`.Button()`, `.Carousel()`, `.Poll()`, `.AIRich()`, `.Rich()`, `.A2UI()`) untuk developer yang lebih suka gaya penamaan itu. |
| `index.js` | semua di atas, plus `MESSAGE_BUILDER_VERSION` | Barrel file — me-re-export setiap builder dan aliasnya supaya `import { Button, Poll, AIRich, JapBaileys } from '@japofc/baileys'` jalan tanpa masuk ke file individual. `MESSAGE_BUILDER_VERSION` melacak versi permukaan API builder sendiri, terpisah dari versi paket. |

**Contoh hub terpadu** — berguna kalau lebih suka membawa satu objek daripada mengimpor tiap builder satu-satu:

```js
import { JapBaileys } from '@japofc/baileys'

const vx = new JapBaileys(sock)

await vx.button()
    .setTitle('Promo Spesial')
    .addReply('Klaim Sekarang', 'claim_promo')
    .send(jid)

await vx.poll()
    .setName('Mau makan apa hari ini?')
    .addOptions(['Nasi Goreng', 'Mie Ayam'])
    .send(jid)
```

---

### 📌 Pin / Keep in Chat

```js
// Pin pesan 7 hari (default 24 jam), unpin, keep / unkeep di chat menghilang
await sock.sendPin(jid, msg.key, { durationSec: 7 * 86400 })
await sock.sendUnpin(jid, msg.key)
await sock.sendKeep(jid, msg.key)
await sock.sendUnkeep(jid, msg.key)
```

### 📅 Event

```js
await sock.sendEvent(jid, {
    name: 'Rapat Mingguan',
    description: 'Bahas progres bot',
    startDate: new Date('2026-09-15T10:00:00+07:00'),
    endDate: new Date('2026-09-15T11:00:00+07:00'),
    location: { name: 'Kantor', address: 'Jakarta' },
    extraGuestsAllowed: true
})
```

### 📞 Panggilan Terjadwal

Pesan scheduled-call native (kartu "Jadwalkan panggilan" dengan pengingat join):

```js
// 'voice' (default) atau 'video'
await sock.sendScheduledCall(jid, {
    title: 'Standup harian',
    scheduledAt: new Date('2026-09-15T09:00:00+07:00'),
    callType: 'video'
})

// Batalkan nanti (butuh key dari pesan pembuatan)
await sock.cancelScheduledCall(jid, pesanPembuatan.key)
```

### 📱 Mini App

Dua mode — kirim `url`, `flow`, atau keduanya (dua tombol):

```js
import { sendMiniApp } from '@japofc/baileys'

await sendMiniApp(sock, jid, {
    title: 'Mini App Saya',
    body: 'Tekan tombol untuk membuka app 👇',
    // 1) mode webview: kartu kaya + CTA yang membuka web app kamu
    //    (webview dalam-app kalau didukung, kalau tidak lewat browser)
    url: 'https://myapp.example.com',
    params: { ref: 'wa-bot' }, // → ditambahkan sebagai ?ref=wa-bot
    buttonText: '🚀 Buka App',
    // 2) mode Flows: mini app native BENERAN di dalam chat (form/layar di dalam
    //    WhatsApp, tanpa browser). Butuh Flow ID yang sudah dipublish di Flows Manager.
    flow: { id: '123456789', cta: '📝 Isi Form', screen: 'WELCOME' },
    thumbnail: 'https://myapp.example.com/icon.png' // url atau Buffer
})
// atau sebagai method socket: await sock.sendMiniApp(jid, { ... })
```

---

## 📨 Helper Pesan

One-liner level tinggi untuk tipe pesan modern — tervalidasi, dengan alias ramah:

```js
await sock.sendLocation(jid, { lat: -6.2, lng: 106.8, name: 'Jakarta' });
await sock.sendContact(jid, { name: 'Budi', vcard: 'BEGIN:VCARD\n...' });
await sock.sendGroupInvite(jid, { code: 'AbC123', jid: groupJid, subject: 'Komunitas' });
await sock.sendPaymentRequest(jid, { currency: 'IDR', amount: 50000, note: 'kopi ☕' });
await sock.sendInvoice(jid, { note: 'INV-001' });
await sock.sendPollOption(jid, pollKey, ['Opsi baru']);
await sock.sendEventInvite(jid, { eventTitle: 'Pesta', startTime: new Date(...) });
await sock.sendNewsletterInvite(jid, { newsletterJid, newsletterName: 'Berita' });

// Upgrade poll (sudah tersambung end-to-end):
await sock.sendPoll(jid, {
  name: 'Jam berapa?', values: ['Pagi', 'Sore'],
  endDate: new Date('2026-09-16T00:00:00Z'), // auto-tutup
  hideVoter: true,      // poll anonim
  canAddOption: true,   // pemilih boleh menambah opsi
});
```

Pesan musik masih eksperimental — proto-nya benar tapi interop dengan klien resmi
belum terverifikasi (lihat [Yang jujur belum diimplementasi](#yang-jujur-belum-diimplementasi-dan-kenapa)):

```js
await sock.sendMusic(jid, { songUri, artworkUri, embeddedMusic: { songId, title, author } });
```

**Pintu darurat:** setiap kunci konten juga jalan inline via `sendMessage`, dan `{ raw: true, <FieldPesanApapun>: {...} }`
meneruskan field proto apa pun tanpa disentuh — cakupan `WAProto` penuh tanpa nunggu wrapper:

```js
await sock.sendMessage(jid, { raw: true, musicMessage: { songUri } });
```

Pengguna TypeScript dapat `AnyMessageContent` yang bertipe (`import type { AnyMessageContent } from '@japofc/baileys'`).

## 🧰 Channel, Riwayat & Transkrip

**Manajemen channel** (query langsung):

```js
await sock.newsletterDelete(channelJid)
await sock.newsletterAdminCount(channelJid)
await sock.newsletterJoinInvite('kode-undangan')
await sock.newsletterChangeOwner(channelJid, jidPemilikBaru) // eksperimental
await sock.communityGetInviteCode(communityJid)
// ...plus follow/unfollow/mute/react/fetch yang sudah ada + CRUD komunitas penuh
```

**Berbagi riwayat grup** untuk anggota baru (meneruskan pesan terakhir ke DM mereka):

```js
import { getGroupHistoryFromStore } from '@japofc/baileys'
const pesan = getGroupHistoryFromStore(store, groupJid, 10)
await sock.shareGroupHistory({ groupJid, members: jidAnggotaBaru, messages: pesan, greeting: true })
```

**Transkripsi voice note** (provider bisa diganti — Whisper cloud atau milikmu sendiri):

```js
import { openAIWhisperProvider } from '@japofc/baileys'
const provider = openAIWhisperProvider({ apiKey: process.env.OPENAI_API_KEY })
const { text } = await sock.transcribeMessage(pesanVoiceNote, { provider })
```

**Deep link mini-app** (parameter ber-HMAC yang bisa diverifikasi web app kamu):

```js
import { createMiniAppLink, parseMiniAppParams, buildFlowDataExchange } from '@japofc/baileys'
const link = createMiniAppLink('https://app.example.com/', { uid: '123' }, { secret: 's3cr3t' })
parseMiniAppParams(link, { secret: 's3cr3t' }) // → { uid: '123' } (throw kalau dimodifikasi)
buildFlowDataExchange('navigate', { screen: 'HOME' }) // payload data_exchange untuk Flows
```

**Widget A2UI** kini mencakup `Slider`, `Switch`, `List`, `ProgressBar`, `Avatar`,
`Badge`, `Spacer`, dan `Tabs` di samping set Text/Image/Video/Button/Card/Modal
yang sudah ada (semua divalidasi ref-nya saat `build()`).

## 🔐 Paket Keamanan

Pengerasan siap-pakai untuk auth state, rahasia, dan penyalahgunaan — semuanya di
`lib/Utils/auth-secure.js`, tercakup `tests/security.test.js` (termasuk fuzzing).

```js
import {
  useEncryptedFileAuthState, secureLogger, withPairingGuard,
  createQRGuard, backupAuthState, writeAuthIntegrity, repairAuthState, secureLogout
} from '@japofc/baileys'

// 1. Auth state terenkripsi AES-256-GCM (membaca plaintext lama, migrasi saat save)
const { state, saveCreds } = await useEncryptedFileAuthState('./auth', { password: process.env.AUTH_PW })

// creds.json yang rusak (password salah, terpotong, kosong, bukan JSON) kini melempar error
// alih-alih diam-diam membuat identitas baru di atas sesimu — sejak v2.4.8 penjagaan itu juga
// mencakup file plaintext lama. Pulihkan dengan restoreAuthState()/repairAuthState(), atau
// hapus foldernya kalau memang mau reset.
const sock = makeWASocket({
  auth: state,
  logger: secureLogger(pino({ level: 'info' })), // 7. meredaksi qr/token/kunci di setiap baris log
})

// 2. Rate limit kode pairing: 5/jam per nomor, jeda 30 detik antar percobaan
withPairingGuard(sock, { maxPerHour: 5, minIntervalMs: 30_000 })

// 3. QR first-guard: tangani QR pertama, telan re-emit selama 60 detik
const qrGuard = createQRGuard({ ttlMs: 60_000 })
sock.ev.on('connection.update', ({ qr }) => { qr = qrGuard.handle(qr); if (qr) tampilkan(qr) })

// 6/8. backup terenkripsi + snapshot integritas
await backupAuthState('./auth', './auth.jabackup', { password: process.env.BACKUP_PW })
await writeAuthIntegrity('./auth', { secret: process.env.INT_PW })

// 9. perbaiki store korup (karantina + pulihkan creds dari backup)
await repairAuthState('./auth', { password: process.env.AUTH_PW, backupFile: './auth.jabackup', backupPassword: process.env.BACKUP_PW })

// 4. logout + timpa/hapus semua file auth + bersihkan creds di memori
await secureLogout(sock, { authFolder: './auth' })
```

Varian satu file: `useEncryptedSingleFileAuthState(file, { password })`.

## 🆕 Kejar-tayang WA 2026

Fitur WhatsApp 2026, tersambung ke JAP-Baileys. Semua di sini diaudit terhadap klien
resmi terbaru — hanya yang kurang yang ditambahkan; yang sudah jalan cukup didokumentasikan.

### Username (chat tanpa nomor telepon)

```js
await sock.checkUsername('japstore');            // ketersediaan
await sock.setUsername('japstore');              // klaim
await sock.reserveUsername('japstore');          // reservasi (alur reservasi 2026)
await sock.findUserByUsername('japstore');       // lookup USync → JID
const u = await sock.fetchContactUsernames(['62812@s.whatsapp.net']);
```

### Poll yang bisa diedit (`editPoll`)

Poll bisa diedit ~15 menit setelah dibuat (aturan sisi server):

```js
const terkirim = await sock.sendPoll(jid, { name: 'Jam berapa?', values: ['Pagi', 'Sore'] });
await sock.editPoll(jid, terkirim.key, { name: 'Jam berapa?', values: ['Pagi', 'Siang', 'Sore'] });
```

### Mention massal (`sendMentionAll`)

```js
await sock.sendMentionAll(groupJid, 'Pengumuman: rapat jam 9!');
```

> Di grup dengan 32+ anggota, `@all` khusus admin dan aturannya ditegakkan
> sisi server — panggilan dari non-admin dibuang diam-diam oleh WhatsApp.

### Mention di status (`sendStatusMention`)

Posting status sekaligus memberi tahu user atau seluruh grup — mereka dapat
bubble "menyebut Anda dalam statusnya" yang tertaut ke status kamu:

```js
// status teks, mention dua user
await sock.sendStatusMention({ text: 'Pengumuman besar! 🎉' }, [
    '62812xxx@s.whatsapp.net',
    '62813xxx@s.whatsapp.net',
])

// status gambar, mention seluruh grup (semua anggota diberi tahu)
await sock.sendStatusMention({ image: buffer, caption: 'Rilisan baru 🔥' }, [groupJid])
```

Mendukung semua konten status (`text`, `image`, `video`, `audio`). Atur jeda
notifikasi dengan `{ delayMs }` di options (default 1500 ms per jid).

### Pengingat event

```js
await sock.sendMessage(jid, {
  event: {
    title: 'Rapat', description: 'Q3', startDate: new Date('2026-09-15T09:00:00+07:00'),
    reminder: true, reminderOffsetSec: 1800, // ingatkan 30 menit sebelum mulai
  }
});
```

### Nomor pengirim dari event LID (`resolveSenderPn`)

Memperbaiki payload yang hanya berisi LID (mis. offer panggilan tanpa `caller_pn`):

```js
sock.ev.on('messages.upsert', async ({ messages }) => {
  for (const m of messages) console.log(await sock.resolveSenderPn(m)); // '62812…' | null
});
```

### Voice note sekali lihat

Konten `sendVoiceNote()` bisa dikombinasikan dengan `viewOnce`:

```js
await sock.sendMessage(jid, { ...(await buildVoiceNoteContent('./a.ogg')), viewOnce: true });
```

### Label anggota (grup)

Sudah tersedia — tanpa kode baru, cukup didokumentasikan di sini:

```js
await sock.updateMemberLabel({ groupJid, lid, label: 'Admin' });
```

### Yang jujur belum diimplementasi (dan kenapa)

- **Transkrip pesan suara** — dibuat on-device oleh klien resmi saja; tidak ada
  API transkrip di level wire.
- **Berbagi riwayat pesan grup (native)** — WhatsApp mulai merilis fitur resmi
  "Group Message History" (bagikan 25–100 pesan terakhir ke anggota yang baru
  ditambahkan, E2EE, dikontrol admin) pada Feb 2026. Format wire-nya masih belum
  berhasil di-capture library publik mana pun (diverifikasi ulang 28 Sep 2026 dengan men-download dan men-diff API upstream Baileys 7.0.0-rc14 plus 8 fork hidup terbesar — tidak ada yang membawanya). Sampai itu terjadi, repo ini
  menyediakan *workaround* yang jujur — `shareGroupHistory()` meneruskan pesan
  terakhir ke DM anggota baru — yang BUKAN alur native (tanpa bubble riwayat di grup,
  tanpa notifikasi "riwayat dibagikan"). Kalau butuh perilaku native, satu-satunya
  jalan hari ini adalah klien resmi.
- **Pesan musik (interoperabilitas)** — struct proto `MusicMessage` round-trip dengan
  baik dan `sendMusic()` mengirimkannya, tapi interop nyata butuh ID katalog provider
  (Spotify/Apple) plus alur upload artwork yang dinegosiasikan klien resmi secara
  privat; belum ada capture publik (diverifikasi ulang Sep 2026). Pesan dengan ID
  karangan tampil sebagai preview polos atau tidak tampil sama sekali di klien resmi —
  perlakukan `sendMusic()` sebagai eksperimental dan uji di perangkat nyata dulu.
  Yang *diperbaiki* di v2.4.1: field `embeddedMusic` yang tak dikenal dulu dibuang
  diam-diam oleh encoder proto (key typo hilang begitu saja dari wire) — sekarang
  langsung throw 400 dengan daftar field yang didukung. Untuk fitur musik-di-status
  modern, lihat `withMusicAttribution()`.
- **`mediaKeyDomain` — SUDAH DIIMPLEMENTASI.** Di-backport dari rc14 ke semua 5 tipe
  media (`Audio/Document/Image/Sticker/VideoMessage`, enum `UNSET/E2EE_CHAT/STATUS/CAPI/BOT`)
  dengan passthrough kirim: `sendMessage(jid, { image: buf, mediaKeyDomain: 1 })`.
  Default-nya tidak diset (direkomendasikan — server yang melabeli). Dilewati hanya di
  `MMSThumbnailMetadata`, karena field nomor 8 upstream bentrok dengan
  `messageHistoryMetadata` yang lebih baru di proto kita.

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
[`CHANGELOG.md`](./CHANGELOG.md) dan [`BUGREPORT.md`](./BUGREPORT.md) §2.44–§2.97.

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

## 📞 Panggilan Suara & Video

Dukungan panggilan audio eksperimental via call stack WASM terbundel + relay WebRTC. Butuh peer dependency opsional `@roamhq/wrtc`.

> Sejak v2.4.8, `@roamhq/wrtc` yang tidak terpasang (atau kegagalan konek relay apa pun)
> dilaporkan lewat `onTransportError` / logger-mu, bukan lolos jadi unhandled promise rejection
> — yang di Node 15+ mematikan seluruh proses bot. Kirim `logger` ke `new VoipClient({ … })`
> untuk melihat peringatannya, dan periksa relay dengan:
>
> ```js
> relay.getStats()            // { sentPackets, receivedPackets, droppedPackets, openConnections, … }
> relay.getConnectionStats()  // per relay: state, bufferedPackets, bufferedBytes, lastIceRttMs, drop
> ```
>
> `droppedPackets` di `getStats()` sekarang benar-benar menghitung; sebelum v2.4.8 selalu `0`.
>
> Reconnect juga sudah aman: signaling bridge menambal auth state bersama **sekali saja** dan
> melepas dirinya saat reconnect maupun `voip.disconnect()`. Sebelum v2.4.8, tiap reconnect
> meninggalkan satu wrapper lagi (berikut seluruh bridge lama) menempel permanen di
> `authState.keys.set`. `bridge.dispose()` / `bridge.isDisposed` tersedia publik kalau kamu
> memakai bridge-nya langsung.

```js
import { VoipClient } from '@japofc/baileys'

const voip = new VoipClient({ resourcesPath: './voip-resources' })
await voip.connectWithSocket(sock)

const panggilan = await voip.call('628123456789')

panggilan.on('ringing', () => console.log('Berdering...'))
panggilan.on('connected', () => console.log('Panggilan tersambung'))
panggilan.on('ended', (alasan) => console.log('Panggilan berakhir:', alasan))
```

`ActiveCall` (dikembalikan `.call()`) dan `CallState` juga diekspor langsung kalau butuh kontrol status panggilan yang lebih detail.

**Menjawab panggilan masuk** — offer dilacak, jadi bot bisa mengangkat (1:1) atau join (grup):

```js
import { attachVoip } from '@japofc/baileys'
const voip = await attachVoip(sock) // juga disimpan sebagai sock.voip

voip.on('incoming-call', async ({ callId, from, isGroupCall, busy }) => {
    if (busy) return
    if (isGroupCall) await voip.joinGroupCall(callId, { audioSource: './salam.mp3' })
    else await voip.answerCall(callId, { audioSource: './salam.mp3' })
})

// ...atau sepenuhnya otomatis:
await attachVoip(sock, { autoAnswer: true })   // angkat panggilan 1:1
await attachVoip(sock, { autoJoinGroup: true }) // join panggilan grup
await attachVoip(sock, { autoReject: true, autoRejectText: 'Bot tidak bisa menerima panggilan 🙏' })

// offer yang masih menunggu (jawab sebelum `offerTtlMs`, default 45 detik):
voip.getPendingCalls() // → [{ callId, from, isGroupCall, ... }]
```

**Panggilan grup / multi-pihak:**

```js
const gcall = await voip.startGroupCall(groupJid, ['62812…', '62813…'], { chatName: 'Rapat' })
await voip.inviteToGroupCall('62814…')
await voip.removeGroupParticipant('62813@s.whatsapp.net')
await voip.rejoinGroupCall() // pemulihan setelah putus

voip.on('group-call-started', console.log)
voip.on('group-call-joined', console.log)
```

Panggilan juga mendukung reaksi, angkat tangan, rekaman, dan call link:

```js
const panggilan = await voip.call('628123456789', { audioSource: './salam.mp3' })
panggilan.react('👍')
panggilan.setHandRaised(true)
const stopRekam = panggilan.recordToFile('./panggilan.wav') // peer lawan → .wav

// atau ambil audio masuk sebagai stream (frame-nya salinan mandiri sejak v2.4.8):
const pcm = panggilan.audioStream({ encoding: 'pcm16' })  // 16-bit LE, pipe ke mana saja
pcm.pipe(createWriteStream('./peer.raw'))
panggilan.audioStream()                                   // frame Float32Array objectMode
await voip.previewCallLink('token-call-link')

// 🔀 ganti audio yang diputar TANPA menutup panggilan (alur gaya IVR)
panggilan.setAudioSource('./menu.mp3')                  // file/URL
panggilan.setAudioSource({ data: buffer, ext: 'mp3' })  // audio in-memory
panggilan.setAudioSource('lavfi:sine=frequency=440')    // nada hasil generate
panggilan.setAudioSource('silence')                     // berhenti memutar, tetap di panggilan
```

**Reconnect & pemulihan** — watchdog memantau transport relay selama panggilan
(`watchdogIntervalMs`/`watchdogMaxSilent`); saat relay mati dia memancarkan `call-degraded`
dan otomatis mengirim ulang rekey kripto + offer. Kontrol manual:

```js
voip.on('call-degraded', ({ callId }) => console.log('relay mati, memulihkan', callId))
voip.on('call-recovery', (r) => console.log('hasil pemulihan', r))
await voip.recoverCall({}) // manual: { rekey: true, offer: true }
voip.getStats()            // { busy, callId, call, relay }
sock.ev.on('call', (calls) => { /* jalur offer/reject standar tetap jalan */ })
```

**Menyegarkan stack WASM** — kalau panggilan rusak setelah update WA Web, ambil ulang build VoIP resmi langsung dari bootloader endpoint WhatsApp Web:

```bash
npm run voip:fetch-wasm
```

Default-nya tidak perlu browser. Kalau suatu saat respons bootloader publik berubah, script masih bisa fallback ke sesi Chrome yang sudah login dengan `CALL_WASM_FETCH_MODE=browser` dan `--remote-debugging-port=9222`.

---

## 🔎 Query Sinkronisasi User

`WAUSync` (`USyncQuery` / `USyncUser` + protokol) memungkinkan kamu mengecek hal seperti registrasi WhatsApp, daftar perangkat, status, dan info username sebuah JID sebelum mengirim pesan — mekanisme yang sama di balik `sock.onWhatsApp()`.

```js
import { USyncQuery, USyncUser, USyncContactProtocol } from '@japofc/baileys'

const query = new USyncQuery()
    .withContext('interactive')
    .withMode('query')
    .withUser(new USyncUser().withPhone('628123456789'))

query.protocols.push(new USyncContactProtocol())

const hasil = await sock.executeUSyncQuery(query)
```

Protokol yang tersedia: `USyncContactProtocol`, `USyncDeviceProtocol`, `USyncStatusProtocol`, `USyncUsernameProtocol`, `USyncDisappearingModeProtocol`, `UsyncBotProfileProtocol`, `UsyncLIDProtocol`.

---

## 👤 Manajemen Username

Wrapper level tinggi di atas fitur username WhatsApp (handle `@username` yang bisa kamu pakai supaya nomor tidak terekspos), di atas `USyncUsernameProtocol`.

> ⚠️ **Rotasi query-ID.** Query ID GraphQL di balik panggilan-panggilan ini di-capture dari sesi WA Web live, dan WhatsApp merotasinya sewaktu-waktu. Kalau itu terjadi, panggilan gagal dengan `GraphQL server error: Bad Request` (atau `unexpected response structure`). Tidak perlu menunggu update paket — hot-patch ID yang dirotasi langsung saat runtime:
>
> ```js
> const sock = makeWASocket({
>     usernameQueryIds: { CHECK: '<id-baru>', SET: '<id-baru>' } // bisa override:
>     // CHECK, CHECK_MULTI, SET, GET, GET_RECOMMENDATIONS, PIN_SET
> })
> ```
>
> ID baru bisa di-capture dari sesi WA Web live (DevTools → Network → WS frames → cari query `xmlns="w:mex"`).

```js
// Cek ketersediaan + dapatkan saran kalau sudah dipakai
const cek = await sock.checkUsername('J.AP')
// { available: true, username: 'J.AP' }
// atau: { available: false, suggestions: [...], rejectionReasons: [...] }

// Klaim username
await sock.setUsername('J.AP', { source: sock.USERNAME_SOURCE.USER_INPUT })

// Kunci dengan PIN supaya tidak bisa diganti tanpa PIN
await sock.setUsernamePin('123456')

// Baca username sendiri / hapus
const punyaku = await sock.getMyUsername()
await sock.deleteUsername()

// Resolusi username ke JID (berbasis USync, seperti onWhatsApp() tapi via username)
const user = await sock.findUserByUsername('seseorang')
// { jid: '628...@s.whatsapp.net', contact: false }

// Resolusi massal username untuk daftar kontak yang dikenal
const usernames = await sock.fetchContactUsernames(jid1, jid2, jid3)

// Dapatkan saran dari WA sendiri (mis. untuk alur onboarding)
const rekomendasi = await sock.getUsernameRecommendations()
```

> Butuh akun tier Community/Contact dalam kondisi baik — akun yang kena pembatasan WA untuk nomor baru/belum terverifikasi bisa mendapat `INVALID` atau saran kosong terlepas dari ketersediaan username sebenarnya.

---

## 🤖 Bot Framework

Lapisan opsional level lebih tinggi di atas socket mentah: routing middleware, dispatcher `!command`, antrean pesan yang selamat dari disconnect, auto-reconnect exponential backoff, penyimpanan sesi per-JID, statistik aktivitas grup, dan helper konversi media (stiker/voice note) — supaya proyek bot baru tidak perlu bikin manajemen sesi/context dari nol setiap kali.

Butuh peer dependency `better-sqlite3` (penyimpanan sesi + statistik) dan `fluent-ffmpeg` (konversi stiker/voice note, sudah tercantum di atas) — keduanya gagal dengan petunjuk install, bukan crash, kalau kamu memakai fitur Framework yang membutuhkannya tanpa menginstall dulu.

```js
import { Bot } from '@japofc/baileys'

const bot = new Bot({
    socketConfig: { printQRInTerminal: true },
    dbPath: './bot.db',   // sesi + statistik, default 'baileys_store.db'
    enableStats: true     // leaderboard pesan/stiker grup + deteksi ghost
})

bot.command('!ping', async (ctx) => {
    await ctx.reply({ text: 'pong' })
})

bot.command('!sticker', async (ctx) => {
    if (!ctx.quoted?.imageMessage) return ctx.reply({ text: 'Reply gambar dengan !sticker' })
    // ctx.replySticker() mengurus konversi WebP untukmu
    await ctx.replySticker(bufferGambar, { packname: 'J.AP Pack', author: 'kamu' })
})

bot.onText(async (ctx) => {
    // ctx.session() / ctx.setSession() / ctx.updateSession() / ctx.clearSession()
    // menyimpan state kecil per-chat (mis. alur multi-langkah) ke SQLite otomatis
    const state = ctx.session()
    if (state?.awaitingReply) {
        ctx.updateSession((s) => ({ ...s, awaitingReply: false }))
    }
})

await bot.start()
```

`Context`, `SessionManager`, `StatsManager`, `MediaManager`, dan `SQLiteStore` juga diekspor sendiri-sendiri kalau kamu cuma butuh satu bagian, bukan class `Bot` penuh.

> File-file ini masih di-ship sebagai `.js` polos — deklarasi `.d.ts` tulisan tangan untuk modul Framework belum ditambahkan, berbeda dengan permukaan fork ini yang lain yang sudah bertipe penuh.

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
router.command('kick', handler, { adminOnly: true, category: 'Admin' })
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

## 🛠 Lingkungan yang Direkomendasikan

| Kebutuhan | Versi |
|---|---|
| Node.js | 20+ |
| Sistem modul | ESM |
| WhatsApp | Multi Device terbaru |

---

## 📘 Dukungan TypeScript

`.d.ts` penuh: setiap file `.js` yang di-ship punya deklarasi TypeScript pasangan (dijaga `tests/types-parity.test.js`), dan seluruh paket terverifikasi nol error di bawah `tsc --strict`. `import { ... } from '@japofc/baileys'` ter-resolve tanpa paket `@types/` tambahan (selain `@types/node` standar yang dimiliki semua proyek TS Node): `makeWASocket` termasuk method username dan konstanta `USERNAME_*`, semua definisi `Types/*`, `WAProto`, store, `Utils/*`, builder pesan (`Button`, `Poll`, `Carousel`, `AIRich`, `A2UI`, … dengan tipe node Bloks), Bot Framework (`Bot`, `Context`, …), dan klien VoIP (`VoipClient`, `ActiveCall`, …). Payload wire kompleks bertipe record longgar di bagian yang WhatsApp tidak mempublikasikan skemanya.

---

## ❓ FAQ & Troubleshooting

<details>
<summary><b>Koneksi terus putus / reconnect loop</b></summary>
<br/>

Cek `connection.update` untuk field `lastDisconnect.error`. Kalau status code-nya `401` (loggedOut), sesi memang sudah invalid dan perlu scan ulang QR — jangan auto-reconnect di kondisi ini. Untuk status lain (`428`, `440`, dsb.), reconnect dengan backoff biasanya cukup.

</details>

<details>
<summary><b>QR tidak muncul / tidak ke-scan</b></summary>
<br/>

Di upstream Baileys `printQRInTerminal` sudah dihapus, tapi di paket ini opsi tersebut **berfungsi lagi** — QR digambar otomatis oleh renderer bawaan (vendored [qrcodegen](https://github.com/nayuki/QR-Code-generator), tanpa dependency tambahan). Bisa juga render manual dari event `qr` dengan `renderQRToTerminal(qr)` / `qrToSVG(qr)` / `qrToPNG(qr)` / `qrToMatrix(qr)`. Kalau QR muncul tapi gagal linking, biasanya karena versi WA Web (`version` di `makeWASocket`) sudah kedaluwarsa; fetch versi terbaru lewat `fetchBestWaVersion()` (chain: sw.js WA → fork baileys → fallback). Framework `Bot` sudah melakukannya otomatis tiap `start()`/reconnect (matikan dengan `versionCheck: false`). QR kelihatan "kebalik" di terminal tema terang? Pakai `renderQRToTerminal(qr, { inverted: true })`.

</details>

<details>
<summary><b>Error "Bad MAC" / pesan gagal didekripsi</b></summary>
<br/>

Umumnya terjadi kalau folder auth state korup atau sesi dipakai di lebih dari satu proses secara bersamaan. Pastikan hanya satu instance yang menulis ke folder auth state yang sama, dan pertimbangkan `pruneStaleAuthFiles()` untuk membersihkan sender-key lama secara berkala.

</details>

<details>
<summary><b>Memory terus naik di bot yang jalan lama</b></summary>
<br/>

Kalau pakai `makeInMemoryStore()`, cache chat/message/contact akan terus tumbuh tanpa batas. Untuk bot yang jalan lama, pertimbangkan pindah ke salah satu backend `makePersistentStore()` (SQLite/Redis/dst) dan pakai `event-buffer` untuk meredam lonjakan event di trafik tinggi.

</details>

<details>
<summary><b>Voice call gagal connect</b></summary>
<br/>

Fitur ini masih experimental dan butuh peer dependency `@roamhq/wrtc` — pastikan sudah terinstall dan platform kamu didukung native binding-nya. Cek event `call.on('ended', reason => ...)` untuk detail penyebab gagalnya.

</details>

<details>
<summary><b>Fitur media error / "ffmpeg not found"</b></summary>
<br/>

Jalankan `printEnvironmentReport()` (lihat [doctor](#cek-lingkunganmu-doctor)) — dia menunjukkan persis apa yang kurang. Untuk ffmpeg: di server `npm i ffmpeg-static`, di Termux `pkg install ffmpeg` — dua-duanya auto-terdeteksi tanpa konfigurasi.

</details>

<details>
<summary><b>Banner startup mengganggu / mau dimatikan</b></summary>
<br/>

Banner adalah bagian dari identitas paket ini dan tampil sekali per proses. Dirancang supaya tidak mengganggu: di terminal interaktif tampil banner penuh; di log CI/pm2/pipe menyusut jadi satu baris teks polos (tanpa kode ANSI, jadi pipeline log JSON/terstruktur tidak pernah rusak). `NO_COLOR=1` menghilangkan pewarnaan, bukan banner-nya.

Sejak v2.4.3 banner sekaligus jadi kartu kesehatan startup — wordmark gradien plus panel info berbingkai: versi paket, versi WA Web bawaan, node/platform/pid, dan tagline harian yang berganti:

```text
       ██╗   █████╗   ██████╗
       ██║  ██╔══██╗  ██╔══██╗
       ██║  ███████║  ██████╔╝
  ██   ██║  ██╔══██║  ██╔═══╝
  ╚█████╔╝  ██║  ██║  ██║
   ╚════╝   ╚═╝  ╚═╝  ╚═╝

  ╭────────────────────────────────────────────────────────────────╮
  │ @japofc/baileys v2.4.5   ● typed · extended · battle-tested    │
  │ WA Web 2.3000.1048680055   node 20.20.2 · linux/x64 · pid 1472 │
  │ ⚡ anti-ban toolkit   🛡️ bug-shield   📚 github.com/JAPofc/baileys │
  ╰────────────────────────────────────────────────────────────────╯
   "from Termux to production."  — Made with 🍃 by J.AP
```

</details>

---

## 🤝 Kontribusi

Kontribusi dipersilakan, terutama untuk perbaikan bug, dokumentasi, dan enhancement pada `MessageBuilder` / `AIRich`.

1. Fork repo ini, buat branch dari `main` (`feat/nama-fitur` atau `fix/nama-bug`)
2. Pastikan perubahan tetap ESM-only dan menyertakan/menyesuaikan `.d.ts` terkait
3. Uji perubahan pada minimal satu jalur auth state + satu store backend sebelum PR
4. Buka Pull Request dengan deskripsi singkat: apa yang berubah dan kenapa

Untuk laporan bug, sertakan versi Node.js, cara reproduksi, dan potongan log `lastDisconnect.error` bila relevan — atau lebih baik lagi, lampirkan output `printEnvironmentReport()` dan `monitor.getDebugInfo()` (dua-duanya aman, rahasia sudah diredaksi otomatis).

---

## 🙏 Kredit

Dibangun di atas pundak komunitas open-source WhatsApp.

Detail lengkap dan ketentuan lisensi per komponen: lihat [`NOTICE.md`](./NOTICE.md).

---

## 👑 Maintainer

<table>
<tr>
<td width="180" align="center">
<img src="https://github.com/JAPofc.png" width="160" alt="Avatar J.AP" style="border-radius:50%"/>
</td>
<td>

**J.AP**

- GitHub: [github.com/JAPofc](https://github.com/JAPofc)
- Paket: [`@japofc/baileys`](https://www.npmjs.com/package/@japofc/baileys)
- ✦ Merawat fork ini sendirian — issue & PR dipersilakan dan direview langsung.

</td>
</tr>
</table>

---

## 📝 Arsip Catatan Rilis

> Riwayat lengkap tiap versi ada di [CHANGELOG.md](./CHANGELOG.md). Di bawah ini ringkasan rilis-rilis sebelumnya.

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

## ⚠️ Disclaimer

Proyek ini adalah fork independen.
Gunakan dengan bertanggung jawab dan patuhi Ketentuan Layanan WhatsApp.

---

<div align="center">

Dibuat dengan 🍃 oleh **JAP**

Terima kasih sudah mampir, sampai jumpa 👋

<a href="#top">⬆️ Kembali ke atas</a>

</div>
