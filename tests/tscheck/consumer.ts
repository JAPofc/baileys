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
    Button, ButtonV2, ButtonV3, Poll, Carousel, AIRich, RichAI, Rich, createRich, sendRich, jap, japRich, createJapRich, buildJapRich, sendJapRich, META_RICH_PREFIX, A2UI,
    // group/community metadata helpers (batch P)
    extractGroupMetadata, extractLIDPNPairs, GROUP_PARTICIPANTS_CHUNK_SIZE, type LIDPNPair,
    // w:gp2 notification helpers (batch Q)
    resolveNotificationActors, parseNotificationParticipants, extractNotificationLIDPNPairs,
    type NotificationActors, type NotificationParticipant,
    // media-conn + device-list helpers (batch R)
    parseMediaConnNode, isMediaConnExpired, MEDIA_CONN_DEFAULT_TTL, dedupeJidsByUser, dedupeDeviceList,
    type MediaConnInfo, type MediaConnHost,
    // USync error helpers (batch S)
    extractUSyncErrors, hasUSyncQueryError, type USyncError,
    USyncQuery, USyncUser,
    // store + participant-list helpers (batch T)
    makeOrderedDictionary, upsertParticipants, removeParticipants, setParticipantsAdmin,
    type OrderedDictionary, type ParticipantLike,
    // entity repository (batch U)
    ObjectRepository,
    // message relevance helpers (batch V)
    classifyMessage, isMissedCallMessage, isStubAboutMe, MISSED_CALL_STUB_TYPES,
    isRealMessage, type MessageRelevance,
    // stub participant helpers (batch W)
    parseStubParticipant, stubParticipantIdentities, stubParticipantsInclude, type StubParticipant,
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
    type BloksNode, type CarouselCard, type ButtonV2ValidationResult, type ButtonV3ValidationResult,
    exifOrientedDimensions,
    isOrientationSwapped,
    SWAPPED_EXIF_ORIENTATIONS,
    createGroupInviteThumbnailCache,
    fetchGroupInviteThumbnail,
    DEFAULT_GROUP_INVITE_THUMBNAIL_TTL_MS,
    shouldProcessHistorySyncNotification,
    isOnDemandHistorySync,
    isProcessableHistorySyncType,
    recordsProcessedHistoryMessage,
    EXPLICITLY_REQUESTED_HISTORY_TYPES,
    keyAddressingMode,
    quotedParticipantJid,
    resolveSelfAddressingMode,
    selfJidForAddressingMode,
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

    // legacy builders validation/introspection types
    const legacyV2 = new ButtonV2({} as any).addButton('A', 'a');
    const legacyV2Result: ButtonV2ValidationResult = legacyV2.validate();
    const legacyV3 = new ButtonV3({} as any).addReply('A', 'a');
    const legacyV3Result: ButtonV3ValidationResult = legacyV3.validate();
    void legacyV2.countButtons(); void legacyV2.getButtons(); void legacyV2Result.ok;
    void legacyV3.countButtons(); void legacyV3.getButtons(); void legacyV3Result.ok;

    // batch O (v2.4.7) --- Poll validation/inspection surface
    const poll = new Poll(sock);
    poll.setName('Q').addOption('a').addOptions(['b', 'c']).setOptions(['a', 'b'])
        .removeOption('b').clearOptions().addOptions(['a', 'b'])
        .setSelectable(1).setMultiSelect(true).setHideVoter().setCanAddOption()
        .setEndDate('2026-12-01').setEndDate(Date.now()).setEndDate(new Date())
        .setMessageSecret(new Uint8Array(32)).setQuiz('a').assertValid();
    const pollProblems: string[] = poll.validate();
    const pollOptions: string[] = poll.getOptions();
    const pollCount: number = poll.countOptions();
    const pollMax: number = Poll.MAX_OPTIONS;
    const pollNameMax: number = Poll.MAX_NAME_LENGTH;
    const pollOptMax: number = Poll.MAX_OPTION_LENGTH;
    void poll.build().poll; void poll.toJSON().poll; void poll.send('x@g.us', {});

    // batch O (v2.4.7) --- A2UI validation/inspection surface
    const widget = new A2UI();
    // §2.37: factories return ids (strings), only config/terminal methods chain
    const widgetText: string = widget.text('hi');
    const widgetLabel: string = widget.text('Go');
    const widgetButton: string = widget.button(widgetLabel, { variant: 'primary' });
    const widgetCol: string = widget.column([widgetText, widgetButton]);
    const widgetChoice: string = widget.choicePicker('Pick', [{ label: 'A', value: 'a' }]);
    widget.root([widgetCol, widgetChoice]);
    const widgetHas: boolean = widget.has(widgetText);
    const widgetNode: Record<string, any> | undefined = widget.get(widgetText);
    const widgetIds: string[] = widget.ids();
    const widgetCount: number = widget.count();
    const widgetRemoved: boolean = widget.remove('nope');
    const widgetOrphans: string[] = widget.findOrphans();
    const widgetProblems: string[] = widget.validate();
    widget.setVersion('v0.9').setCatalogId('https://example.test/c.json').assertValid();
    void widget.build({ validate: false, wrapped: true, type: 'im_a2ui' }).data;
    void widget.clear();
    void (pollProblems.length + pollOptions.length + pollCount + pollMax + pollNameMax + pollOptMax);
    // batch P (v2.4.7) --- LID<->PN pair extraction from group/community metadata
    const groupMeta = extractGroupMetadata({ tag: 'result', attrs: {}, content: [] } as any);
    const groupPairs: LIDPNPair[] = extractLIDPNPairs(groupMeta);
    const firstLid: string | undefined = groupPairs[0]?.lid;
    const firstPn: string | undefined = groupPairs[0]?.pn;
    const chunkSize: number = GROUP_PARTICIPANTS_CHUNK_SIZE;
    void extractLIDPNPairs({ participants: [{ id: 'x@s.whatsapp.net', lid: 'y@lid' }] });
    void extractLIDPNPairs(null);
    void (chunkSize + (firstLid?.length ?? 0) + (firstPn?.length ?? 0));

    // batch Q (v2.4.7) --- group-notification parsing helpers
    const notifNode = { tag: 'notification', attrs: { from: 'g@g.us', participant: 'a@lid', participant_pn: '62@s.whatsapp.net' } };
    const notifChild = { tag: 'add', attrs: {}, content: [{ tag: 'participant', attrs: { jid: 'b@lid' } }] };
    const actors: NotificationActors = resolveNotificationActors(notifNode, notifChild);
    const affectedLid: string | undefined = actors.affectedLid;
    const affectedPn: string | undefined = actors.affectedPn;
    const isActor: boolean = actors.affectedIsActor;
    const notifParticipants: NotificationParticipant[] = parseNotificationParticipants(notifChild);
    const notifPairs: LIDPNPair[] = extractNotificationLIDPNPairs(notifNode, notifChild);
    void resolveNotificationActors(null, null);
    void parseNotificationParticipants(undefined);
    void extractNotificationLIDPNPairs(undefined, undefined);
    void ((affectedLid?.length ?? 0) + (affectedPn?.length ?? 0) + Number(isActor) + notifParticipants.length + notifPairs.length);

    // batch W (v2.4.7) --- messageStubParameters helpers
    const stubParticipant: StubParticipant | null | undefined = parseStubParticipant('{"lid":"1@lid","pn":"2@s.whatsapp.net"}');
    const stubIds: string[] = stubParticipantIdentities(stubParticipant);
    const stubIsMe: boolean = stubParticipantsInclude([stubParticipant!, '3@s.whatsapp.net'], '2@s.whatsapp.net', undefined);
    void parseStubParticipant(null);
    void stubParticipantIdentities(undefined);
    void stubParticipantsInclude(null);
    void (stubIds.length + Number(stubIsMe) + (stubParticipant?.lid?.length ?? 0));

    // batch V (v2.4.7) --- chat-list classification
    const missedCall = { key: { remoteJid: 'a@s.whatsapp.net', id: 'C1', fromMe: false }, messageStubType: 2 };
    const relevance: MessageRelevance = classifyMessage(missedCall, '628111@s.whatsapp.net');
    const chatListWorthy: boolean = relevance.isReal;
    const unread: boolean = relevance.incrementsUnread;
    const ctype: string | undefined = relevance.contentType;
    const missed: boolean = isMissedCallMessage(missedCall);
    const aboutMe: boolean = isStubAboutMe(missedCall, '628111@s.whatsapp.net');
    const realWithMe: boolean = isRealMessage(missedCall, '628111@s.whatsapp.net');
    const realWithoutMe: boolean = isRealMessage(missedCall);
    void classifyMessage(null);
    void (Number(chatListWorthy) + Number(unread) + (ctype?.length ?? 0) + Number(missed)
        + Number(aboutMe) + Number(realWithMe) + Number(realWithoutMe) + MISSED_CALL_STUB_TYPES.length);

    // batch U (v2.4.7) --- ObjectRepository accepts both shapes and round-trips
    type Label = { id: string; name?: string };
    const repoFromMap = new ObjectRepository<Label>({ L1: { id: 'L1', name: 'Work' } });
    const repoFromArray = new ObjectRepository<Label>(repoFromMap.toJSON());
    const repoStatic = ObjectRepository.fromJSON<Label>(repoFromMap.toJSON());
    const label: Label | undefined = repoFromArray.findById('L1');
    const labelCount: number = repoStatic.count();
    const labelKnown: boolean = repoStatic.hasId('L1');
    void repoStatic.load([{ id: 'L2' }]);
    void repoStatic.clear();
    void ((label?.name?.length ?? 0) + labelCount + Number(labelKnown) + repoFromArray.findAll().length);

    // batch T (v2.4.7) --- ordered dictionary + participant list
    type StoredMsg = { key: { id: string }; status?: number };
    const dict: OrderedDictionary<StoredMsg, string> = makeOrderedDictionary<StoredMsg, string>(m => m.key.id);
    dict.upsert({ key: { id: 'AAA' }, status: 2 }, 'append');
    dict.fromJSON([{ key: { id: 'BBB' } }]);
    dict.fromJSON(null);
    const gotMsg: StoredMsg | undefined = dict.get('BBB');
    const didUpdate: boolean = dict.update({ key: { id: 'BBB' }, status: 3 });
    const hasMsg: boolean = dict.has('BBB');
    const dictSize: number = dict.size();
    const participants: ParticipantLike[] = [{ id: '1@lid', admin: 'superadmin' }, { id: '2@lid', phoneNumber: '628222@s.whatsapp.net' }];
    const added: ParticipantLike[] = upsertParticipants(participants, [{ id: '3@lid' }]);
    const demoted: ParticipantLike[] = setParticipantsAdmin(added, [{ id: '1@lid' }], null);
    const removed: ParticipantLike[] = removeParticipants(demoted, [{ phoneNumber: '628222@s.whatsapp.net' }]);
    void upsertParticipants(null, undefined);
    void ((gotMsg?.status ?? 0) + Number(didUpdate) + Number(hasMsg) + dictSize + added.length + demoted.length + removed.length);

    // batch S (v2.4.7) --- USync errors + withUsers()
    const usyncIq = { tag: 'iq', attrs: { type: 'result' }, content: [] };
    const usyncErrors: USyncError[] = extractUSyncErrors(usyncIq);
    const firstCode: number | undefined = usyncErrors[0]?.code;
    const firstJid: string | undefined = usyncErrors[0]?.jid;
    const queryFailed: boolean = hasUSyncQueryError(usyncErrors);
    void extractUSyncErrors(null);
    void hasUSyncQueryError(undefined);
    const usyncQuery = new USyncQuery()
        .withContactProtocol()
        .withUsers(new USyncUser().withPhone('+628111'), new USyncUser().withPhone('+628222'));
    const usyncParsed = usyncQuery.parseUSyncQueryResult(usyncIq);
    const usyncList: number = usyncParsed?.list.length ?? 0;
    const usyncErrCount: number = usyncParsed?.errors.length ?? 0;
    void ((firstCode ?? 0) + (firstJid?.length ?? 0) + Number(queryFailed)
        + usyncQuery.users.length + usyncList + usyncErrCount);

    // batch R (v2.4.7) --- media connection + device-list dedup
    const mediaInfo: MediaConnInfo = parseMediaConnNode({
        tag: 'media_conn',
        attrs: { auth: 'tok', ttl: '300' },
        content: [{ tag: 'host', attrs: { hostname: 'a.example', maxContentLengthBytes: '1048576' } }]
    });
    const mediaHosts: MediaConnHost[] = mediaInfo.hosts;
    const mediaTtl: number = mediaInfo.ttl;
    const mediaAuth: string | undefined = mediaInfo.auth;
    const mediaStale: boolean = isMediaConnExpired(mediaInfo);
    const mediaStaleAt: boolean = isMediaConnExpired({ ttl: 300, fetchDate: Date.now() }, Date.now() + 1);
    const defaultTtl: number = MEDIA_CONN_DEFAULT_TTL;
    void parseMediaConnNode(null, { now: Date.now() });
    void isMediaConnExpired(undefined);
    const uniqueJids = dedupeJidsByUser([{ jid: 'a@s.whatsapp.net', user: 'a' }, { jid: 'a@s.whatsapp.net' }]);
    const uniqueDevices = dedupeDeviceList([{ jid: 'a@s.whatsapp.net', user: 'a', device: 0 }, { user: 'a', device: 1 }]);
    void dedupeJidsByUser(null);
    void dedupeDeviceList(undefined);
    void (mediaHosts.length + mediaTtl + (mediaAuth?.length ?? 0) + Number(mediaStale) + Number(mediaStaleAt)
        + defaultTtl + uniqueJids.length + uniqueDevices.length);

    void (widgetButton.length + widgetCol.length + widgetChoice.length);
    void (Number(widgetHas) + Number(!!widgetNode) + widgetIds.length + widgetCount + Number(widgetRemoved) + widgetOrphans.length + widgetProblems.length);

    console.log(methods, code, v, web, reason, m.length, term, svg, png.length, pair,
        o1, o2, o3, o4, bot, voip, node, card, Button, ButtonV2, ButtonV3, Poll, Carousel, AIRich, A2UI);
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
    const oneLine = Rich({} as any, { title: 'Menu', text: 'Hi', actions: { text: 'Open', url: 'https://x.com' } });
    const oneLine2 = createRich({} as any, '# Hello');
    const oneLineJap = jap({} as any, '# Jap Hello');
    const oneLineJap2 = japRich({} as any, { text: 'Jap rich' });
    const oneLineJap3 = createJapRich({} as any, { markdown: '# Jap' });
    const builtJap: Promise<Record<string, any>> = buildJapRich({} as any, '# Build Jap');
    const sentRich: Promise<any> = sendRich({ relayMessage: async () => {} } as any, '1@s.whatsapp.net', { markdown: '# Hi' });
    const sentJapRich: Promise<any> = sendJapRich({ relayMessage: async () => {} } as any, '1@s.whatsapp.net', { markdown: '# Jap Hi' });
    void prim; void prefix; void oneLine; void oneLine2; void oneLineJap; void oneLineJap2; void oneLineJap3; void builtJap; void sentRich; void sentJapRich;

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

