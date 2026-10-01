/**
 * igstalk-airich — an Instagram-profile lookup command rendered as a rich
 * AIRich card, showcasing the v2.4.5 additions:
 *
 *   - AIRich.addCompact():       a compact header card (avatar + title + verified
 *                                badge + subtitle) that opens a URL when tapped.
 *   - AIRich.addSocialEntity():  a tappable social-entity embed (IG/FB/etc.
 *                                profile) — avatar + name + verified — wrapped in
 *                                a "See results" link.
 *
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │ TWO LAYERS — read this before you copy-paste:                              │
 * │                                                                           │
 * │  1. LIBRARY layer  (this repo): AIRich builds + sends the card. ✅ done.  │
 * │  2. BOT layer      (your code): fetch the Instagram data, then render it. │
 * │                                                                           │
 * │  Baileys does NOT scrape Instagram. `fetchInstagramProfile()` below is a  │
 * │  PLUGGABLE STUB — wire it to your own IG data source (a scraper, a paid   │
 * │  API, RapidAPI, etc.). Everything else already works.                     │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * Usage in chat:  igstalk <username>     e.g.  igstalk jkt48.freya
 *
 * Run: node examples/igstalk-airich.js   (scan the QR on first run)
 */
import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    AIRich,
} from '../lib/index.js'

// ── Your WhatsApp channel (opened when the compact card is tapped) ────────────
const CHANNEL_URL = 'https://whatsapp.com/channel/0029VbEVFrILtOjAOu4FXa3r'

/**
 * PLUG YOUR INSTAGRAM DATA SOURCE IN HERE.
 * Return an object shaped like below. This stub returns placeholder data so the
 * example runs end-to-end without any external API; replace the body with a real
 * fetch() to your scraper/API.
 *
 * @param {string} username
 * @returns {Promise<{ username: string, fullName: string, profilePic: string, url: string, isVerified: boolean }>}
 */
async function fetchInstagramProfile(username) {
    // === REPLACE THIS BLOCK with a real lookup, e.g.: ===
    // const res = await fetch(`https://your-ig-api.example/lookup?u=${encodeURIComponent(username)}`)
    // if (!res.ok) throw new Error(`IG Lookup Error: ${res.status}`)
    // const data = await res.json()
    // return {
    //     username,
    //     fullName: data.full_name,
    //     profilePic: data.profile_pic_url,
    //     url: `https://www.instagram.com/${username}`,
    //     isVerified: !!data.is_verified,
    // }

    // --- placeholder so the demo works out of the box ---
    return {
        username,
        fullName: username.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        profilePic: 'https://raw.githubusercontent.com/WhiskeySockets/Baileys/master/Media/logo.png',
        url: `https://www.instagram.com/${encodeURIComponent(username)}`,
        isVerified: false,
    }
}

/** Build + send the rich profile card. */
async function sendProfileCard(sock, jid, username) {
    const clean = username.trim().replace(/^@/, '')

    let profile
    try {
        profile = await fetchInstagramProfile(clean)
    } catch (err) {
        console.error(`[IG Lookup Error] fetch failed for ${clean}:`, err.message)
        await sock.sendMessage(jid, { text: `❌ Couldn't look up @${clean}. Try again later.` })
        return
    }

    const card = new AIRich(sock)

    // ── Shortcut (v2.4.6): the whole card in one call ────────────────────────────
    // addProfileCard() lays down the compact header + divider + social-entity embed
    // for you. `action_url` is what the compact card opens on tap (your channel);
    // `url` is what the social-entity embed opens (the IG profile).
    card.addProfileCard({
        username: clean,
        full_name: profile.fullName,
        picture_url: profile.profilePic,
        url: profile.url,          // social-entity tap → IG profile
        action_url: CHANNEL_URL,   // compact-card tap → your channel
        type: 'IG_PROFILE',
        is_verified: profile.isVerified,
        label: 'See results',
    })

    // ── The long way (equivalent) — uncomment to build it piece by piece: ────────
    // card.addCompact({ title: `${clean} · IG lookup`, subtitle: profile.fullName,
    //     image: profile.profilePic, entity_url: CHANNEL_URL, entity_type: 'WEBSITE',
    //     action_type: 'OPEN_URL', is_verified: profile.isVerified })
    // card.addDivider()
    // card.addSocialEntity({ username: clean, full_name: profile.fullName,
    //     picture_url: profile.profilePic, url: profile.url, type: 'IG_PROFILE',
    //     is_verified: profile.isVerified, label: 'See results' })

    await card.send(jid)
}

// ── Bot wiring ────────────────────────────────────────────────────────────────
const { state, saveCreds } = await useMultiFileAuthState('auth_info')

const start = () => {
    const sock = makeWASocket({ auth: state, printQRInTerminal: true })
    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
        if (connection === 'close') {
            const loggedOut = lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut
            if (!loggedOut) start()
            else console.log('Logged out — delete auth_info and re-run to pair again.')
        } else if (connection === 'open') {
            console.log('Connected. Send "igstalk <username>" in any chat.')
        }
    })

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return
        for (const msg of messages) {
            if (msg.key.fromMe) continue
            const jid = msg.key.remoteJid
            const text = (msg.message?.conversation ?? msg.message?.extendedTextMessage?.text ?? '').trim()

            const m = text.match(/^(?:igstalk|instalookup)\s+(\S+)/i)
            if (m) {
                await sendProfileCard(sock, jid, m[1])
            }
        }
    })

    return sock
}

start()
