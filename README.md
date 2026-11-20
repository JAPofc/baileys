<div align="center" id="top">

<img src="./Media/japofc-logo.png" width="140" alt="JAPofc logo" />

# @japofc/baileys

### ⚡ The maintained WhatsApp Web API for Node.js

<em>Typed ESM&nbsp;·&nbsp;always-current WA&nbsp;Web versioning&nbsp;·&nbsp;protocol-safe tooling&nbsp;·&nbsp;140+ production bot utilities</em>

<br/>

<!-- identity -->
<p>
<a href="https://www.npmjs.com/package/@japofc/baileys"><img src="https://img.shields.io/npm/v/@japofc/baileys?color=25D366&label=npm&logo=npm&logoColor=white&style=for-the-badge" alt="npm version" /></a>
<a href="https://www.npmjs.com/package/@japofc/baileys"><img src="https://img.shields.io/npm/dt/@japofc/baileys?color=128C7E&label=downloads&logo=npm&logoColor=white&style=for-the-badge" alt="npm downloads" /></a>
<a href="./LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0--or--later-555?style=for-the-badge" alt="GPL-3.0-or-later license" /></a>
</p>

<!-- quality -->
<p>
<img src="https://img.shields.io/badge/node-%E2%89%A5%2020-3C873A?style=flat-square&logo=node.js&logoColor=white" alt="Node >=20" />
<img src="https://img.shields.io/badge/module-ESM-F7DF1E?style=flat-square&logo=javascript&logoColor=black" alt="ESM only" />
<img src="https://img.shields.io/badge/types-bundled%20.d.ts-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript types" />
<img src="https://img.shields.io/badge/tests-1973%20passing-2ecc71?style=flat-square&logo=nodedotjs&logoColor=white" alt="tests passing" />
<img src="https://img.shields.io/badge/audit-0%20vulnerabilities-2ecc71?style=flat-square&logo=npm&logoColor=white" alt="npm audit clean" />
</p>

<p>
<a href="https://whatsapp.com/channel/0029VbEVFrILtOjAOu4FXa3r"><img src="https://img.shields.io/badge/Follow%20on%20WhatsApp-JAPofc%20Channel-25D366?style=for-the-badge&logo=whatsapp&logoColor=white" alt="JAPofc WhatsApp Channel" /></a>
</p>

<h4>