// EXIF orientation helpers (BUGREPORT 2.61)
function _exifOrientationChecks() {
    const displayed: { width?: number; height?: number } = exifOrientedDimensions({ width: 400, height: 200, orientation: 6 });
    void displayed.width; void displayed.height;
    void exifOrientedDimensions(null);
    void exifOrientedDimensions(undefined);
    const swapped: boolean = isOrientationSwapped(6);
    void swapped; void isOrientationSwapped(undefined);
    const table: readonly number[] = SWAPPED_EXIF_ORIENTATIONS;
    void table.length;
}
void _exifOrientationChecks;

// group invite thumbnail (BUGREPORT 2.62)
async function _groupInviteThumbnailChecks() {
    const cache = createGroupInviteThumbnailCache({ ttlMs: 60000, max: 10 });
    void cache.get('120363@g.us').hit;
    void cache.set('120363@g.us', Buffer.from([1]));
    void cache.delete('120363@g.us'); cache.clear(); void cache.size; void cache.ttlMs; void cache.max;
    const buf: Buffer | undefined = await fetchGroupInviteThumbnail({
        jid: '120363@g.us',
        getProfilePicUrl: async () => undefined,
        cache,
        timeoutMs: DEFAULT_GROUP_INVITE_THUMBNAIL_TTL_MS,
        logger: { debug: () => {} },
    });
    void buf;
    void (await fetchGroupInviteThumbnail());
}
void _groupInviteThumbnailChecks;

