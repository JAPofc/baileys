/**
 * Full-featured example bot — wires the flagship @japofc/baileys modules
 * into one working skeleton: router with guards, economy + shop + games,
 * moderation, anti-ban, persistence and a clean shutdown.
 *
 * Run: node examples/full-bot.js   (pairs via QR on first start)
 */
import makeWASocket, {
	makeWASocketAuto, useMultiFileAuthState, Browsers,
	createRouter, createCommandLock, createChatSettings,
	createEconomy, createShop, createLevelSystem, createQuizSession,
	createBugShield, createFloodGuard, createGatekeeper, createCallGuard,
	createAccountWarmup, createGroupOpGuard, classifyDisconnect,
	createGroupMetadataCache, createKVStore, autoPersist,
	createShutdownManager, installCrashGuard, createConnectionWatchdog,
	createSecureLogger, evaluateMath, terbilang, generateMathProblem
} from '../lib/index.js';

const OWNER = process.env.BOT_OWNER || '628xxxx@s.whatsapp.net';

const main = async () => {
	// ---- persistence -------------------------------------------------
	const db = await createKVStore('./botdata.json');
	const eco = createEconomy({ bankCapacity: 1_000_000 });
	const levels = createLevelSystem();
	const stopEco = autoPersist(db.namespace('eco'), eco);
	const stopLvl = autoPersist(db.namespace('levels'), levels);

	// ---- socket (auto WA version + secure logging + group cache) -----
	const { state, saveCreds } = await useMultiFileAuthState('./auth');
	const groupCache = createGroupMetadataCache();
	const sock = await makeWASocketAuto({
		auth: state,
		browser: Browsers.ubuntu('Chrome'),
		logger: createSecureLogger({ level: 'warn' }),
		cachedGroupMetadata: groupCache.cachedGroupMetadata,
		printQRInTerminal: true
	});
	sock.ev.on('creds.update', saveCreds);
	groupCache.bind(sock);

	// ---- survival kit -------------------------------------------------
	installCrashGuard({ minAlertIntervalMs: 60_000 });
	const watchdog = createConnectionWatchdog({ autoRestart: true });
	watchdog.bind(sock);
	watchdog.start();
	sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
		if (connection === 'close') {
			const verdict = classifyDisconnect(lastDisconnect);
			console.log('[conn]', verdict.category, '-', verdict.description);
			if (verdict.shouldReconnect) {
				main().catch(console.error); // simplest restart strategy
			}
		}
	});

	// ---- anti-ban -----------------------------------------------------
	const warmup = createAccountWarmup({ startedAt: db.getOrSet('firstLogin', Date.now) });
	const opGuard = createGroupOpGuard();
	const safeSock = opGuard.wrap(sock);

	// ---- moderation ---------------------------------------------------
	const shield = createBugShield({ autoDelete: true });
	shield.bind(sock);
	const flood = createFloodGuard({ maxMessages: 8, windowMs: 10_000, autoMuteMs: 60_000 });
	flood.bind(sock);
	const gate = createGatekeeper();
	shield.onDetected(({ sender }) => gate.banUser(sender, 'bug message', { expiresInMs: 24 * 3_600_000 }));
	createCallGuard({ autoReject: true, schedule: { from: '22:00', to: '06:00' } }).bind(sock);

	// ---- commands -----------------------------------------------------
	const settings = createChatSettings({ defaults: { welcome: true, antilink: false } });
	const locks = createCommandLock({ owners: [OWNER] });
	const shop = createShop(eco);
	shop.addItem({ id: 'vip', name: 'VIP Badge', price: 50_000, maxPerUser: 1 });
	const quiz = createQuizSession();
	quiz.bind(sock);
	levels.bind(sock);

	const router = createRouter({ prefix: '!', owners: [OWNER] });
	router.use(locks.middleware());
	router.command('menu', (ctx) => ctx.reply('Type !help for everything I can do'), { hidden: true });
	router.command('calc', (ctx) => {
		try {
			const result = evaluateMath(ctx.args.join(' '));
			return ctx.reply(`${result}\n_${terbilang(Math.trunc(result))}_`);
		} catch (err) {
			return ctx.reply(`❌ ${err.message}`);
		}
	}, { desc: 'Safe calculator', category: 'Tools' });
	router.command('daily', (ctx) => {
		const claim = eco.claimDaily(ctx.sender);
		return ctx.reply(claim.claimed
			? `+${claim.amount} 💰 (streak ${claim.streak}🔥)`
			: `Sudah klaim — coba lagi dalam ${Math.ceil(claim.remainingMs / 3_600_000)} jam`);
	}, { desc: 'Daily reward', category: 'Economy', cooldownMs: 5_000 });
	router.command('rank', (ctx) => ctx.reply(levels.renderRankCard(ctx.sender) ?? 'Belum ada XP'), { category: 'Economy' });
	router.command('mathquiz', (ctx) => {
		quiz.start(ctx.jid, [generateMathProblem('easy'), generateMathProblem('medium'), generateMathProblem('hard')]);
	}, { desc: 'Math quiz — 3 rounds', category: 'Games', groupOnly: true });
	quiz.onQuestion(({ chat, index, total, question }) => sock.sendMessage(chat, { text: `Soal ${index}/${total}: ${question}` }));
	quiz.onEnd(({ chat, winner }) => sock.sendMessage(chat, { text: winner ? `🏆 @${winner.user.split('@')[0]} menang!` : 'Tidak ada pemenang' , mentions: winner ? [winner.user] : [] }));

	sock.ev.on('messages.upsert', gate.filter(async (upsert) => {
		for (const msg of upsert.messages) {
			if (warmup.canSend()) {
				await router.handle(sock, msg);
			}
		}
	}));

	// ---- clean exit ----------------------------------------------------
	const shutdown = createShutdownManager({ sock, saveCreds });
	shutdown.register('flush db', async () => {
		stopEco();
		stopLvl();
		await db.flush();
	});
	shutdown.attach();

	console.log('Bot up. Owner:', OWNER, '| safeSock group ops guarded:', typeof safeSock.groupCreate === 'function');
};

main().catch(console.error);