[Install](#install)&nbsp;·&nbsp;[Quick start](#quick-start)&nbsp;·&nbsp;[Docs](#documentation)&nbsp;·&nbsp;[Why this fork](#why-this-fork)&nbsp;·&nbsp;[FAQ](./docs/faq.md)&nbsp;·&nbsp;[🇮🇩 Bahasa Indonesia](./README.id.md)

</h4>

---

## Install

```bash
npm i @japofc/baileys
```

Node.js 20+, ESM-only, no install scripts. TypeScript declarations are bundled.

## Quick start

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

Scan the QR and the bot replies `pong`. Runnable programs live in [`examples/`](./examples).

## What it is

A maintained WhatsApp Web library for people running bots in production. The priorities, in
order: the socket behaves predictably, the types tell the truth, and nothing happens that
your code did not ask for.

- **No implicit joins or follows.** Join/follow helpers exist; they run only when you call them.
- **Live WA Web version resolution** via `makeWASocketAuto()`, so pairing does not break when
  WhatsApp bumps its minimum.
- **Auth backends** for files, SQLite, Redis, MongoDB, MySQL and PostgreSQL.
- **Every fix is reproducible.** Each one ships with a repro script and a regression test.

## Documentation

| Guide | What is in it |
|---|---|
| [Getting started](./docs/getting-started.md) | Install, optional peers, pairing code login, auth state, store backends |
| [Sending messages](./docs/messaging.md) | Buttons, native flow, carousel, polls, AIRich cards, albums, channels |
| [Feature reference](./docs/features.md) | The full capability list and the J.AP-exclusive behaviour |
| [WA 2026 features](./docs/wa-2026.md) | Usernames, status mentions, calls, user-sync queries, security pack |
| [Bot framework](./docs/bot-framework.md) | `Bot`, middleware, command router, sessions, stats |
| [Utility modules](./docs/utilities.md) | 140+ helpers: economy, games, moderation, media, scheduling |
| [FAQ & troubleshooting](./docs/faq.md) | Environment, TypeScript setup, common errors |
| [Digests](./docs/digest.md) | One summary message instead of a flood of notifications |
| [Group decisions](./docs/quorum.md) | `Quorum`: self-counting, self-locking admin votes |
| [Live messages](./docs/live-message.md) | Self-updating progress messages: coalesced edits, no-op suppression, edit budget |
| [Provenance](./docs/provenance.md) | Rename-resistant code fingerprints and the attribution checker |
| [SSRF hardening](./docs/ssrf-hardening.md) | The URL guard, DNS rebinding, and `pinDns` |
| [Release history](./docs/release-history.md) | Archived per-version notes |

Also: [CHANGELOG](./CHANGELOG.md) · [BUGREPORT](./BUGREPORT.md) · [MIGRATION](./MIGRATION.md) · [NOTICE](./NOTICE.md)

## Why this fork

Most Baileys forks are a rebase plus a few helpers. This one is primarily an **audit**:
135 documented defects, each with a severity, a reproduction script and a regression test
locking the behaviour. A sample of what that has turned up:

| Bug | Symptom before the fix |
|---|---|
| [§2.132](./BUGREPORT.md) | A `conflict` stream error threw *inside* the handler meant to close the socket — no reconnect, bot silently dead |
| [§2.136](./BUGREPORT.md) | `Bot.stop()` left the socket open, kept handling messages against a closed store, then resurrected itself |
| [§2.126](./BUGREPORT.md) | Admin-only commands were allowed in DMs, where nobody is an admin |
| [§2.123](./BUGREPORT.md) | A 4-byte length from the wire was accumulated with signed 32-bit operators |
| [§2.133](./BUGREPORT.md) | A timestamp the server never sent was reported as 1 Jan 1970 |

Read [BUGREPORT.md](./BUGREPORT.md) before trusting the claim — that is the point of writing it down.

## 🆚 Comparison

How `@japofc/baileys` stacks up against other Baileys libraries:

| Capability | `@japofc/baileys` | Other forks (typical) |
|---|:---:|:---:|
| Native Flow buttons (V1/V2/V3) | ✅ | ⚠️ partial |
| Carousel messages | ✅ | ❌ |
| Rich response cards (AIRich) | ✅ | ❌ |
| Commerce flow (catalog/order/payment) | ✅ | ⚠️ partial |
| Voice calling (VoIP) | ✅ experimental | ❌ |
| Multi-backend store (SQL/Mongo/Redis) | ✅ | ⚠️ partial |
| Full `.d.ts` TypeScript definitions | ✅ | ⚠️ partial |
| User sync queries (WAUSync) | ✅ | ✅ |
| Username management (check/set/pin/recommend) | ✅ | ❌ |
| Bot framework (middleware, session, stats) | ✅ | ❌ |
| Built-in QR render (terminal/SVG/PNG, zero deps) | ✅ | ❌ needs `qrcode-terminal` |
| Auto WA Web version resolution | ✅ | ❌ hardcoded |
| Status mentions (notify users/groups of your status) | ✅ | ❌ |
| Anti-ban toolkit (warmup ramps, group-op ceilings, disconnect classifier, Gaussian jitter) | ✅ | ❌ |
| Crash-message shield (mention bombs, zalgo, RTLO spoofing) | ✅ | ❌ |
| Session doctor + portable/encrypted session strings | ✅ | ❌ |
| Community/bot modules (economy, games, rental, moderation — 140+ utils) | ✅ | ❌ |
| Sticker EXIF branding | ✅ pure JS | ⚠️ needs `node-webpmux` |
| CLI (`doctor` / `session` / `sticker` / `export` / `wa`) | ✅ | ❌ |
| Credential-redacting logger | ✅ | ❌ |

> This table describes package-level features, not performance benchmarks. PRs to update or correct it are welcome via [Contributing](#-contributing).

---

---

## 🤝 Contributing

Contributions are welcome — especially bug fixes, documentation, and enhancements to `MessageBuilder` / `AIRich`.

1. Fork this repo and branch off `main` (`feat/feature-name` or `fix/bug-name`)
2. Keep changes ESM-only and add/update the matching `.d.ts` declarations
3. Test your change against at least one auth state path + one store backend before opening a PR
4. Open a Pull Request with a short description: what changed and why

For bug reports, include your Node.js version, reproduction steps, and the relevant `lastDisconnect.error` log snippet.

---

## 🙏 Credits

Built on the shoulders of the open-source WhatsApp community.

Full details and license terms per component: see [`NOTICE.md`](./NOTICE.md).

---

## 👑 Maintainer

<table>
<tr>
<td width="180" align="center">
<img src="https://github.com/JAPofc.png" width="160" alt="J.AP avatar" style="border-radius:50%"/>
</td>
<td>

**J.AP**

- GitHub: [github.com/JAPofc](https://github.com/JAPofc)
- Package: [`@japofc/baileys`](https://www.npmjs.com/package/@japofc/baileys)
- ✦ Maintains this fork solo — issues & PRs are welcome and reviewed personally.

</td>
</tr>
</table>

---

## ⚠️ Disclaimer

This project is an independent fork.
Use responsibly and follow WhatsApp Terms of Service.

---
---

<div align="center">

**[⬆ back to top](#top)**

</div>
