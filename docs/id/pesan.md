# Mengirim pesan

[← kembali ke README](../../README.id.md)

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
