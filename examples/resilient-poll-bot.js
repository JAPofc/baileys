/**
 * Resilient poll bot — showcases the three v2.4.5 reliability helpers together:
 *
 *   - createMessageDedupe():        idempotency guard so the bot never acts twice
 *                                   on a message WhatsApp re-delivers (reconnect,
 *                                   history sync, placeholder resend, retries).
 *   - createSessionHealthMonitor(): watches for bursts of undecryptable
 *                                   (CIPHERTEXT / Bad-MAC) messages per contact —
 *                                   the signature of a broken Signal session.
 *   - createPollManager():          stateful poll tallying where each voter counts
 *                                   once with their latest choice.
 *
 * Send `poll` in any chat to start a poll, then vote. The bot edits nothing —
 * it just prints a live tally to the console as votes arrive.
 *
 * Run: node examples/resilient-poll-bot.js   (scan the QR on first run)
 */
import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    createMessageDedupe,
    createSessionHealthMonitor,
    createPollManager,
} from '../lib/index.js'

const { state, saveCreds } = await useMultiFileAuthState('auth_info')

// One dedupe guard for the whole process (bounded LRU, keys expire after ttl).
const dedupe = createMessageDedupe({ maxSize: 5000, ttlMs: 10 * 60_000 })

// One poll manager for the whole process.
const polls = createPollManager({ meId: state.creds?.me?.id })

// One session-health monitor; alert when a contact's session looks broken.
const health = createSessionHealthMonitor({ badMacThreshold: 5, windowMs: 60_000 })
health.onUnhealthy(({ jid, failures, total }) => {
    console.warn(`⚠️  session for ${jid} looks broken: ${failures}/${total} recent messages failed to decrypt`)
})
health.onRecover(({ jid }) => console.log(`✅ session for ${jid} recovered`))

const start = () => {
    const sock = makeWASocket({ auth: state, printQRInTerminal: true })

    sock.ev.on('creds.update', saveCreds)

    // Auto-tracks CIPHERTEXT decrypt failures and canonicalizes PN/LID JIDs.
    const unbindHealth = health.bind(sock, { sweepMs: 30_000 })

    sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
        if (connection === 'close') {
            unbindHealth()
            const loggedOut = lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut
            if (!loggedOut) start()
            else console.log('Logged out — delete auth_info and re-run to pair again.')
        } else if (connection === 'open') {
            console.log('Connected. Send "poll" in any chat to begin.')
        }
    })

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return
        for (const msg of messages) {
            // Idempotency: skip anything we've already handled.
            if (dedupe.seen(msg.key)) continue

            const jid = msg.key.remoteJid
            const text =
                msg.message?.conversation ??
                msg.message?.extendedTextMessage?.text ??
                ''

            // Start a poll on demand.
            if (!msg.key.fromMe && text.trim().toLowerCase() === 'poll') {
                const sent = await sock.sendMessage(jid, {
                    poll: { name: 'Favourite runtime?', values: ['Node', 'Bun', 'Deno'], selectableCount: 1 },
                })
                polls.register(sent) // remember it so we can tally votes later
                continue
            }

            // Fold in incoming poll votes and print the live tally.
            const pollUpdate = msg.message?.pollUpdateMessage
            if (pollUpdate && polls.has(pollUpdate.pollCreationMessageKey?.id)) {
                const voter = msg.key.participant || jid
                polls.applyUpdate(pollUpdate.pollCreationMessageKey.id, {
                    vote: pollUpdate.vote,
                    voter,
                })
                console.log('\n' + polls.render(pollUpdate.pollCreationMessageKey.id))
            }
        }
    })

    return sock
}

start()

// Handy for a /health command or a periodic log line:
setInterval(() => {
    const s = health.getStats()
    if (s.unhealthy > 0) console.log(`session-health: ${s.unhealthy} unhealthy / ${s.tracked} tracked`)
}, 60_000).unref?.()