// history sync gate (BUGREPORT 2.63)
function _historySyncGateChecks() {
    const notification = { syncType: 7, chunkOrder: 1 };
    const allowed: boolean = shouldProcessHistorySyncNotification(notification, () => false);
    void allowed;
    void shouldProcessHistorySyncNotification(7, true);
    void shouldProcessHistorySyncNotification(undefined);
    void isOnDemandHistorySync(notification);
    void isProcessableHistorySyncType(7);
    void recordsProcessedHistoryMessage(null);
    const types: readonly number[] = EXPLICITLY_REQUESTED_HISTORY_TYPES;
    void types.length;
}
void _historySyncGateChecks;

// self addressing (BUGREPORT 2.64)
function _selfAddressingChecks() {
    const key = { remoteJid: '1@g.us', fromMe: true, id: 'X', participant: '7@lid', addressingMode: 'lid' };
    const mode: 'lid' | 'pn' | undefined = keyAddressingMode(key);
    void mode;
    const self: string | undefined = selfJidForAddressingMode(mode, { userJid: '62@s.whatsapp.net', userLid: '7@lid' });
    void self;
    void resolveSelfAddressingMode({ addressingMode: 'lid', quoted: { key }, jid: '1@g.us' });
    void resolveSelfAddressingMode();
    const participant: string | undefined = quotedParticipantJid({ key }, { userJid: '62@s.whatsapp.net', userLid: '7@lid' });
    void participant;
    void quotedParticipantJid(null);
}
void _selfAddressingChecks;
