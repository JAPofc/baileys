# Migrating from `@whiskeysockets/baileys`

**🇬🇧 English** · [🇮🇩 Bahasa Indonesia](#-migrasi-dari-whiskeysocketsbaileys-indonesia)

`@japofc/baileys` is a drop-in compatible fork: the entire upstream API surface still
works — same events, same `sendMessage` shapes, same auth-state contract. Migration is
usually **one line**. This guide covers that line, the few behavioural differences, and
the extras you get for free.

## 1. The one-line switch

```sh
npm rm @whiskeysockets/baileys
npm i @japofc/baileys
```

Then change the import — everything else stays:

```diff
- import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys'
+ import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@japofc/baileys'
```

Default export, named exports (`useMultiFileAuthState`, `DisconnectReason`,
`fetchLatestBaileysVersion`, `downloadMediaMessage`, `getContentType`, `proto`, …),
event names, and message content shapes are all unchanged.

> Your existing `auth_info/` folder keeps working — the auth-state format is identical.
> No re-pairing needed.

## 2. Behavioural differences to know about

| Upstream (7.x) | Here | What to do |
|---|---|---|
| `printQRInTerminal` **removed** (warning since 6.x) | **Works again** — built-in zero-dependency QR renderer | Nothing; or keep rendering from the `qr` event yourself |
| WA Web version hardcoded, updated per release | `makeWASocketAuto()` resolves the freshest version before connecting | Optional: switch to `await makeWASocketAuto(config)` to avoid stale-version 405s |
| Node >= 20 not checked at runtime | Checked at **import time** with a clear error | Nothing — just don't run Node < 20 |
| `sharp` optional, `jimp` fallback | Same chain plus `@napi-rs/image` in the middle | Nothing |
| ffmpeg looked up on `PATH` only | Central resolver: `setFfmpegPath()`/`FFMPEG_PATH` → `ffmpeg-static` → `@ffmpeg-installer` → `PATH` | Optional: `npm i ffmpeg-static` for zero-config media |
| No startup banner | One-time banner on first `makeWASocket()` (full on TTY, single plain line on CI/pipes) | Permanent package signature — `NO_COLOR=1` strips styling only |

Everything else — reconnect handling, store binding, group metadata, media
upload/download — behaves the same or strictly better (bug fixes are listed in
[CHANGELOG.md](./CHANGELOG.md), each locked by a regression test).

## 3. What you get on top (no code changes required)

All additive — ignore anything you don't need:

```js
import {
    makeWASocketAuto,      // auto WA-version factory
    autoReconnect,         // supervised reconnect: backoff, loggedOut-aware
    createDebugMonitor,    // safe observability snapshots (secrets redacted)
    checkEnvironment,      // "why doesn't X work on my machine?" doctor
    Button, Poll, Carousel, AIRich, JapBaileys,   // message builders
    Bot,                   // full bot framework (router/session/stats)
    VoipClient,            // experimental voice calls
} from '@japofc/baileys'
```

Plus socket methods upstream doesn't have: `sock.sendPin`, `sock.sendEvent`,
`sock.sendScheduledCall`, `sock.sendMiniApp`, `sock.tagAll`, `sock.hideTag`,
`sock.sendVoiceNote`, `sock.checkUsername`/`setUsername`, `sock.sendMentionAll`,
`sock.editPoll`, `sock.resolveSenderPn`, and more — see the [README](./README.md).

## 4. Check your setup after migrating

```sh
npx @japofc/baileys doctor
```

Prints Node version, which optional deps are installed, whether ffmpeg is found, and
actionable warnings. Exit code 0 = all good.

## 5. Troubleshooting the migration

- **`ERR_REQUIRE_ESM` / `require() of ES Module`** — this package is ESM-only (upstream
  7.x is too). Use `import`, or dynamic `import()` from CommonJS.
- **Types** — full `.d.ts` ships in-package; remove any `@types/…` baileys stubs.
- **Version pinning** — if you passed a `version: [2, 3000, …]` array to
  `makeWASocket`, it still works and is never overridden.

---

---

# 🇮🇩 Migrasi dari `@whiskeysockets/baileys` (Indonesia)

`@japofc/baileys` adalah fork yang kompatibel langsung: seluruh permukaan API upstream
tetap jalan — event sama, bentuk `sendMessage` sama, kontrak auth-state sama. Migrasi
biasanya **satu baris**. Panduan ini membahas baris itu, sedikit perbedaan perilaku,
dan bonus yang kamu dapat gratis.

## 1. Ganti satu baris

```sh
npm rm @whiskeysockets/baileys
npm i @japofc/baileys
```

Lalu ubah import-nya — sisanya tetap:

```diff
- import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys'
+ import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@japofc/baileys'
```

Default export, named export (`useMultiFileAuthState`, `DisconnectReason`,
`fetchLatestBaileysVersion`, `downloadMediaMessage`, `getContentType`, `proto`, …),
nama event, dan bentuk konten pesan semuanya tidak berubah.

> Folder `auth_info/` yang sudah ada tetap jalan — format auth-state identik.
> Tidak perlu pairing ulang.

## 2. Perbedaan perilaku yang perlu diketahui

| Upstream (7.x) | Di sini | Yang perlu dilakukan |
|---|---|---|
| `printQRInTerminal` **dihapus** (warning sejak 6.x) | **Berfungsi lagi** — renderer QR bawaan nol dependency | Tidak ada; atau tetap render sendiri dari event `qr` |
| Versi WA Web hardcode, diupdate per rilis | `makeWASocketAuto()` mengambil versi tersegar sebelum konek | Opsional: pindah ke `await makeWASocketAuto(config)` untuk menghindari 405 versi basi |
| Node >= 20 tidak dicek di runtime | Dicek saat **import** dengan error yang jelas | Tidak ada — asal jangan jalankan Node < 20 |
| `sharp` opsional, fallback `jimp` | Rantai sama plus `@napi-rs/image` di tengah | Tidak ada |
| ffmpeg dicari di `PATH` saja | Resolver terpusat: `setFfmpegPath()`/`FFMPEG_PATH` → `ffmpeg-static` → `@ffmpeg-installer` → `PATH` | Opsional: `npm i ffmpeg-static` (server) / `pkg install ffmpeg` (Termux) |
| Tanpa banner startup | Banner sekali-per-proses saat `makeWASocket()` pertama (penuh di TTY, satu baris polos di CI/pipe) | Tanda tangan permanen paket — `NO_COLOR=1` hanya menghapus pewarnaan |

Sisanya — penanganan reconnect, binding store, metadata grup, upload/download media —
berperilaku sama atau lebih baik (perbaikan bug tercatat di
[CHANGELOG.md](./CHANGELOG.md), masing-masing dikunci regression test).

## 3. Bonus yang kamu dapat (tanpa ubah kode)

Semua bersifat tambahan — abaikan yang tidak dibutuhkan:

```js
import {
    makeWASocketAuto,      // factory dengan versi WA otomatis
    autoReconnect,         // reconnect terkelola: backoff, sadar-loggedOut
    createDebugMonitor,    // snapshot observability aman (rahasia diredaksi)
    checkEnvironment,      // doctor "kenapa X tidak jalan di mesinku?"
    Button, Poll, Carousel, AIRich, JapBaileys,   // builder pesan
    Bot,                   // framework bot penuh (router/sesi/statistik)
    VoipClient,            // panggilan suara eksperimental
} from '@japofc/baileys'
```

Plus method socket yang tidak dimiliki upstream: `sock.sendPin`, `sock.sendEvent`,
`sock.sendScheduledCall`, `sock.sendMiniApp`, `sock.tagAll`, `sock.hideTag`,
`sock.sendVoiceNote`, `sock.checkUsername`/`setUsername`, `sock.sendMentionAll`,
`sock.editPoll`, `sock.resolveSenderPn`, dan lainnya — lihat [README.id.md](./README.id.md).

## 4. Cek setup setelah migrasi

```sh
npx @japofc/baileys doctor
```

Mencetak versi Node, dependency opsional mana yang terinstall, ffmpeg ketemu atau
tidak, dan warning yang actionable. Exit code 0 = semua beres.

## 5. Troubleshooting migrasi

- **`ERR_REQUIRE_ESM` / `require() of ES Module`** — paket ini ESM-only (upstream 7.x
  juga). Pakai `import`, atau `import()` dinamis dari CommonJS.
- **Types** — `.d.ts` lengkap sudah termasuk; hapus stub `@types/…` baileys apa pun.
- **Pin versi** — kalau kamu mengoper array `version: [2, 3000, …]` ke
  `makeWASocket`, itu tetap jalan dan tidak pernah ditimpa.
