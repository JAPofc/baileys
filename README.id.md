<div align="center" id="top">

<img src="https://raw.githubusercontent.com/JAPofc/baileys/main/Media/banner.svg" width="100%" alt="@japofc/baileys — WhatsApp Web API, typed, extended, battle-tested"/>

<p>
<a href="https://www.npmjs.com/package/@japofc/baileys" target="_blank"><img src="https://img.shields.io/npm/v/@japofc/baileys?color=2ecc71&label=npm&style=for-the-badge" alt="versi npm"/></a>
<a href="https://www.npmjs.com/package/@japofc/baileys" target="_blank"><img src="https://img.shields.io/npm/dt/@japofc/baileys?color=3498db&style=for-the-badge" alt="unduhan npm"/></a>
<a href="https://github.com/JAPofc/baileys/stargazers" target="_blank"><img src="https://img.shields.io/github/stars/JAPofc/baileys?color=f1c40f&style=for-the-badge" alt="GitHub stars"/></a>
<a href="https://github.com/JAPofc/baileys/issues" target="_blank"><img src="https://img.shields.io/github/issues/JAPofc/baileys?color=e74c3c&style=for-the-badge" alt="GitHub issues"/></a>
</p>
<p>
<a href="https://github.com/JAPofc/baileys/actions/workflows/ci.yml" target="_blank"><img src="https://img.shields.io/github/actions/workflow/status/JAPofc/baileys/ci.yml?branch=main&style=flat-square&label=CI&color=2ecc71" alt="status CI"/></a>
<a href="https://japofc.github.io/baileys/" target="_blank"><img src="https://img.shields.io/badge/docs-typedoc-8e44ad?style=flat-square" alt="Dokumentasi API"/></a>
<img src="https://img.shields.io/badge/npm-provenance%20attested-2ecc71?style=flat-square&logo=npm&logoColor=white" alt="npm provenance"/>
<img src="https://img.shields.io/badge/tests-302%20passing-2ecc71?style=flat-square" alt="Tes"/>
<a href="https://socket.dev/npm/package/@japofc/baileys" target="_blank"><img src="https://socket.dev/api/badge/npm/package/@japofc/baileys" alt="Socket badge"/></a>
<img src="https://img.shields.io/badge/tsc%20--strict-clean-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="tsc strict bersih"/>
<img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen?style=flat-square" alt="Node >=20"/>
<img src="https://img.shields.io/badge/module-ESM-blue?style=flat-square" alt="ESM"/>
</p>

**🇮🇩 Bahasa Indonesia** · [🇬🇧 English](./README.md)

<p>
<a href="#-kenapa-fork-ini">Tentang</a> &#xa0;|&#xa0;
<a href="#-perbandingan">Perbandingan</a> &#xa0;|&#xa0;
<a href="#-fitur">Fitur</a> &#xa0;|&#xa0;
<a href="#-instalasi">Instalasi</a> &#xa0;|&#xa0;
<a href="#-mulai-cepat">Mulai Cepat</a> &#xa0;|&#xa0;
<a href="#-contoh-pemakaian">Contoh</a> &#xa0;|&#xa0;
<a href="#-faq--troubleshooting">FAQ</a> &#xa0;|&#xa0;
<a href="#-kontribusi">Kontribusi</a> &#xa0;|&#xa0;
<a href="#-maintainer">Maintainer</a>
</p>

</div>

---

## 🍃 Kenapa fork ini?

Kebanyakan fork Baileys cuma kode upstream yang di-rename plus beberapa snippet copy-paste. **Yang ini adalah pengembangan yang dirawat serius** — inti socket-nya diaudit dan dipatch (setiap perbaikan ditandai `JAP@Fix` di source code, jadi kamu bisa grep semua perubahan), dan ada subsistem utuh di sini yang tidak dimiliki upstream:

| | |
|---|---|
| 🔬 | **Inti yang diaudit, bukan sekadar re-export** — konsistensi store, lifecycle reconnect, pemulihan sesi Signal, dan parsing retry-receipt semuanya punya bug nyata yang direproduksi lalu diperbaiki di sini, masing-masing dikunci regression test |
| 🧪 | **302 tes + `tsc --strict` di CI** — bentuk pesan diuji round-trip lewat encode→decode protobuf sungguhan; smoke test paket terpublish jalan otomatis setelah tiap rilis npm |
| 📊 | **Observability bawaan** — `createDebugMonitor()` memberi status koneksi, persentil latensi pesan, hitungan error Signal, dan statistik retry, dengan rahasia (QR/kunci/token) diredaksi secara struktural |
| 🎯 | Dukungan native flow diperluas, carousel, kartu AIRich, mini-app |
| 🗄️ | Banyak backend auth & store langsung tersedia (file, SQLite, MongoDB, MySQL, PostgreSQL, Redis) |
| 📞 | Dukungan panggilan suara eksperimental (VoIP) — call stack WASM + relay WebRTC |
| 🎞️ | Auto-deteksi ffmpeg — `ffmpeg-static`, `@ffmpeg-installer`, atau binary sistem, dengan petunjuk install yang paham Termux |
| 🔒 | **Ramah supply-chain** — nol install script, npm provenance ter-attest, dokumentasi jujur (celah protokol didokumentasikan sebagai limitasi, tidak pernah dipalsukan) |

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
- Deteksi anti-delete
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

