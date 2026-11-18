# Bot framework

[← kembali ke README](../../README.id.md)

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
