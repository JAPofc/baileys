/**
 * Echo bot — the smallest @japofc/baileys bot.
 * Replies to every incoming text + answers `ping` with a humanized `pong`.
 *
 * Run: node examples/echo-bot.js   (scan the QR on first run)
 */
import makeWASocket, {
    DisconnectReason,
    fetchLatestBaileysVersion,
    useMultiFileAuthState
} from '../lib/index.js';

const start = async () => {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_echo');
    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({ version, auth: state, printQRInTerminal: true });
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
        console.log('connection:', connection);
        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) {
                console.log('reconnecting...');
                start();
            } else {
                console.log('logged out — delete ./auth_echo and re-run');
            }
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        for (const m of messages || []) {
            if (!m.message || m.key.fromMe) {
                continue;
            }
            const text = m.message.conversation || m.message.extendedTextMessage?.text || '';
            if (!text) {
                continue;
            }
            console.log(`< ${m.pushName || m.key.remoteJid}: ${text}`);
            if (text.trim().toLowerCase() === 'ping') {
                await sock.sendHumanized(m.key.remoteJid, { text: 'pong! 🏓' }, { maxDelayMs: 3000 });
            } else {
                await sock.sendMessage(m.key.remoteJid, { text: `kamu bilang: ${text}` }, { quoted: m });
            }
        }
    });
};

start();
