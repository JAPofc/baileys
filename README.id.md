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
<img src="https://img.shields.io/badge/tes-2574%20lulus-2ecc71?style=flat-square&logo=nodedotjs&logoColor=white" alt="tes lulus" />
<img src="https://img.shields.io/badge/audit-high%3A%20bersih-2ecc71?style=flat-square&logo=npm&logoColor=white" alt="audit bersih" />
</p>

<p>
<a href="https://whatsapp.com/channel/0029VbEVFrILtOjAOu4FXa3r"><img src="https://img.shields.io/badge/Ikuti%20di%20WhatsApp-Channel%20JAPofc-25D366?style=for-the-badge&logo=whatsapp&logoColor=white" alt="Channel WhatsApp JAPofc" /></a>
</p>

<h4>

[Instalasi](#instalasi)&nbsp;·&nbsp;[Mulai cepat](#mulai-cepat)&nbsp;·&nbsp;[Dokumentasi](#dokumentasi)&nbsp;·&nbsp;[Kenapa fork ini](#kenapa-fork-ini)&nbsp;·&nbsp;[FAQ](./docs/id/faq.md)&nbsp;·&nbsp;[🇬🇧 English](./README.md)

</h4>

---

## Instalasi

```bash
npm i @japofc/baileys
```

Butuh Node.js 20+. ESM saja, tanpa script instalasi. Deklarasi TypeScript sudah termasuk.

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

Scan QR-nya, bot membalas `pong`. Program yang bisa langsung dijalankan ada di [`examples/`](./examples).

## Baru di 2.5.1

Empat API yang sebelumnya belum ada di sini — dan, sejauh yang saya temukan, belum ada juga
di fork Baileys mana pun:

```js
import { estimateMessageSize, createSendPacer, preflightMessage } from '@japofc/baileys'

// Sebesar apa sih pesan ini? Diukur pakai encoder protobuf asli.
const { bytes, heaviest, excludes } = await estimateMessageSize({ image: buf, caption: 'hi' })

// Valid nggak? Dicek offline, hasilnya temuan terstruktur, bukan throw saat kirim.
const pre = await preflightMessage({ poll: { name: 'q', values: ['a'] } }, { jid })
if (!pre.ok) console.log(pre.errors)       // [{ code: 'poll-option-count', ... }]

// Sebar kiriman sepanjang waktu: jeda minimum, jitter, kuota per menit/per jam.
const pacer = createSendPacer({ perMinute: 20 })
await pacer.schedule(() => sock.sendMessage(jid, { text: 'halo' }))
```

`estimateMessageSize()` tidak pernah menyentuh jaringan — media remote dilaporkan
`unmeasurable`, bukan diam-diam diunduh, dan ukuran yang tak diketahui bernilai `undefined`,
bukan `0`. `preflightMessage()` tidak pernah melempar, dikasih apa pun; hasil bersih berarti
"tidak ada yang salah secara lokal", bukan "pasti terkirim".

`SendPacer` **sengaja tidak** disebut alat anti-ban, dan `getStats()` tidak mengembalikan
apa pun soal keamanan akun. Tidak ada orang di luar WhatsApp yang tahu aturan penegakan
mereka — ini antrean dengan jam, dan cuma itu yang diklaimnya.

Juga baru: `sock.newsletterAction(jid, action)` dan `sock.newsletterReactionMode(jid, mode)`.

## Apa ini

Library WhatsApp Web yang dirawat, untuk yang menjalankan bot di produksi. Prioritasnya,
berurutan: socket berperilaku bisa ditebak, tipe tidak berbohong, dan tidak ada yang terjadi
di luar yang kode Anda minta.

- **Tidak ada join/follow diam-diam.** Helper join/follow ada; jalan hanya kalau Anda panggil.
- **Versi WA Web diresolusi langsung** lewat `makeWASocketAuto()`, jadi pairing tidak patah
  saat WhatsApp menaikkan versi minimumnya.
- **Backend auth** untuk file, SQLite, Redis, MongoDB, MySQL dan PostgreSQL.
- **Setiap perbaikan bisa direproduksi.** Masing-masing punya script repro dan test regresi.

## Dokumentasi

| Panduan | Isinya |
|---|---|
| [Mulai](./docs/id/mulai.md) | Instalasi, peer opsional, login kode pairing, auth state, backend store |
| [Mengirim pesan](./docs/id/pesan.md) | Tombol, native flow, carousel, poll, kartu AIRich, album, channel |
| [Referensi fitur](./docs/id/fitur.md) | Daftar kemampuan lengkap dan perilaku khas J.AP |
| [Fitur WA 2026](./docs/id/wa-2026.md) | Username, status mention, panggilan, user-sync, paket keamanan |
| [Bot framework](./docs/id/bot-framework.md) | `Bot`, middleware, command router, sesi, statistik |
| [Modul utilitas](./docs/id/utilitas.md) | 140+ helper: ekonomi, game, moderasi, media, penjadwalan |
| [FAQ & troubleshooting](./docs/id/faq.md) | Lingkungan, setup TypeScript, error yang sering muncul |
| [Pesan live](./docs/live-message.md) *(EN)* | Pesan progres yang memperbarui dirinya: edit digabung, no-op ditekan, anggaran edit |
| [Keputusan grup](./docs/quorum.md) *(EN)* | `Quorum`: voting admin yang menghitung dan mengunci dirinya sendiri |
| [Digest](./docs/digest.md) *(EN)* | Satu pesan ringkasan, bukan banjir notifikasi |
| [Provenance](./docs/provenance.md) *(EN)* | Sidik jari kode tahan rename dan pemeriksa atribusi |
| [Pengerasan SSRF](./docs/ssrf-hardening.md) *(EN)* | Guard URL, DNS rebinding, dan `pinDns` |
| [Riwayat rilis](./docs/id/riwayat-rilis.md) | Arsip catatan per versi |

Juga: [CHANGELOG](./CHANGELOG.md) · [BUGREPORT](./BUGREPORT.md) · [MIGRATION](./MIGRATION.md) · [NOTICE](./NOTICE.md)

## Kenapa fork ini

Kebanyakan fork Baileys cuma rebase plus beberapa helper. Yang ini pada dasarnya sebuah
**audit**: 227 cacat terdokumentasi, masing-masing dengan tingkat keparahan, script repro,
dan test regresi yang mengunci perilakunya. Contohnya:

| Bug | Gejala sebelum diperbaiki |
|---|---|
| [§2.132](./BUGREPORT.md) | Stream error `conflict` melempar *di dalam* handler yang justru harus menutup socket — tak ada reconnect, bot mati diam-diam |
| [§2.136](./BUGREPORT.md) | `Bot.stop()` meninggalkan socket terbuka, tetap memproses pesan ke store yang sudah ditutup, lalu bangkit sendiri |
| [§2.126](./BUGREPORT.md) | Perintah khusus admin lolos di DM, tempat yang tidak punya admin |
| [§2.123](./BUGREPORT.md) | Panjang 4 byte dari wire diakumulasi dengan operator signed 32-bit |
| [§2.133](./BUGREPORT.md) | Timestamp yang tidak pernah dikirim server dilaporkan sebagai 1 Jan 1970 |

Baca [BUGREPORT.md](./BUGREPORT.md) sebelum percaya klaim ini — justru itu alasan semuanya ditulis.

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
| Pacing kiriman &amp; rate limit (`SendPacer`, ramp pemanasan, batas aksi grup, klasifikasi disconnect) | ✅ | ⚠️ dijual sebagai "anti-ban" |
| Perisai pesan crash (bom mention, zalgo, spoof RTLO) | ✅ | ❌ |
| Dokter sesi + string sesi portabel/terenkripsi | ✅ | ❌ |
| Modul komunitas/bot (economy, game, sewa, moderasi — 140+ utils) | ✅ | ❌ |
| Branding EXIF stiker | ✅ murni JS | ⚠️ butuh `node-webpmux` |
| CLI (`doctor` / `session` / `sticker` / `export` / `wa`) | ✅ | ❌ |
| Logger dengan redaksi kredensial | ✅ | ❌ |

> Tabel ini menggambarkan fitur di level package, bukan benchmark performa. PR untuk memperbarui/mengoreksi tabel ini dipersilakan lewat [Kontribusi](#-kontribusi).

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

---

<div align="center">

**[⬆ kembali ke atas](#top)**

</div>