### Ekspansi Native Flow

<table>
<tr>
<td valign="top" width="33%">

**Tombol & Aksi**
- cta_reminder
- cta_cancel_reminder
- otp_button
- authentication_button
- call_button
- url_button
- reply_button
- voice_call
- video_call_button

</td>
<td valign="top" width="33%">

**Alur Commerce**
- catalog_message
- mpm
- card_message
- order_details
- order_status
- review_and_pay
- payment_status
- payment_method

</td>
<td valign="top" width="33%">

**Navigasi & Lainnya**
- address_message
- send_location
- track_order
- reorder
- cancel_order
- clear_chat
- navigateToScreen
- flow_action

</td>
</tr>
</table>

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
| `node-webpmux` | Metadata EXIF packname/author pada stiker via `MediaManager.convertToSticker()` — tidak dibutuhkan untuk konversi stiker biasa |
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

---

## 🔐 Autentikasi

Empat backend auth-state tersedia langsung. Semuanya mengembalikan bentuk `{ state, saveCreds }` yang sama seperti yang diharapkan `makeWASocket({ auth })`, jadi bisa saling tukar tanpa ubah kode.

| Fungsi | Penyimpanan | Cocok untuk |
|---|---|---|
| `useMultiFileAuthState(folder)` | Satu file JSON per kunci, di disk | Pilihan default — sederhana, mudah di-debug, jalan di mana saja |
| `useSingleFileAuthState(namaFile)` | Satu file JSON, di disk | Bot kecil yang lebih mudah kelola/backup satu file |
| `useSqliteAuthState(opsi)` | SQLite (`better-sqlite3`) | Bot yang sudah pakai SQLite, atau mau auth di satu file DB embedded |
| `useCacheManagerAuthState(store, kunciSesi)` | Store apa pun yang kompatibel [`cacheable`](https://www.npmjs.com/package/@cacheable/node-cache) | Panel hosting multi-sesi, setup berbasis Redis |

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

### Carousel

> Setiap kartu harus dibuat dengan `Button(...).toCard()` dulu — kartu carousel sebenarnya adalah kartu tombol dengan header gambar/video.

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

`AIRich` mendukung `{ id, insertAt }` di setiap panggilan `add*()`/`set*()`, jadi kamu bisa menyisipkan blok relatif terhadap blok yang sudah ditambahkan sebelumnya, bukan selalu menambah di akhir — praktis untuk respons gaya streaming/edit-di-tempat yang dikombinasikan dengan `sendEdit(jid, id)`.

Builder lain yang layak diketahui: **`ButtonV2`** (tombol quick-reply sederhana), **`ButtonV3`** (`loadFrom(msg)` untuk mengedit pesan template yang sudah ada), dan **`Toolkit`** (helper statis: `Toolkit.resize()`, `Toolkit.fetchBuffer()`, `Toolkit.waitAllPromises()`, `Toolkit.extractIE()` untuk mem-parse link/sitasi/LaTeX `[label](url)` dari teks biasa).

### 📁 Peta Folder Builders (`lib/Builders/`)

Setiap builder pesan tinggal di file-nya sendiri di `lib/Builders/`, jadi kamu bisa melacak persis dari mana sebuah class berasal, bukan mengubek satu `MessageBuilder.js` raksasa. `index.js` hanyalah barrel file yang me-re-export semuanya (plus alias-aliasnya) untuk sintaks `import { ... } from '@japofc/baileys'` di level teratas.

| File | Ekspor | Untuk apa |
|---|---|---|
| `shared.js` | `Toolkit`, `BaseBuilder`, `RowBuilder` | Fondasi bersama semua builder lain. `BaseBuilder` memegang plumbing `send()`/context-info chainable yang umum, `RowBuilder` helper baris/section bersama, dan `Toolkit` kumpulan helper statis (`resize`, `fetchBuffer`, `waitAllPromises`, `extractIE`, helper durasi/preview media). Tidak ada yang dimaksudkan untuk dipakai langsung di kode bot — dia ada supaya `Button`, `Poll`, `Carousel`, dll. tidak mengimplementasi ulang plumbing yang sama. |
| `Button.js` | `Button`, `CardBuilder` | Builder tombol interaktif/native-flow utama — header (gambar/video/dokumen), helper CTA (`addUrl`, `addCall`, `addReply`, dan set native-flow yang lebih luas), plus `.toCard()` untuk mengubah pesan tombol menjadi kartu `Carousel`. |
| `ButtonV2.js` | `ButtonV2` | Varian lebih ringan yang terbatas pada tombol quick-reply sederhana — pakai ini kalau tidak butuh permukaan native-flow penuh milik `Button`. |
| `ButtonV3.js` | `ButtonV3` | Berpusat pada `loadFrom(msg)` — memuat `templateMessage` yang sudah ada (misalnya yang kamu fetch atau di-quote) supaya bisa diedit di tempat, bukan dibangun dari nol. |
| `Carousel.js` | `Carousel` | Merangkai hasil `Button(...).toCard()` menjadi carousel kartu yang bisa digeser. Dibatasi `Carousel.MAX_CARDS` (10) karena WhatsApp diam-diam memotong apa pun di atas itu. |
| `Poll.js` | `Poll` | Builder pesan poll/voting — pertanyaan, opsi, single/multi-select, mode pemilih tersembunyi, penandaan jawaban benar, kedaluwarsa. |
| `AIRich.js` | `AIRich` (+ alias `ORich`, `AIJap`, `LeafRich`, `JapAI`, `JapRich`, `RichJap`) | Builder respons gaya asisten AI yang dijelaskan di atas — heading, teks berformat, tabel, kartu media/produk/post, kartu tugas/progres, banner tips, saran quick-reply. |
| `A2UI.js` | `A2UI`, `sendA2UIWidget` | Builder widget A2UI/Bloks level rendah. Membangun tree `components` flat (Column/Row → `children`, Card/Button → `child`, Modal → `trigger`/`content`) yang diharapkan widget Bloks dan mengirimnya lewat jalur `getBizBinaryNode()` yang sama dengan `Button`/`ButtonV2`, jadi node level wire selalu cocok dengan nama tombol yang benar-benar terkirim. |
| `JapBaileys.js` | `JapBaileys` | **Hub** builder terpadu — satu objek yang membungkus semua builder di atas di balik nama method pendek (`.button()`, `.buttonV2()`, `.buttonV3()`, `.carousel()`, `.poll()`, `.airich()`, `.a2ui()`), plus alias PascalCase (`.Button()`, `.Carousel()`, `.Poll()`, `.AIRich()`, `.A2UI()`) untuk developer yang lebih suka gaya penamaan itu. Tidak ada yang baru diimplementasikan di sini — murni satu pintu masuk atas class-class individual. |
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
  berhasil di-capture library publik mana pun (diverifikasi ulang Sep 2026 terhadap
  upstream Baileys, whatsmeow, dan semua fork aktif). Sampai itu terjadi, repo ini
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

`npm test` menjalankan suite offline (`tests/`, tanpa jaringan).

---

## 📞 Panggilan Suara & Video

Dukungan panggilan audio eksperimental via call stack WASM terbundel + relay WebRTC. Butuh peer dependency opsional `@roamhq/wrtc`.

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
await voip.previewCallLink('token-call-link')
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

**Menyegarkan stack WASM** — kalau panggilan rusak setelah update WA Web, ambil ulang build VoIP resmi dari browser kamu sendiri (Chrome dengan `--remote-debugging-port=9222` + web.whatsapp.com terbuka):

```bash
npm run voip:fetch-wasm
```

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

Sampel utilitas yang diekspor dari `lib/Utils` di luar builder pesan di atas:

| Modul | Fungsinya |
|---|---|
| `anti-delete` | Deteksi dan pulihkan pesan yang dihapus pengirim untuk semua orang |
| `auto-reply` | Engine auto-responder sederhana berbasis kata kunci/pola |
| `message-search` | Cari pesan di cache/store, membuka wrapper ephemeral/view-once dulu |
| `message-retry-manager` | Menangani protokol retry-receipt WhatsApp untuk pesan yang gagal didekripsi |
| `scheduling` | Jadwalkan pesan/aksi untuk dikirim nanti |
| `business` | Helper profil bisnis & katalog |
| `chat-control` | Helper pin, mute, arsip, dan tandai dibaca/belum |
| `chat-history-helpers` | Bekerja dengan payload riwayat chat tersinkron |
| `link-preview` | Membuat metadata preview link untuk pesan keluar |
| `stickerpack` | Bangun dan kirim paket stiker (termasuk animasi/Lottie) |
| `templates` | Helper pesan template WhatsApp Business lama |
| `vcard` | Bangun payload vCard (kartu kontak) |
| `status` | Posting dan kelola update Status WhatsApp |
| `event-buffer` | Buffer/gabungkan event socket bervolume tinggi untuk bot berat |
| `doctor` | `checkEnvironment()` / `printEnvironmentReport()` — diagnosa lingkungan sekali panggil |

Setiap modul di atas punya `.d.ts` pasangan, jadi editormu menampilkan dokumentasi hover lengkap apa pun yang kamu import.

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

## ⚠️ Disclaimer

Proyek ini adalah fork independen.
Gunakan dengan bertanggung jawab dan patuhi Ketentuan Layanan WhatsApp.

---

<div align="center">

Dibuat dengan 🍃 oleh **JAP**

Terima kasih sudah mampir, sampai jumpa 👋

<a href="#top">⬆️ Kembali ke atas</a>

</div>
