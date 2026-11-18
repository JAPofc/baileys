# Bot framework

[← back to the README](../README.md)

## 🤖 Bot Framework

An optional, higher-level layer on top of the raw socket: middleware routing, a `!command` dispatcher, a message queue that survives disconnects, exponential-backoff auto-reconnect, per-JID session storage, group activity stats, and media (sticker/voice-note) conversion helpers — so a new bot project doesn't have to hand-roll session/context management every time.

Needs the `better-sqlite3` peer dependency (session + stats storage) and `fluent-ffmpeg` (sticker/voice-note conversion, already listed above) — both fail with an install hint rather than crashing if you use a Framework feature that needs them without installing them first.

```js
import { Bot } from '@japofc/baileys'

const bot = new Bot({
    socketConfig: { printQRInTerminal: true },
    dbPath: './bot.db',   // sessions + stats, defaults to 'baileys_store.db'
    enableStats: true     // group message/sticker leaderboards + ghost detection
})

bot.command('!ping', async (ctx) => {
    await ctx.reply({ text: 'pong' })
})

bot.command('!sticker', async (ctx) => {
    if (!ctx.quoted?.imageMessage) return ctx.reply({ text: 'Reply to an image with !sticker' })
    // ctx.replySticker() handles the WebP conversion for you
    await ctx.replySticker(imageBuffer, { packname: 'J.AP Pack', author: 'you' })
})

bot.onText(async (ctx) => {
    // ctx.session() / ctx.setSession() / ctx.updateSession() / ctx.clearSession()
    // persist small per-chat state (e.g. multi-step flows) to SQLite automatically
    const state = ctx.session()
    if (state?.awaitingReply) {
        ctx.updateSession((s) => ({ ...s, awaitingReply: false }))
    }
})

await bot.start()
```

`Context`, `SessionManager`, `StatsManager`, `MediaManager`, and `SQLiteStore` are also exported individually if you only need one piece rather than the full `Bot` class.

> These files ship as plain `.js` for now — hand-written `.d.ts` declarations for the Framework module haven't been added yet, unlike the rest of this fork's fully-typed surface.

---
