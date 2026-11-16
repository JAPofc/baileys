/**
 * Strict-mode consumer harness: exercises the public @japofc/baileys type
 * surface exactly the way a real TypeScript consumer would. Run via
 * `npm run test:types` (also wired into CI). Compile-only, never executed.
 */
import makeWASocket, {
    waitForEvent, type WaitForEventOptions,
    createRateLimiter,
    assertSafeHttpUrl, isPrivateHost, unbracketHost,
    classifyDisconnect, explainDisconnect, type DisconnectVerdict,
    inspectFfmpegPath, type FfmpegResolution, type FfmpegPathSource, type RejectedFfmpegCandidate,
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
    assessHtmlCard,
    assertHtmlCard,
    buildHtmlPrimitiveSection,
    buildHtmlUnifiedResponse,
    HTML_PRIMITIVE_TYPENAME,
    MAX_HTML_CARD_BYTES,
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

// experimental html cards
function _htmlCardChecks() {
    const html = '<p>hi</p>';
    const check = assessHtmlCard(html, { maxBytes: 1024 });
    void check.ok; void check.bytes; void check.reason;
    void assertHtmlCard(html);
    const section = buildHtmlPrimitiveSection(html, { trustedSources: ['https://example.com'] });
    void section.view_model.primitive.payload;
    const unified = buildHtmlUnifiedResponse([html, html], { uuid: 'u-1' });
    void unified.response_id; void unified.sections.length;
    const name: 'FOAHtmlPrimitiveDemoDONOTUSE' = HTML_PRIMITIVE_TYPENAME;
    void name; void MAX_HTML_CARD_BYTES;
}
void _htmlCardChecks;

function _waitForEventChecks(sock: ReturnType<typeof makeWASocket>) {
    const opts: WaitForEventOptions<'groups.update', unknown> = { timeoutMs: 5000 };
    void opts;
    const all = waitForEvent(sock.ev, 'groups.update', { timeoutMs: 1000 });
    void all.then(updates => updates.length);
    const one = waitForEvent(sock.ev, 'groups.update', {
        pick: updates => updates.find(u => u.id === 'g@g.us')
    });
    void one.then(u => u?.subject);
    const ac = new AbortController();
    void waitForEvent(sock.ev, 'messages.upsert', { signal: ac.signal, filter: up => up.type === 'notify' });
}
void _waitForEventChecks;

async function _ffmpegResolutionChecks() {
    const info: FfmpegResolution = await inspectFfmpegPath();
    const source: FfmpegPathSource | null = info.source;
    void source;
    void (info.path ?? 'none').length;
    info.rejected.forEach((r: RejectedFfmpegCandidate) => void `${r.source} ${r.path} ${r.problem}`);
}
void _ffmpegResolutionChecks;

async function _persistentStorePruneChecks(
    store: Awaited<ReturnType<typeof import('../../lib/Utils/PersistentStore.js').makePersistentStore>>
) {
    const stored: number = await store.countStoredMessages('628111@s.whatsapp.net');
    const deleted: number = await store.pruneStoredMessages('628111@s.whatsapp.net', 500);
    void (stored - deleted);
}
void _persistentStorePruneChecks;

function _rateLimiterPeekChecks() {
    const limiter = createRateLimiter({ max: 5, windowMs: 3_600_000 });
    const verdict = limiter.peek('628111');
    const ok: boolean = verdict.allowed;
    const wait: number = verdict.retryAfterMs;
    const left: number = limiter.remaining('628111');
    void (ok && wait + left);
}
void _rateLimiterPeekChecks;

async function _ssrfGuardChecks() {
    const blocked: boolean = isPrivateHost('[::ffff:169.254.169.254]');
    const bare: string = unbracketHost('[::1]');
    const url: URL = await assertSafeHttpUrl('https://example.com/a.jpg', {
        checkDns: false,
        allowHosts: ['127.0.0.1', 'media.lan']
    });
    void (blocked && bare.length && url.hostname);
}
void _ssrfGuardChecks;

function _fatalDisconnectChecks(manager: AutoReconnectManager) {
    const verdict: DisconnectVerdict = classifyDisconnect(440);
    const fatal: boolean = verdict.fatal;
    const streak: number | null = verdict.fatalAfterStreak;
    const remedy: string = verdict.remedy;
    void explainDisconnect(verdict.code, { streak: 2 });
    const status = manager.getStatus();
    const bad: number = status.badSessions;
    const last: DisconnectVerdict | null = status.lastVerdict;
    void (fatal && streak !== null && remedy.length && bad >= 0 && last?.category);
}
void _fatalDisconnectChecks;

function _autoReconnectFatalOptions() {
    const opts: AutoReconnectOptions = {
        badSessionStreak: 3,
        reconnectOnFatal: false,
        onFatal: ({ verdict, message, badSessions }) => void `${verdict.category} ${message} ${badSessions}`,
        onGiveUp: ({ reason, attempts }) => void `${reason} ${attempts}`
    };
    void opts;
}
void _autoReconnectFatalOptions;

// §2.73/§2.74 -- the Japyea send router and its types must be reachable from the package root
import { Japyea, routeJapyeaSend, JAPYEA_SEND_TYPES, type JapyeaSendType } from '../../lib/Socket/japyea.js'
const _japyeaSendTypes: readonly JapyeaSendType[] = JAPYEA_SEND_TYPES
async function _japyeaRouting(japyea: Japyea) {
	const type: JapyeaSendType | null = japyea.detectSendType({ interactiveButtons: [] })
	const res = await routeJapyeaSend({
		japyea,
		jid: '1@s.whatsapp.net',
		content: { text: 'hi', interactiveButtons: [{ name: 'quick_reply', buttonParamsJson: '{}' }] },
		options: { messageId: 'ABC' },
		userJid: '2@s.whatsapp.net',
		relayMessage: async () => undefined,
		onSent: async () => {}
	})
	return [type, res.handled, res.type, _japyeaSendTypes.length] as const
}
void _japyeaRouting

// §2.75 -- decodePatches must advertise the partial-sync contract
import { decodePatches, type AppStatePatchFailure } from '../../lib/Utils/chat-utils.js'
async function _appStatePatchContract() {
	const res = await decodePatches('regular_high', [], { version: 0, hash: Buffer.alloc(128), indexValueMap: {} }, async () => undefined, {}, undefined, undefined, true)
	const failure: AppStatePatchFailure | null = res.incomplete
	const synced: boolean = res.synced
	if (failure) {
		const reason: 'decode-failed' | 'lthash-mismatch' = failure.reason
		return [reason, failure.version, synced] as const
	}
	return ['ok', res.state.version, synced] as const
}
void _appStatePatchContract

// §2.76 -- rich one-liner keys + socket-level rich helpers must be typed
import { ONE_LINER_KEYS, jap as _japOneLiner, type RichOneLiner } from '../../lib/index.js'
async function _richOneLinerSurface(sock: ReturnType<typeof makeWASocket>) {
	const input: RichOneLiner = {
		title: 'Cart',
		markdown: '# Paid',
		table: [['Item', 'Qty'], ['Coffee', '2']],
		latex: 'E = mc^2',
		product: { title: 'Coffee' },
		allowUnknown: false
	}
	const knowsTable: boolean = ONE_LINER_KEYS.has('table')
	await sock.sendJapRich('x@s.whatsapp.net', input)
	await sock.sendJapTable('x@s.whatsapp.net', [['A', 'B']], { title: 'T' })
	await sock.sendJapLatex('x@s.whatsapp.net', 'E = mc^2')
	await sock.sendRich('x@s.whatsapp.net', { markdown: '# hi' })
	await sock.sendTable('x@s.whatsapp.net', [['A']])
	await sock.sendLatex('x@s.whatsapp.net', 'a^2')
	await sock.sendMessage('x@s.whatsapp.net', { table: [['A', 'B']] } as never)
	const card = _japOneLiner(sock as never, { markdown: '# chain' })
	return [knowsTable, card.items.length] as const
}
void _richOneLinerSurface

// §2.77 -- partial media download helpers must be typed on both the util and the socket
import { downloadMediaRange, downloadMediaHeader, type MediaRange } from '../../lib/index.js'
async function _mediaRangeSurface(sock: ReturnType<typeof makeWASocket>, msg: any) {
	const range: MediaRange = { start: 100, length: 50 }
	const slice: Buffer = await downloadMediaRange(msg, range)
	const head: Buffer = await downloadMediaHeader(msg, 32)
	const viaSock: Buffer = await sock.downloadMediaRange(msg, { start: 0, end: 16 }, { disableRetry: true })
	const headViaSock: Buffer = await sock.downloadMediaHeader(msg)
	return [slice.length, head.length, viaSock.length, headViaSock.length] as const
}
void _mediaRangeSurface

// §2.78 -- app-state sync status must be typed on the socket
async function _appStateSyncStatusSurface(sock: ReturnType<typeof makeWASocket>) {
	const all = await sock.appStateSyncStatus()
	const one = await sock.appStateSyncStatus('regular_high')
	const some = await sock.appStateSyncStatus(['regular_high', 'critical_block'])
	const version: number = all[0]!.version
	const synced: boolean = one[0]!.synced
	const mutations: number = some[0]!.mutations
	return [version, synced, mutations] as const
}
void _appStateSyncStatusSurface

// §2.79 -- relay transport error routing + per-connection stats must be typed
import { RelayRtcTransport, type RelayConnectionStats, type RelayTransportConfig } from '../../lib/VoIP/relay-transport.js'
function _relayTransportSurface() {
	const config: RelayTransportConfig = {
		onTransportMessage: () => {},
		onTransportError: (err: Error, relay) => void `${err.message}${relay.ip}`,
		logger: { warn: () => {} }
	}
	const transport = new RelayRtcTransport(config)
	const perConnection: RelayConnectionStats[] = transport.getConnectionStats()
	const dropped: number = transport.getStats().droppedPackets
	const state = perConnection[0]?.state
	return [dropped, state] as const
}
void _relayTransportSurface

// §2.80 -- SignalingBridge must advertise its lifecycle
import { SignalingBridge } from '../../lib/VoIP/signaling.js'
async function _signalingLifecycle(sock: any) {
	const bridge = new SignalingBridge({ sock })
	await bridge.init()
	const live: boolean = bridge.isDisposed
	bridge.dispose()
	return live
}
void _signalingLifecycle

// §2.81 -- auth password rotation must be typed
import { rotateAuthPassword } from '../../lib/index.js'
async function _authRotationSurface() {
	const report = await rotateAuthPassword('./auth', { oldPassword: 'old', newPassword: 'new' })
	const rotated: number = report.rotated
	const migrated: number = report.migratedFromPlaintext
	const firstFailure: string | undefined = report.failed[0]?.reason
	const plaintextOnly = await rotateAuthPassword('./auth', { newPassword: 'new' })
	return [rotated, migrated, firstFailure, plaintextOnly.skipped.length] as const
}
void _authRotationSurface

// §2.82 -- copied playback frames + the inbound audio stream must be typed
import { copyPlaybackFrame } from '../../lib/VoIP/wasm-engine.js'
import type { ActiveCall } from '../../lib/index.js'
function _voipAudioSurface(call: ActiveCall) {
	const frame: Float32Array | null = copyPlaybackFrame(new Float32Array(1024), 0, 1280)
	const floats = call.audioStream()
	const pcm = call.audioStream({ encoding: 'pcm16', highWaterMark: 1 << 16 })
	pcm.stop()
	floats.on('data', () => {})
	return [frame?.length ?? 0, typeof pcm.pipe] as const
}
void _voipAudioSurface

// §2.83 -- album / newsletter-status / status interactions / scheduling / A2UI must be typed
import {
	makeStatusAudienceMetadata, makeStatusMentionMessage, makeStatusQuestionAnswerMessage,
	makeStatusStickerInteractionMessage, withNewsletterStatusAttribution, buildNewsletterStatusNode,
	makeNewsletterAdminInviteMessage, makeNewsletterStatusSender, makeNewsletterStatusFetcher,
	encodeScheduledMessage, decodeScheduledMessage, buildUnscheduleProtocolMessage,
	a2uiSurface, a2uiCard, a2uiColumn, a2uiText, a2uiRow, a2uiButton, bloksWidget, embeddedScreen,
	chainOfThoughtSection, decodeAIRich, MessageBuilder, MB,
	type StatusAudience, type DecodedScheduledMessage, type BloksWidgetPayload
} from '../../lib/index.js'

async function _batchARSurface(sock: ReturnType<typeof makeWASocket>) {
	const audience: StatusAudience = makeStatusAudienceMetadata({ contacts: ['1@s.whatsapp.net'], except: ['2@s.whatsapp.net'] })
	await sock.sendAlbumMessage('1@s.whatsapp.net', [{ image: { url: './a.jpg' } }, { video: { url: './b.mp4' } }], { caption: 'hi' })
	await sock.sendAlbum('1@s.whatsapp.net', [{ image: { url: './a.jpg' } }, { image: { url: './b.jpg' } }])
	await sock.sendNewsletterStatus('1@newsletter', { text: 'hi' }, { statusJidList: audience.statusJidList, newsletterName: 'JAP' })
	const entries = await sock.fetchNewsletterStatus('1@newsletter', { count: 5 })
	const views: number = entries[0]?.views ?? 0
	await sock.sendNewsletterAdminInvite('1@s.whatsapp.net', { newsletterJid: '1@newsletter', newsletterName: 'JAP' })
	await sock.sendStatusReshare({ message: { conversation: 'x' } }, { statusJidList: audience.statusJidList })
	await sock.sendStatusQuestionAnswer('1@s.whatsapp.net', { id: 'K' }, 'yes')
	await sock.sendStatusStickerInteraction('1@s.whatsapp.net', { id: 'K' }, { id: 'S' }, { type: 1 })

	const handle = sock.scheduleMessage('1@s.whatsapp.net', { text: 'later' }, { at: new Date(Date.now() + 60_000) })
	const cancelled: boolean = handle.cancel()
	await sock.unscheduleMessage('1@s.whatsapp.net', { id: 'K' }, { scheduleId: handle.scheduleId })

	const enc = encodeScheduledMessage({ text: 'x' }, { at: Date.now() + 60_000 })
	const dec: DecodedScheduledMessage | null = decodeScheduledMessage(enc.content)
	void buildUnscheduleProtocolMessage({ id: 'K' })
	void makeStatusMentionMessage({ conversation: 'x' })
	void makeStatusQuestionAnswerMessage({ id: 'K' }, 'yes')
	void makeStatusStickerInteractionMessage({ id: 'K' })
	void withNewsletterStatusAttribution({ text: 'x' }, { newsletterJid: '1@newsletter' })
	void buildNewsletterStatusNode({ newsletterJid: '1@newsletter' })
	void makeNewsletterAdminInviteMessage({ newsletterJid: '1@newsletter', newsletterName: 'JAP' })
	void makeNewsletterStatusSender(sock)
	void makeNewsletterStatusFetcher(sock)

	const widget: BloksWidgetPayload = bloksWidget(a2uiSurface([
		a2uiCard(a2uiColumn([a2uiText('hi'), a2uiRow([a2uiButton(a2uiText('go'), { action: { name: 'cta_url' } })])]))
	]))
	const screen = embeddedScreen([a2uiText('step')], { title: 'Flow' })
	const cot = chainOfThoughtSection(['a', 'b'])
	const read = decodeAIRich({ message: {} })
	const hub = new MessageBuilder(sock as never)
	void (MB === MessageBuilder)
	return [audience.type, views, cancelled, dec?.scheduleId, widget.uuid, screen.screenId, cot.tasks.length, read.found, typeof hub] as const
}
void _batchARSurface

// §2.84 -- parity batch 1 must be typed
import {
	setBannerEnabled, isBannerEnabled,
	getPollOptionHash, makePollAddOptionMessage, makeQuestionMessage, makeQuestionReplyMessage,
	makeQuestionResponseMessage, quizQuestion, quizSection, sideBySideSurveyItem,
	money, readMoney, buildSplitPayment, buildSplitPaymentUpdate, readSplitPayment,
	buildPaymentReminder, readPaymentReminder, quotaUpsellButton, quotaUpsellSection,
	makeStatusQuotedMessage, makeStatusAddYoursAssociation, makeStatusNotificationMessage,
	makeGroupStatusAttribution, makeGroupStatusReactionMessage,
	buildNewsletterStatusReactionNode, buildNewsletterStatusRevokeNode,
	buildNewsletterAdminProfileStatusMessage, makeNewsletterFollowerInviteMessage,
	extractNewsletterMessageMeta, parseNewsletterStatusAck, waitForNewsletterStatusServerId,
	buildScheduledMsgMetaNode, isScheduledTimeValid, generateRevealKey, generateRevealKeyId,
	encryptWithRevealKey, decryptWithRevealKey, buildConditionalRevealMessage,
	type MoneyValue, type SplitPayment, type QuizQuestion, type RevealEnvelope
} from '../../lib/index.js'

async function _batchASSurface(sock: ReturnType<typeof makeWASocket>) {
	const quiet: boolean = setBannerEnabled(false) || isBannerEnabled()
	const hash: string = getPollOptionHash('Nasi', 'hex')
	const bytes: Buffer = getPollOptionHash('Nasi')
	const extended = makePollAddOptionMessage({ message: {} as never }, ['Soto'])
	void makeQuestionMessage('Pilih', { answers: ['a', 'b'], allowMultiple: true })
	void makeQuestionReplyMessage({ id: 'Q' }, 'ok')
	void makeQuestionResponseMessage({ id: 'Q' }, 0, { answers: ['a'] })
	const quiz: QuizQuestion = quizQuestion('x', ['a', 'b'], { correct: 1 })
	void quizSection('t', [quiz])
	void sideBySideSurveyItem('p', 'a', 'b')

	const amount: MoneyValue = money(25.5, 'USD')
	const plain = readMoney(amount)?.amount ?? 0
	const split: SplitPayment = buildSplitPayment({ total: 100, currencyCode: 'USD', participants: ['a@s.whatsapp.net'] })
	void buildSplitPaymentUpdate(split, { jid: 'a@s.whatsapp.net', status: 'settled' })
	void readSplitPayment(split)
	void readPaymentReminder(buildPaymentReminder({ jid: 'a@s.whatsapp.net', amount: 5, currencyCode: 'USD' }))
	void quotaUpsellSection({ buttons: [quotaUpsellButton('Upgrade', { url: 'https://x' })] })

	void makeStatusQuotedMessage({ id: 'S' }, { text: 'hi' })
	void makeStatusAddYoursAssociation({ conversation: 'x' }, { id: 'S' })
	void makeStatusNotificationMessage({ id: 'S' }, { id: 'R' })
	void makeGroupStatusAttribution({ conversation: 'x' }, '1@g.us')
	void makeGroupStatusReactionMessage({ id: 'S' }, '🔥')

	void buildNewsletterStatusReactionNode({ newsletterJid: '1@newsletter', serverMessageId: 1, code: '👍' })
	void buildNewsletterStatusRevokeNode({ newsletterJid: '1@newsletter', serverMessageId: 1 })
	void buildNewsletterAdminProfileStatusMessage({ newsletterJid: '1@newsletter', text: 'hi' })
	void makeNewsletterFollowerInviteMessage({ newsletterJid: '1@newsletter', newsletterName: 'JAP' })
	void extractNewsletterMessageMeta({ tag: 'ack', attrs: {} })
	void parseNewsletterStatusAck({ tag: 'ack', attrs: {} }, 'M')
	await sock.reactToNewsletterStatus('1@newsletter', 1, '👍')
	await sock.revokeNewsletterStatus('1@newsletter', 1)
	const updates = await sock.fetchNewsletterStatusUpdates('1@newsletter', { since: 0 })

	void buildScheduledMsgMetaNode({ scheduleId: 'S', scheduledAt: Date.now() + 60_000 })
	const valid: boolean = isScheduledTimeValid(Date.now() + 60_000).valid
	const key = generateRevealKey()
	const envelope: RevealEnvelope = encryptWithRevealKey({ text: 'x' }, key)
	void decryptWithRevealKey(envelope, key)
	const locked = buildConditionalRevealMessage({ text: 'x' }, key, { revealAt: Date.now() + 60_000 })
	void generateRevealKeyId(key)
	const serverIdPromise = waitForNewsletterStatusServerId(sock, 'M', { timeoutMs: 10 }).catch(() => 0)
	return [quiet, hash, bytes.length, extended.values.length, plain, valid, locked.keyId, updates.updates.length, await serverIdPromise] as const
}
void _batchASSurface

// §2.85 -- parity wave 2 must be typed
import {
	makeVoipClient, bindVoiceRecognition, VideoFeeder, AudioFeeder, VIDEO_FORMAT_I420, i420FrameSize,
	verifyBotSignature, constructSignaturePayload, loadBotSignatureRoot, isParsableCertificateChain,
	readSignedRichResponse, verifyRichResponseSignature,
	a2uiWidget, bloksSection, decodeBloksWidget, sendBloksWidget, embeddedTab, embeddedTabbedContent,
	thinkingSection, plannerStep, searchPlannerSection, multipleResponseSection, fusedComparisonSection,
	getExports, isKnownButtonName, update, reloadExports, enableAutoUpdate, disableAutoUpdate,
	isAutoUpdateEnabled, flushAutoUpdate, onExportsUpdated,
	type ExportsSnapshot, type BotSignatureResult, type PlannerStepStatus
} from '../../lib/index.js'

async function _batchATSurface(sock: ReturnType<typeof makeWASocket>, call: ActiveCall) {
	const voip = makeVoipClient({})
	const rec = bindVoiceRecognition(call, async pcm => ({ text: `${pcm.length}` }), { chunkMs: 500, onText: () => {} })
	const transcript: string = await rec.stop()
	const feeder = new VideoFeeder(320, 240, 15, frame => void frame.length, 'lavfi:testsrc')
	feeder.start(); feeder.stop()
	const size: number = i420FrameSize(320, 240)
	void (VIDEO_FORMAT_I420 === 0)
	void AudioFeeder

	const root = loadBotSignatureRoot('-----BEGIN PUBLIC KEY-----\nx\n-----END PUBLIC KEY-----')
	const result: BotSignatureResult = verifyBotSignature({}, { root, payload: {} })
	void constructSignaturePayload({ payload: {}, certificateChain: [Buffer.alloc(4)] })
	void isParsableCertificateChain([Buffer.alloc(4)])
	void readSignedRichResponse({}, { root })
	const ok: boolean = verifyRichResponseSignature({})

	const widget = a2uiWidget([{ id: 't', component: 'Text', text: 'x' }])
	void bloksSection('Title', [a2uiText('x')])
	const decoded = decodeBloksWidget(widget)
	await sendBloksWidget(sock, '1@s.whatsapp.net', widget, { body: 'b' })
	const tabs = embeddedTabbedContent([embeddedTab('One', [a2uiText('x')])], { title: 'Flow' })
	void thinkingSection(['a'])
	const status: PlannerStepStatus = 'done'
	void plannerStep('step', { status })
	void searchPlannerSection('q', ['a'], { sources: [{ url: 'https://x', title: 't' }] })
	void multipleResponseSection(['a', 'b'], { selected: 1 })
	void fusedComparisonSection(['A', 'B'], [{ label: 'row', values: ['1', '2'] }], { recommend: 0 })

	const snapshot: ExportsSnapshot = getExports()
	const known: boolean = isKnownButtonName('quick_reply')
	await update(['new_flow'])
	await update({ url: 'https://x/defs.json' }, { merge: false }).catch(() => snapshot)
	const off = onExportsUpdated(() => {})
	off()
	const handle = enableAutoUpdate({ url: 'https://x/defs.json', intervalMs: 600_000, onError: () => {} })
	handle.stop(); disableAutoUpdate(); reloadExports()
	await flushAutoUpdate()
	return [typeof voip, transcript, size, result.verified, ok, decoded?.components.length, tabs.tabs.length, known, isAutoUpdateEnabled()] as const
}
void _batchATSurface

// §2.86 -- parity wave 3 must be typed
import {
	checkHtmlApp, prepareFileArtifact, htmlMultiplayerPrelude, withHtmlMultiplayer,
	sendHtmlDocument, sendHtmlArtifact, sendHtmlApp, htmlSection, htmlMedia,
	loadOptionalModule, forgetOptionalModule, loadSharp, loadFfmpeg, TTLCache, prepareLinkThumbnail,
	validateUsername, displayUsername, isUsernamePin, stripUsernamePrefix,
	linkSticker, locationSticker, musicSticker, channelSticker, messageSticker, normalizeStickers, readStickers,
	buildMusicMessage, readMusicMessage, buildSocialPreview, readSocialPreview,
	makeCommentMessage, commentSection, makeEventInviteMessage, calendarEvent, makeMessageAssociation,
	mapSection, placeItem, sportsSection, reminderSection, taskSection, transparencySection,
	useNekoDBAuth, countAuthFileLocks,
	type HtmlAppReport, type MultiplayerSession
} from '../../lib/index.js'

async function _batchAUSurface(sock: ReturnType<typeof makeWASocket>) {
	const report: HtmlAppReport = checkHtmlApp('<html></html>', { allowExternal: false })
	const artifact = prepareFileArtifact('<html></html>', { fileName: 'a.html' })
	const session: MultiplayerSession = htmlMultiplayerPrelude({ participants: ['a@s.whatsapp.net'] }).session
	const injected: string = withHtmlMultiplayer('<html></html>', { sessionId: session.sessionId }).html
	await sendHtmlDocument(sock, '1@s.whatsapp.net', '<html></html>', { fileName: 'a.html' })
	await sendHtmlArtifact(sock, '1@s.whatsapp.net', Buffer.from('x'), { title: 'T' })
	const mode = (await sendHtmlApp(sock, '1@s.whatsapp.net', '<html></html>', { url: 'https://x' })).mode
	await sock.sendHtmlDocument('1@s.whatsapp.net', '<html></html>')
	await sock.sendHtmlArtifact('1@s.whatsapp.net', Buffer.from('x'))
	await sock.sendHtmlApp('1@s.whatsapp.net', '<html></html>', { url: 'https://x' })
	void htmlSection('T', '<html></html>')
	void htmlMedia(Buffer.from([1]), { mimetype: 'image/png' })

	void (await loadOptionalModule('sharp'))
	void forgetOptionalModule('sharp')
	void (await loadSharp()); void (await loadFfmpeg())
	const cache = new TTLCache<string>({ ttlMs: 1000, max: 10 })
	cache.set('k', 'v'); cache.get('k'); cache.has('k'); cache.sweep(); cache.keys(); cache.delete('k')
	const wrapped: string = await cache.wrap('k2', async () => 'v')
	void (await prepareLinkThumbnail('https://x/img.png', { size: 128, cache }))

	const check = validateUsername('@japofc')
	const shown: string = displayUsername('japofc', { fallback: '-' })
	void isUsernamePin('123456'); void stripUsernamePrefix('@japofc')

	void normalizeStickers([
		linkSticker('https://x.com'),
		locationSticker({ latitude: 0, longitude: 0 }),
		musicSticker({ title: 'x' }),
		channelSticker('1@newsletter'),
		messageSticker({ id: 'K' })
	])
	void readStickers({})
	void readMusicMessage({ message: buildMusicMessage({ title: 'x' }) })
	void readSocialPreview({ message: buildSocialPreview({ url: 'https://x.com' }) })
	void makeCommentMessage({ id: 'K' }, 'hi')
	void commentSection(['a'])
	void makeEventInviteMessage({ eventTitle: 'E', startTime: new Date() })
	void calendarEvent('E', { start: Date.now() })
	void makeMessageAssociation({ id: 'P' }, { type: 1 })
	void mapSection([placeItem({ name: 'P', latitude: 0, longitude: 0 })])
	void sportsSection({ home: 'A', away: 'B', status: 'live' })
	void reminderSection('r', Date.now())
	void taskSection(['a', { title: 'b', status: 'done' }])
	void transparencySection({ sources: ['https://x.com'], model: 'jap-1' })

	const neko = await useNekoDBAuth({ file: './neko.json', session: 's' })
	const locks = countAuthFileLocks()
	return [report.ok, artifact.fileLength, injected.length, mode, wrapped, check.valid, shown, typeof neko.saveCreds, locks] as const
}
void _batchAUSurface

// §2.87 -- logger compat, MB.bind and the JAPDB auth state must be typed
import {
	ensureLogger, isUsableLogger, silentLogger, useJAPDBAuth,
	useNekoDBAuth as useNekoDBAuthAlias,
	MessageBuilder as MBuilder
} from '../../lib/index.js'

async function _batchAVSurface(sock: ReturnType<typeof makeWASocket>) {
	const adapted = ensureLogger(console)
	const silent = ensureLogger(false)
	adapted.child({ class: 'ns' }).info({ a: 1 }, 'hello')
	const usable: boolean = isUsableLogger(silentLogger())
	const quiet = makeWASocket({ auth: undefined as never, logger: ensureLogger(false) })
	quiet.end(undefined)

	const unbind = MBuilder.bind(sock, { prefix: 'jap', overwrite: false })
	const boundNames: string[] = unbind.bound
	const skipped: string[] = unbind.skipped
	unbind.hub.carousel()
	unbind()

	const primary = await useJAPDBAuth({ file: './auth.json', session: 's' })
	const alias = await useNekoDBAuthAlias({ file: './auth.json', session: 's' })
	return [typeof adapted.child, silent.level, usable, boundNames.length, skipped.length, typeof primary.saveCreds, typeof alias.saveCreds] as const
}
void _batchAVSurface

// §2.88 -- the optional-pino logger surface must be typed
import defaultLogger, { resolvePino, createFallbackLogger, usingPino } from '../../lib/Utils/logger.js'
function _batchAWSurface() {
	const fallback = createFallbackLogger({ level: 'debug', bindings: { class: 'x' } })
	fallback.child({ stream: 's' }).info({ a: 1 }, 'hi')
	const pino: any | null = resolvePino()
	const on: boolean = usingPino
	defaultLogger.warn('still here')
	return [typeof fallback.child, pino === null, on] as const
}
void _batchAWSurface

// §2.89 -- the newsletter.message event must be typed
import type { BaileysEventMap } from '../../lib/Types/Events.js'
function _batchAXSurface(sock: ReturnType<typeof makeWASocket>) {
	sock.ev.on('newsletter.message', (post: BaileysEventMap['newsletter.message']) => {
		const id: string = post.id
		const serverId: string | undefined = post.server_id
		const fromMe: boolean = post.fromMe
		const author: string | undefined = post.author
		const timestamp: number = post.timestamp
		void [id, serverId, fromMe, author, timestamp, post.message, post.key]
	})
}
void _batchAXSurface

// §2.90 -- unsupported envelopes must be typed
import {
	buildUnsupportedEnvelopeEvent, UNSUPPORTED_ENVELOPE_ERROR_TEXT, DEFAULT_UNSUPPORTED_ENVELOPE_TYPES
} from '../../lib/index.js'
function _batchAYSurface() {
	const quiet = makeWASocket({ auth: undefined as never, unsupportedEnvelopeTypes: [], logger: ensureLogger(false) })
	quiet.ev.on('messages.decrypt-failed', (failures: BaileysEventMap['messages.decrypt-failed']) => {
		for (const failure of failures) {
			const key = failure.key
			const error: string = failure.error
			const willRetry: boolean = failure.willRetry
			void [key, error, willRetry]
		}
	})
	quiet.end(undefined)
	const evt = buildUnsupportedEnvelopeEvent({ attrs: { id: 'X', from: '1@s.whatsapp.net' } }, '2@s.whatsapp.net', '', 'msmsg')
	const types: string[] = DEFAULT_UNSUPPORTED_ENVELOPE_TYPES
	return [evt.error.startsWith(UNSUPPORTED_ENVELOPE_ERROR_TEXT), types.length] as const
}
void _batchAYSurface

// §2.91 -- receipt aggregation must be typed
import { aggregateMessageKeysNotFromMe, RECEIPT_BATCH_MAX } from '../../lib/index.js'
async function _batchAZSurface(sock: ReturnType<typeof makeWASocket>) {
	const batches = aggregateMessageKeysNotFromMe(
		[{ remoteJid: '1@s.whatsapp.net', id: 'A', fromMe: false }],
		{ batchSize: 50 }
	)
	const ids: string[] = batches[0]?.messageIds ?? []
	await sock.readMessages([{ remoteJid: '1@s.whatsapp.net', id: 'A', fromMe: false }], { batchSize: 25 })
	await sock.sendReceipts([{ remoteJid: '1@s.whatsapp.net', id: 'A', fromMe: false }], 'read', { batchSize: 25 })
	await sock.readMessages([{ remoteJid: '1@s.whatsapp.net', id: 'A', fromMe: false }])
	const max: number = RECEIPT_BATCH_MAX
	return [ids.length, batches[0]?.jid, max] as const
}
void _batchAZSurface

// §2.92 -- the group-invite cache must be typed on the config and the socket
function _batchBASurface() {
	const cache = createGroupInviteThumbnailCache({ ttlMs: DEFAULT_GROUP_INVITE_THUMBNAIL_TTL_MS, max: 50 })
	const sock = makeWASocket({ auth: undefined as never, logger: ensureLogger(false), groupInviteThumbnailCache: cache })
	const size: number = sock.groupInviteThumbnailCache?.size ?? 0
	sock.groupInviteThumbnailCache?.clear()
	const off = makeWASocket({ auth: undefined as never, logger: ensureLogger(false), groupInviteThumbnailCache: false })
	sock.end(undefined); off.end(undefined)
	return [cache.ttlMs, size] as const
}
void _batchBASurface

// §2.93 -- sender-key memory tools must be typed
import { clearSenderKeyMemory, readSenderKeyMemory, forgetSenderKeyDevices } from '../../lib/index.js'
async function _batchBBSurface(sock: ReturnType<typeof makeWASocket>) {
	const viaSocket = await sock.clearSenderKeyMemory('120363000@g.us')
	const cleared: number = viaSocket.cleared
	const memory = await sock.readSenderKeyMemory(['120363000@g.us'])
	const devices: Record<string, boolean> = memory['120363000@g.us'] ?? {}
	const dropped = await sock.forgetSenderKeyDevices('120363000@g.us', ['628a@s.whatsapp.net:0'])
	void (await clearSenderKeyMemory(sock.authState.keys, '120363000@g.us'))
	void (await readSenderKeyMemory(sock.authState.keys, '120363000@g.us'))
	void (await forgetSenderKeyDevices(sock.authState.keys, '120363000@g.us', '628a@s.whatsapp.net:0'))
	return [cleared, Object.keys(devices).length, dropped.removed, dropped.remaining] as const
}
void _batchBBSurface

// §2.94 / §2.95 -- invite accept + group addressing must stay typed
import { resolveGroupAddressingMode, isUsableGroupMetadata, DEFAULT_GROUP_ADDRESSING_MODE } from '../../lib/index.js'
async function _batchBCSurface(sock: ReturnType<typeof makeWASocket>) {
	await sock.groupAcceptInviteV4({ id: 'M', remoteJid: '120363@g.us', participant: '628@s.whatsapp.net' }, {
		groupJid: '120999@g.us', inviteCode: 'CODE', inviteExpiration: 1_999_999_999
	} as never)
	const resolved = resolveGroupAddressingMode({ participants: [{ id: '628@s.whatsapp.net' }] })
	const mode: 'pn' | 'lid' = resolved.mode
	const source: 'metadata' | 'participants' | 'default' = resolved.source
	const check = isUsableGroupMetadata({ participants: [] }, { requireAddressingMode: true })
	const reason: string | null = check.reason
	return [mode, source, check.usable, reason, DEFAULT_GROUP_ADDRESSING_MODE] as const
}
void _batchBCSurface

// §2.96 -- fork-parity wave 4 must be typed
import {
	NORMALIZE_MAX_DEPTH, normalizeJid, parseJid, encodeJid, isJidLid, isJidMetaAi, isJidUserLike,
	lidToJid, jidToLid, getSenderJid, getSenderLid, getSenderPn, getBotJid,
	getTextFromMessage, getInteractiveResponse, getStatusMediaType,
	NATIVE_FLOW_NAMES, isWebSupportedButtonName, getNativeFlowNameByButtonName,
	checkNativeFlowButtons, validateAndNormalizeButtons, validateAndNormalizeSections,
	setBlockReadReceipts, getBlockReadReceipts, clearBlockReadReceipts, isReadReceiptBlocked
} from '../../lib/index.js'

async function _batchBDSurface(sock: ReturnType<typeof makeWASocket>) {
	const depth: number = NORMALIZE_MAX_DEPTH
	const jid: string = normalizeJid('628:3@c.us')
	const parsed = parseJid('628@s.whatsapp.net')
	const encoded: string = encodeJid('628', 'lid')
	const lid: string | null = await lidToJid('111@lid', sock)
	const pn: string | null = await jidToLid('628@s.whatsapp.net', sock)
	const msg = { key: { remoteJid: '120@g.us', participant: '628@s.whatsapp.net' }, message: { conversation: 'hi' } }
	const text: string = getTextFromMessage(msg)
	const reply = getInteractiveResponse(msg)
	const media: 'text' | 'image' | 'video' | 'audio' | null = getStatusMediaType(msg)
	const flags = [isJidLid(jid), isJidMetaAi(jid), isJidUserLike(jid)] as const

	const names: string[] = NATIVE_FLOW_NAMES
	const web: boolean = isWebSupportedButtonName('quick_reply')
	const name: string | null = getNativeFlowNameByButtonName({ url: 'https://x' })
	const report = checkNativeFlowButtons([{ text: 'Hi', id: '1' }], { requireWebSupport: true })
	const buttons = validateAndNormalizeButtons([{ text: 'Hi', id: '1' }])
	const sections = validateAndNormalizeSections([{ title: 'Menu', rows: [{ title: 'Satu' }] }], { rowLimit: 10 })

	setBlockReadReceipts(true, { chats: ['1@s.whatsapp.net'] })
	const state = getBlockReadReceipts()
	const blocked: boolean = isReadReceiptBlocked('1@s.whatsapp.net')
	clearBlockReadReceipts()

	return [depth, parsed?.user, encoded, lid, pn, text, reply?.type, media, flags.length,
		names.length, web, name, report.ok, buttons.length, sections.length, state.all, blocked,
		getSenderJid(msg), getSenderLid(msg), getSenderPn(msg), getBotJid(msg)] as const
}
void _batchBDSurface

// §2.97 -- parity wave 5 must be typed
import {
	isTcTokenExpired, shouldSendNewTcToken, toTcTokenSeconds, readTcTokenIndex, TC_TOKEN_INDEX_KEY,
	validateJid, isValidJid, assertJid, assertLid, toJid, jidKind, isJidLocationBroadcast,
	LOCATION_BROADCAST_JID, buildMemberLabelMessage, MEMBER_LABEL_MAX_LENGTH,
	makeScheduledCallCreationMessage, makeScheduledCallEditMessage, readScheduledCall,
	videoToJpeg, convertToOpusBuffer, processContactAction, emitSyncActionResults
} from '../../lib/index.js'

async function _batchBESurface(sock: ReturnType<typeof makeWASocket>) {
	const seconds: number | null = toTcTokenSeconds({ low: 1700000000, high: 0 })
	const expired: boolean = isTcTokenExpired(seconds)
	const refresh: boolean = shouldSendNewTcToken(seconds)
	const index: string[] = await readTcTokenIndex(sock.authState.keys)

	const check = validateJid('628@s.whatsapp.net')
	const reason: string | null = check.reason
	const normalised: string = assertJid('628@s.whatsapp.net')
	const lid: string = assertLid('111@lid')
	const built: string = toJid({ user: '628', server: 'lid' })
	const kind = jidKind(LOCATION_BROADCAST_JID)

	void buildMemberLabelMessage('Admin', { timestamp: Date.now() })
	const call = makeScheduledCallCreationMessage({ title: 'Standup', at: new Date(Date.now() + 3_600_000), callType: 'video' })
	void makeScheduledCallEditMessage({ id: 'C' }, { editType: 'cancel' })
	const read = readScheduledCall({ message: call })

	const jpeg: Promise<Buffer> = videoToJpeg('./clip.mp4', { at: '00:00:02', width: 320 })
	const opus = convertToOpusBuffer(Buffer.alloc(0), { bitrate: '64k' })
	void jpeg.catch(() => Buffer.alloc(0))
	void opus.catch(() => null)

	const results = processContactAction({ fullName: 'Budi' }, '628@s.whatsapp.net', undefined)
	emitSyncActionResults(sock.ev as never, results)
	return [expired, refresh, index.length, isValidJid('x'), reason, normalised, lid, built, kind,
		read?.title, MEMBER_LABEL_MAX_LENGTH, isJidLocationBroadcast(LOCATION_BROADCAST_JID), TC_TOKEN_INDEX_KEY] as const
}
void _batchBESurface
