# @japofc/baileys examples

Ready-to-run bots. From the repo root:

```bash
npm install
node examples/echo-bot.js            # smallest bot: echo + humanized ping/pong
node examples/auto-reconnect-bot.js  # production skeleton: makeWASocketAuto + autoReconnect
node examples/sticker-bot.js         # !sticker — needs: npm i sharp
node examples/group-admin-bot.js     # welcome/goodbye + !tagall !hidetag !poll
```

Scan the printed QR with WhatsApp → Linked Devices on first run.
Session folders (`auth_*`) are git-ignored — delete one to re-pair.
