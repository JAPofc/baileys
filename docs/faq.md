# FAQ & troubleshooting

[← back to the README](../README.md)

## 🛠 Recommended Environment

| Requirement | Version |
|---|---|
| Node.js | 20+ |
| Module system | ESM |
| WhatsApp | Latest Multi Device |

---

## 📘 TypeScript Support

Full `.d.ts`: every shipped `.js` file has a matching TypeScript declaration (guarded by `tests/types-parity.test.js`), and the whole package verifies at zero errors under `tsc --strict`. `import { ... } from '@japofc/baileys'` resolves with no `@types/` package needed (beyond the standard `@types/node` every Node TS project has): `makeWASocket` incl. the username methods and `USERNAME_*` constants, all `Types/*` definitions, `WAProto`, stores, `Utils/*`, the message builders (`Button`, `Poll`, `Carousel`, `AIRich`, `A2UI`, … with Bloks node types), the Bot Framework (`Bot`, `Context`, …), and the VoIP client (`VoipClient`, `ActiveCall`, …). Complex wire payloads are typed as loose records where WhatsApp publishes no schema.

---

## ❓ FAQ & Troubleshooting

<details>
<summary><b>Connection keeps dropping / reconnect loop</b></summary>
<br/>

Check the `lastDisconnect.error` field on `connection.update`. If the status code is `401` (loggedOut), the session really is invalid and needs a fresh QR scan — do not auto-reconnect in that state. For other codes (`428`, `440`, etc.), reconnecting with backoff is usually enough.

</details>

<details>
<summary><b>QR not showing / not scanning</b></summary>
<br/>

Upstream Baileys removed `printQRInTerminal`, but in this package the option **works again** — the QR is drawn automatically by the built-in renderer (vendored [qrcodegen](https://github.com/nayuki/QR-Code-generator), zero extra dependencies). You can also render manually from the `qr` event with `renderQRToTerminal(qr)` / `qrToSVG(qr)` / `qrToPNG(qr)` / `qrToMatrix(qr)`. If the QR shows but linking fails, the WA Web version (`version` in `makeWASocket`) is usually stale; fetch the latest via `fetchBestWaVersion()` (chain: WA's sw.js → baileys forks → fallback). The `Bot` framework already does this automatically on every `start()`/reconnect (disable with `versionCheck: false`). QR looks "inverted" on a light terminal theme? Use `renderQRToTerminal(qr, { inverted: true })`.

</details>

<details>
<summary><b>"Bad MAC" errors / messages fail to decrypt</b></summary>
<br/>

This usually happens when the auth state folder is corrupted or the session is used by more than one process at the same time. Make sure only one instance writes to a given auth state folder, and consider `pruneStaleAuthFiles()` to clean up stale sender keys periodically.

</details>

<details>
<summary><b>Memory keeps growing on long-running bots</b></summary>
<br/>

With `makeInMemoryStore()`, the chat/message/contact caches grow without bound. For long-running bots, consider switching to one of the `makePersistentStore()` backends (SQLite/Redis/etc.) and use `event-buffer` to absorb event bursts under high traffic.

</details>

<details>
<summary><b>Voice call fails to connect</b></summary>
<br/>

This feature is still experimental and needs the `@roamhq/wrtc` peer dependency — make sure it's installed and that its native bindings support your platform. Check the `call.on('ended', reason => ...)` event for details on why it failed.

</details>

<details>
<summary><b>Media features failing / "ffmpeg not found"</b></summary>
<br/>

Run `printEnvironmentReport()` (see [doctor](#check-your-environment-doctor)) — it shows exactly what's missing. For ffmpeg: on servers `npm i ffmpeg-static`, on Termux `pkg install ffmpeg` — both auto-detected with zero config.

</details>

<details>
<summary><b>Startup banner is in the way / want it off</b></summary>
<br/>

The banner is part of this package's identity and shows once per process. It's designed to stay out of your way: on an interactive terminal you get the full banner; in CI/pm2/piped logs it collapses to a single plain-text line (no ANSI codes, so JSON/structured log pipelines are never corrupted). `NO_COLOR=1` removes the styling but not the banner.

Since v2.4.3 the banner doubles as a startup health card — gradient wordmark plus a framed info panel showing the package version, the baked WA Web client version, node/platform/pid, and a rotating daily tagline:

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

## Termux / Android: `npm ci` gagal, dan apa yang harus dipakai

`sharp` dan `ffmpeg-static` **tidak punya binary prebuilt untuk Android**. Keduanya
devDependency (dipakai test), jadi `npm ci` mencoba menjalankan install script-nya dan
gagal di tengah jalan — yang sering menyisakan `node_modules` setengah jadi, sehingga
`npm ls ffmpeg-static` pun kosong.

Pasang begini:

```bash
npm run install:termux     # = npm install --ignore-scripts --no-audit --no-fund
pkg install ffmpeg         # ffmpeg asli Termux
```

`--ignore-scripts` membuat npm tidak mencoba mengunduh/membangun binary yang memang tidak
ada untuk Android. Paket lain tetap terpasang normal.

### Apakah fiturnya hilang?

Tidak, selama ffmpeg sistem ada:

- **ffmpeg** — `requireFfmpegPath()` mencari berurutan: `setFfmpegPath()` → `FFMPEG_PATH`
  → `ffmpeg-static` → `@ffmpeg-installer/ffmpeg` → **`ffmpeg` di `PATH`**. Jadi
  `pkg install ffmpeg` sudah cukup, tanpa konfigurasi.
- **gambar** — kalau `sharp` tidak ada, pemrosesan gambar jatuh ke **`jimp`**, yang murni
  JavaScript dan jalan di Termux. Lebih lambat, tapi berfungsi.

### Menjalankan test di Termux

```bash
npm run test:termux
```

Test yang benar-benar butuh `sharp` akan **di-skip dengan alasan tertulis**, bukan gagal:

```
ok 6 - §2.186/§2.187 sticker conversion # SKIP sharp is not installed (no prebuilt binary on this platform)
```

Jumlah test yang lulus akan lebih sedikit daripada di CI. Itu wajar — **bukan** tanda ada
yang rusak. CI (Ubuntu) memverifikasi `sharp` dan `ffmpeg` benar-benar ada dan **gagal
keras** kalau tidak, jadi skip di Termux tidak bisa menyembunyikan regresi dari siapa pun.

### Kenapa `ffmpeg-static` tidak dihapus saja dari devDependencies?

Karena ia yang membuat test media jalan **deterministik** di CI dan di mesin dev tanpa
ffmpeg sistem — tanpa itu, test media diam-diam ter-skip di mana-mana dan bug ffmpeg nyata
pernah lolos karenanya (§2.177). Di runtime ia tetap **optional peer**: pemakai paketmu
tidak pernah dipaksa memasangnya.
