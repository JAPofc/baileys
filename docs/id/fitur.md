# Referensi fitur

[← kembali ke README](../../README.id.md)

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
