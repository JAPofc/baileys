/**
 * Strict-mode consumer harness: exercises the public @japofc/baileys type
 * surface exactly the way a real TypeScript consumer would. Run via
 * `npm run test:types` (also wired into CI). Compile-only, never executed.
 */
import makeWASocket, {
    makeWASocketAuto, autoReconnect,
    type AutoReconnectOptions, type AutoReconnectManager,
    createDebugMonitor, type DebugInfo, type DebugMonitor,
    setFfmpegPath, resolveFfmpegPath, requireFfmpegPath, ffmpegInstallHint,
    checkEnvironment, printEnvironmentReport, printBanner, type EnvironmentReport,
    withMusicAttribution, type StatusMusicAttribution,
    useRedisAuthState, useMongoAuthState, usePostgresAuthState, useMySQLAuthState,
    makeAuthStateFromStore, type AuthKVStore, type DBAuthState,
    parseMentions, extractGroupInviteCode, sendBroadcast, type BroadcastReport,
    // core
    initAuthCreds, fetchBestWaVersion, fetchLatestWaWebVersion, DisconnectReason,
    // builders
    Button, Poll, Carousel, AIRich, A2UI,
    // framework
    Bot, Context,
    // voip
    VoipClient,
    // qr
    qrToMatrix, renderQRToTerminal, qrToSVG, qrToPNG, formatPairingCode,
    // types
    type UsernameSocketMethods, type BotConfig, type VoipClientConfig,
    type QRECC, type QRMatrixOptions, type QRTerminalOptions, type QRSVGOptions, type QRPNGOptions,
    type BloksNode, type CarouselCard,
} from '../../lib/index.js';

async function compileOnly(): Promise<void> {
    const keys = { get: async () => ({}), set: async () => { } };
    const sock = makeWASocket({ auth: { creds: initAuthCreds(), keys } as never, printQRInTerminal: true } as never);
    const methods: UsernameSocketMethods = sock;
    const code: string = await sock.requestPairingCode('628123456789', 'JAPJAPAP');
    const best = await fetchBestWaVersion();
    const v: number[] = best.version;
    const web = await fetchLatestWaWebVersion({});
    const reason: number = DisconnectReason.loggedOut;

    const m: boolean[][] = qrToMatrix('x', { ecc: 'H', quietZone: 4 });
    const term: string = renderQRToTerminal('x', { small: false, inverted: true });
    const svg: string = qrToSVG('x', { dark: '#111', light: '#eee' });
    const png: Buffer = qrToPNG('x', { scale: 4, dark: 0, light: 255 });
    const pair: string = formatPairingCode('ABCDEFGH');
    const e: QRECC = 'QUARTILE';
    const o1: QRMatrixOptions = { ecc: e };
    const o2: QRTerminalOptions = { small: true };
    const o3: QRSVGOptions = { quietZone: 0 };
    const o4: QRPNGOptions = { scale: 2 };

    const botCfg: BotConfig = { versionCheck: false, enableStats: true };
    const bot = new Bot(botCfg);
    bot.command('!ping', async (ctx: Context) => { await ctx.reply('pong'); });

    const voipCfg: VoipClientConfig = {
        watchdogIntervalMs: 5000, watchdogMaxSilent: 3, watchdogMaxRecoveries: 3,
    } as VoipClientConfig;
    const voip = new VoipClient(voipCfg);
    await voip.connectWithSocket(sock);
    voip.on('call-degraded', (_d: unknown) => { });
    voip.on('call-unrecoverable', (_u: unknown) => { });

    const node: BloksNode = { type: 'text', children: [] } as unknown as BloksNode;
    const card: CarouselCard = {} as CarouselCard;

    console.log(methods, code, v, web, reason, m.length, term, svg, png.length, pair,
        o1, o2, o3, o4, bot, voip, node, card, Button, Poll, Carousel, AIRich, A2UI);
}
async function compileOnly2(): Promise<void> {
    const sock = await makeWASocketAuto({ printQRInTerminal: true });
    const opts: AutoReconnectOptions = { maxAttempts: 5, baseDelayMs: 500, onLoggedOut: () => { } };
    const monitor: DebugMonitor = createDebugMonitor(sock, { sampleLimit: 100 });
    const dbg: DebugInfo = monitor.getDebugInfo();
    const uptime: number = dbg.connection.uptimeMs;
    const p50: number | null = dbg.messages.latencyMs.p50;
    monitor.stop();
    void uptime; void p50;
    const mgr: AutoReconnectManager = autoReconnect(() => makeWASocketAuto({}), opts);
    const started = await mgr.start();
    const n: number = mgr.attempts;
    await mgr.stop();
    console.log(sock, started, n);
}
async function compileOnly4(): Promise<void> {
    const env: EnvironmentReport = await checkEnvironment();
    const ok: boolean = env.ok;
    const ff: string | null = env.ffmpeg.path;
    const backend: 'sharp' | '@napi-rs/image' | 'jimp' | null = env.imageBackend;
    await printEnvironmentReport();
    printBanner(); // permanent — takes no options
const musicStatus = withMusicAttribution({ text: 'vibes' }, { title: 'Song', authorName: 'Artist', songId: 'c1' });
void musicStatus;
const musicMeta: StatusMusicAttribution = { title: 't', isExplicit: false };
void musicMeta;
// DB auth adapters — compile checks only (no live DBs)
async function _dbAuthChecks() {
    const fakeStore: AuthKVStore = {
        read: async () => null,
        readMany: async () => ({}),
        write: async () => {},
        apply: async () => {},
        clear: async () => {}
    };
    const fromStore: DBAuthState = await makeAuthStateFromStore(fakeStore);
    await fromStore.saveCreds();
    const r = await useRedisAuthState({ client: {}, session: 's', prefix: 'p' });
    const m = await useMongoAuthState({ collection: {}, session: 's' });
    const p = await usePostgresAuthState({ client: {}, table: 't', session: 's' });
    const q = await useMySQLAuthState({ client: {}, table: 't', session: 's' });
    void r.state.creds; void m; void p; void q;
}
void _dbAuthChecks;
    const mentions: string[] = parseMentions('hi @62812345678');
    const code: string | null = extractGroupInviteCode('https://chat.whatsapp.com/AbCdEfGh12345678');
    const report: BroadcastReport = await sendBroadcast({} as any, ['1@s.whatsapp.net'], { text: 'x' }, { delayMs: 0 });
    console.log(mentions, code, report.sent.length, report.failed.length);
    const sockB = makeWASocket({});
    console.log(ok, ff, backend, sockB);
}
void compileOnly4;
async function compileOnly3(): Promise<void> {
    setFfmpegPath('/usr/bin/ffmpeg');
    setFfmpegPath(null);
    const bin: string | null = await resolveFfmpegPath();
    const required: string = await requireFfmpegPath();
    const hint: string = ffmpegInstallHint();
    console.log(bin, required, hint);
}
void compileOnly;
void compileOnly2;
void compileOnly3;
