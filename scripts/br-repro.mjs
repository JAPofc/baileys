// §2.118 — WebSocketClient.close() never settled once the server had closed the socket.
// §2.119 — a numeric colour was silently dropped (assertColor returned undefined).
// Run: node scripts/br-repro.mjs
import { WebSocketServer } from 'ws'
import { WebSocketClient } from '../lib/Socket/Client/websocket.js'
import { generateWAMessageContent } from '../lib/Utils/messages.js'

const PORT = 18097
const wss = new WebSocketServer({ port: PORT })
wss.on('connection', ws => setTimeout(() => ws.close(), 100))   // the server drops us, as WhatsApp does on 515/conflict

const client = new WebSocketClient(new URL(`ws://127.0.0.1:${PORT}`), { connectTimeoutMs: 2000, options: {} })
client.connect()
await new Promise(r => client.once('open', r))
await new Promise(r => client.once('close', r))
console.log('server dropped us; isClosed =', client.isClosed)

const started = Date.now()
const settled = await Promise.race([
	client.close().then(() => 'resolved'),
	new Promise(r => setTimeout(() => r('still pending'), 1500))
])
console.log(`close() → ${settled} after ${Date.now() - started}ms`)
console.log('  (before: "still pending" — and it stayed pending forever, so sock.end() never finished)')

client.connect()
await new Promise(r => client.once('open', r))
console.log('reconnect on the same client:', client.isOpen, '(before: connect() silently did nothing)')
await client.close()
wss.close()

const argb = async color => (await generateWAMessageContent({ text: 'hai' }, { upload: async () => ({}), backgroundColor: color, font: 2 }))
	.extendedTextMessage?.backgroundArgb

console.log('\nbackgroundColor 0xFF112233 →', await argb(0xff112233), '(before: undefined — the colour was dropped)')
console.log("backgroundColor '#112233'  →", await argb('#112233'))
console.log("backgroundColor 'zzz'      →", await argb('zzz'), '(before: 1044480, junk parsed from nonsense)')
process.exit(0)
