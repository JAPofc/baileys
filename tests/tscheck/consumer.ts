/**
 * Strict-mode consumer harness: exercises the public @japofc/baileys type
 * surface exactly the way a real TypeScript consumer would. Run via
 * `npm run test:types` (also wired into CI). Compile-only, never executed.
 */
import makeWASocket, {
    makeWASocketAuto, autoReconnect,
    type AutoReconnectOptions, type AutoReconnectManager,
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
    const mgr: AutoReconnectManager = autoReconnect(() => makeWASocketAuto({}), opts);
    const started = await mgr.start();
    const n: number = mgr.attempts;
    await mgr.stop();
    console.log(sock, started, n);
}
void compileOnly;
void compileOnly2;
