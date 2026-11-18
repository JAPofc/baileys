/**
 * Auto-reconnect bot — the recommended production skeleton.
 *
 * Uses the two v2.2 conveniences together:
 *  - makeWASocketAuto(): resolves the freshest WA Web version before connecting
 *  - autoReconnect(): exponential-backoff supervision, loggedOut-aware
 *
 * Run: node examples/auto-reconnect-bot.js   (scan the QR on first run)
 */
import {
    makeWASocketAuto,
    autoReconnect,
    useMultiFileAuthState
} from '../lib/index.js';

const { state, saveCreds } = await useMultiFileAuthState('auth_info');

const manager = autoReconnect(
    () => makeWASocketAuto({
        auth: state,
        printQRInTerminal: true, // built-in zero-dep QR rendering
    }),
    {
        // attach handlers here — this runs again on every reconnect,
        // because each reconnect creates a brand-new socket
        onSocket: (sock) => {
            sock.ev.on('creds.update', saveCreds);
            sock.ev.on('messages.upsert', ({ messages, type }) => {
                if (type !== 'notify') return;
                for (const msg of messages) {
                    if (msg.key.fromMe || !msg.message) continue;
                    console.log('msg from', msg.key.remoteJid);
                }
            });
        },
        onOpen: () => console.log('🍃 connected'),
        onLoggedOut: () => {
            console.log('session logged out — delete auth_info/ and re-pair');
            process.exit(1);
        },
    },
);

await manager.start();
console.log('bot supervised — Ctrl+C to stop');
process.on('SIGINT', async () => {
    await manager.stop();
    process.exit(0);
});
