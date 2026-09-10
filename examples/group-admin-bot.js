/**
 * Group-admin bot — welcome/goodbye + !tagall !hidetag !poll (admin-only demo).
 *
 * Run: node examples/group-admin-bot.js
 */
import makeWASocket, {
    createRouter,
    DisconnectReason,
    fetchLatestBaileysVersion,
    useMultiFileAuthState
} from '../lib/index.js';

const isAdmin = async (sock, jid, sender) => {
    try {
        const meta = await sock.groupMetadata(jid);
        const me = meta.participants.find((p) => p.id === sender);
        return me?.admin === 'admin' || me?.admin === 'superadmin';
    } catch {
        return false;
    }
};

const start = async () => {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_admin');
    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({ version, auth: state, printQRInTerminal: true });
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
        if (connection === 'close' && lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
            start();
        }
    });

    // welcome / goodbye
    sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
        for (const user of participants || []) {
            const tag = `@${user.split('@')[0]}`;
            if (action === 'add') {
                await sock.sendMessage(id, { text: `Selamat datang ${tag}! 🎉`, mentions: [user] });
            } else if (action === 'remove') {
                await sock.sendMessage(id, { text: `Dadah ${tag} 👋`, mentions: [user] });
            }
        }
    });

    const router = createRouter({ prefix: '!' });
    const adminOnly = async (ctx, next) => {
        if (['help', 'menu'].includes(ctx.command)) {
            await next(); // help stays public
            return;
        }        if (!ctx.jid.endsWith('@g.us')) {
            await ctx.reply('Perintah ini khusus grup 👥');
            return;
        }
        if (!(await isAdmin(sock, ctx.jid, ctx.sender))) {
            await ctx.reply('Khusus admin grup 🔒');
            return;
        }
        await next();
    };

    router.command('tagall', async (ctx) => {
        await sock.tagAll(ctx.jid, ctx.args.join(' ') || 'Perhatian semuanya!');
    }, { desc: 'Tag semua anggota (admin)' });
    router.command('hidetag', async (ctx) => {
        await sock.hideTag(ctx.jid, ctx.args.join(' ') || 'Pengumuman 📢');
    }, { desc: 'Tag semua tanpa tampil (admin)' });
    router.command('poll', async (ctx) => {
        // !poll Makan apa? | Nasi | Mie | Bakso
        const [name, ...values] = ctx.args.join(' ').split('|').map((s) => s.trim()).filter(Boolean);
        await sock.sendPoll(ctx.jid, { name: name || 'Polling', values: values.length >= 2 ? values : ['Ya', 'Tidak'] });
    }, { desc: 'Buat polling (admin)' });
    router.use(adminOnly); // applies to tagall/hidetag/poll above AND help below
    router.attach(sock);
    console.log('group-admin bot ready');
};

start();
