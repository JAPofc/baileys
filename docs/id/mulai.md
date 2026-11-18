# Instalasi, autentikasi & store

[← kembali ke README](../../README.id.md)

## 📦 Instalasi

```bash
npm install @japofc/baileys
```

Langsung dari GitHub:

```bash
npm install github:JAPofc/baileys
```

> Butuh **Node.js 20+** — dicek saat import dengan pesan error yang jelas (tanpa install script: paket ini sengaja **nol** hook `preinstall`/`postinstall`, jadi `npm ci --ignore-scripts` dan kebijakan supply-chain ketat langsung jalan).

> **Pindahan dari `@whiskeysockets/baileys`?** Migrasi biasanya cuma ganti satu baris import — lihat [MIGRATION.md](../../MIGRATION.md).

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

Versi lengkap yang bisa langsung dijalankan: [`examples/auto-reconnect-bot.js`](../../examples/auto-reconnect-bot.js).

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
