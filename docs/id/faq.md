# FAQ & troubleshooting

[← kembali ke README](../../README.id.md)

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
