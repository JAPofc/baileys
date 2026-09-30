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
    exportChatAsText, exportChatAsJSON, exportChatAsCSV, chatStatistics,
    classifyExportMessage, type ExportMessageKind, type ChatStatistics, type ExportedChatRow,
    createMockSocket, type MockWASocket, type MockOutboxEntry,
    parseMentions, extractGroupInviteCode, sendBroadcast, type BroadcastReport,
    createBroadcaster, createScheduler,
    type Broadcaster, type BroadcastSummary, type BroadcastHandle, type Scheduler, type ScheduledJobInfo,
    // core
    initAuthCreds, fetchBestWaVersion, fetchLatestWaWebVersion, DisconnectReason,
    // builders
    Button, Poll, Carousel, AIRich, RichAI, META_RICH_PREFIX, A2UI,
    // mini-app / webview
    createMiniAppLink, parseMiniAppParams, verifyMiniAppRequest, createNonceStore, type NonceStore,
    createDecryptFailureTracker, resolveDecryptFailureTracker, type DecryptFailureTracker, type SocketConfig, getAlternateDecryptionJid, buildDecryptFailureEvent, resolveGroupSenderKeyReset, assessCarouselCard,
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

    // AIRich stack layout primitives (HStack/VStack) — compile checks
    const richStacks = new AIRich({} as any)
        .addHStack(['left', { text: 'right', heading: true }, { spacer: true }])
        .addVStack([{ image: 'https://x/y.jpg', tapLinkUrl: 'https://x' }, { divider: true }]);
    void richStacks;

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
// chat export — compile checks
const transcript: string = exportChatAsText([], { mediaPlaceholders: 'descriptive', includeReactions: true, header: '' });
const rows: ExportedChatRow[] = exportChatAsJSON([], { resolveName: (jid) => jid });
const csv: string = exportChatAsCSV([]);
const stats: ChatStatistics = chatStatistics([], { topWords: 5, minWordLength: 4 });
const kind: ExportMessageKind = classifyExportMessage({} as any);
void transcript; void rows; void csv; void stats; void kind;
// mock socket — compile checks
async function _mockChecks() {
    const mock: MockWASocket = createMockSocket({ me: '1@s.whatsapp.net', pushName: 'T', autoConnect: false });
    mock.connect();
    await mock.receiveText('2@s.whatsapp.net', 'hi', { groupJid: '3@g.us', pushName: 'X' });
    const entry: MockOutboxEntry = await mock.waitForReply((e) => e.jid.length > 0, 100);
    void entry.message; void mock.outbox; void mock.connectionState;
    mock.disconnect(new Error('bye'));
    mock.reset();
}
void _mockChecks;
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
async function _broadcasterChecks(): Promise<void> {
    const caster: Broadcaster = createBroadcaster({
        send: async (jid: string, msg: any) => { void jid; void msg; return 'ok'; },
        throttleMs: 500, maxRetries: 2, retryDelayMs: 200,
        onProgress: (p) => { void p.index; void p.total; void p.remaining; }
    });
    const handle: BroadcastHandle = caster.broadcast(['1@s.whatsapp.net', '2@s.whatsapp.net'], (jid: string, i: number) => ({ text: `${jid}#${i}` }));
    const summary: BroadcastSummary = await handle.done;
    handle.cancel();
    void handle.cancelled; void summary.sent; void summary.failed; void summary.skipped; void summary.results[0]?.ok;

    const sched: Scheduler = createScheduler({ onError: (e, j) => { void e; void j.id; } });
    const id: string = sched.scheduleAfter(1000, async () => {});
    sched.scheduleAt(new Date(Date.now() + 5000), () => {});
    const jobs: ScheduledJobInfo[] = sched.list();
    void sched.cancel(id); void sched.cancelAll(); void sched.size; void jobs.length;
}
void _broadcasterChecks;

function _richAndWebviewChecks(): void {
    // RichAI brand alias + raw view_model escape hatches
    const rich: AIRich = new RichAI({} as any);
    rich.addViewModel('HStackLayoutViewModel', ['a', { typename: 'SpacerPrimitive' }], { fallback: 'x' })
        .addRawPrimitive('FancyPrimitive', { headline: 'Hi' }, { extra: { section_id: 's1' } });
    const prim = AIRich.primitive({ typename: 'MarkdownTextUXPrimitive', text: 'y' });
    const prefix: string = META_RICH_PREFIX;
    void prim; void prefix;

    // mini-app / webview: audience binding + one-time nonce anti-replay
    const store: NonceStore = createNonceStore({ ttlMs: 60000 });
    const nonce: string = store.issue();
    const link: string = createMiniAppLink('https://app.example/open', { uid: '1' }, {
        secret: 's', expiresIn: 300, audience: '628@s.whatsapp.net', nonce
    });
    const p1: Record<string, string> = parseMiniAppParams(link, { secret: 's', audience: '628@s.whatsapp.net', nonceStore: store });
    const p2: Record<string, string> = verifyMiniAppRequest({ uid: '1', sig: 'x' }, { secret: 's', nonceStore: store });
    void store.consume(nonce); void store.has(nonce); void store.size; void p1.uid; void p2.uid;

    // decrypt-failure log rate-limiter + alternate-identity retry helper
    const tracker: DecryptFailureTracker = createDecryptFailureTracker({ windowMs: 60000, maxPerWindow: 5 });
    const hit = tracker.hit('628@s.whatsapp.net|msg');
    const alt: string | undefined = getAlternateDecryptionJid({ attrs: {} }, '628@s.whatsapp.net', '628@s.whatsapp.net');
    void hit.log; void hit.suppressedSincePrevWindow; void tracker.suppressedFor('x'); void tracker.size; void alt;

    const failEvt = buildDecryptFailureEvent({ key: {}, messageStubType: 2, messageStubParameters: ['Bad MAC'] });
    if (failEvt) { void failEvt.error; void failEvt.willRetry; void failEvt.key; }

    // socket config resolution: `false` disables, options tune, undefined → default
    void resolveDecryptFailureTracker(false);
    void resolveDecryptFailureTracker({ windowMs: 30000, maxPerWindow: 3, max: 1000 });
    const cfg: Partial<SocketConfig> = { decryptFailureLog: { windowMs: 60000, maxPerWindow: 5 } };
    const cfgOff: Partial<SocketConfig> = { decryptFailureLog: false };
    void cfg; void cfgOff;

    // group sender-key rotation decision on membership change
    const skReset = resolveGroupSenderKeyReset('remove');
    void skReset.reset; void skReset.reason;

    // carousel card validation (text-only cards allowed)
    const cardCheck = assessCarouselCard({ text: 'hi' }, false);
    void cardCheck.ok; void cardCheck.reason;
}
void _richAndWebviewChecks;
void compileOnly;
void compileOnly2;
void compileOnly3;
