/**
 * Sticker bot — reply an image/video with `!sticker` (or caption it) to get a sticker back.
 * Needs an image backend for conversion: npm i sharp   (or @napi-rs/image / jimp)
 *
 * Run: node examples/sticker-bot.js
 */
import makeWASocket, {
    createRouter,
    DisconnectReason,
    downloadMediaMessage,
    fetchLatestBaileysVersion,
    useMultiFileAuthState
} from '../lib/index.js';

const start = async () => {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_sticker');
    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({ version, auth: state, printQRInTerminal: true });
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
        if (connection === 'close' && lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
            start();
        }
    });

    const router = createRouter({ prefix: '!' });
    router.command('sticker', async (ctx) => {
        const quoted = ctx.msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const direct = ctx.msg.message?.imageMessage || ctx.msg.message?.videoMessage;
        const target = direct ? ctx.msg : quoted ? { key: ctx.key, message: quoted } : null;
        if (!target?.message?.imageMessage && !target?.message?.videoMessage) {
            await ctx.reply('Send an image/video with the caption `!sticker`, or reply to media with `!sticker` 🖼️');
            return;
        }
        await ctx.react('⏳');
        const buffer = await downloadMediaMessage(target, 'buffer', {});
        await sock.sendMessage(ctx.jid, { sticker: buffer }, { quoted: ctx.msg });
        await ctx.react('✅');
    }, { desc: 'Bikin stiker dari gambar/video' });

    router.attach(sock);
    console.log('sticker bot ready — type !sticker');
};

start();
