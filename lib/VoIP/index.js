import { EventEmitter } from "node:events";
import { randomBytes, createHmac } from "node:crypto";

import { WasmEngine } from "./wasm-engine.js";
import { RelayRtcTransport } from "./relay-transport.js";
import { SignalingBridge } from "./signaling.js";
import { AudioFeeder } from "./audio-feeder.js";
import { CallState } from "./types.js";
import { createWavRecorder } from "./call-recorder.js";

export { CallState } from "./types.js";
export { createWavRecorder } from "./call-recorder.js"; // JAP@Add

const SHA256_LEN = 32;

const toBareJid = (jid) => {
  if (!jid) return jid;
  const at = jid.indexOf("@");
  if (at < 0) return jid;
  const user = jid.slice(0, at).split(":")[0];
  return `${user}@${jid.slice(at + 1)}`;
};

const computeHkdf = (key, salt, info, length) => {
  const effectiveSalt = salt && salt.length > 0 ? Buffer.from(salt) : Buffer.alloc(SHA256_LEN, 0);
  const prk = createHmac("sha256", effectiveSalt).update(key).digest();
  const blocks = Math.ceil(length / SHA256_LEN);
  const okm = Buffer.alloc(blocks * SHA256_LEN);
  let prev = Buffer.alloc(0);
  for (let i = 1; i <= blocks; i += 1) {
    prev = createHmac("sha256", prk)
      .update(prev)
      .update(info)
      .update(Buffer.from([i]))
      .digest();
    prev.copy(okm, (i - 1) * SHA256_LEN);
  }
  return new Uint8Array(okm.buffer, okm.byteOffset, length);
};

const computeHmacSha256 = (data, key) => {
  const result = createHmac("sha256", Buffer.from(key)).update(data).digest();
  return new Uint8Array(result.buffer, result.byteOffset, result.byteLength);
};

const isCallReceiptNode = (node) => {
  if (node?.tag !== "receipt") return false;
  const child = Array.isArray(node.content) ? node.content[0] : null;
  return !!(child?.attrs?.["call-id"] || child?.attrs?.call_id);
};

export class ActiveCall extends EventEmitter {
  #state = CallState.Idle;
  #endResolver;
  #endPromise;
  #endTimer = null;
  #endGraceTimer = null; // JAP@Fix: fallback if the engine never confirms the end
  #endRequested = false; // JAP@Fix: "end asked for" is NOT "end completed"
  #ended = false;
  _audioSource = "silence";

  constructor(callId, engine, durationMs, meta = {}) {
    super();
    this.callId = callId;
    this.startedAt = Date.now(); // JAP@Add
    this._recorder = null; // JAP@Add
    this.engine = engine;
    this.direction = meta.direction || 'outbound'; // JAP@Add: outbound|inbound|group-outbound|group-inbound
    this.from = meta.from || null; // JAP@Add: inbound caller
    this.groupJid = meta.groupJid || null; // JAP@Add: group calls
    this.#endPromise = new Promise((res) => { this.#endResolver = res; });
    if (durationMs > 0) {
      this.#endTimer = setTimeout(() => this.end(), durationMs);
    }
  }

  get state() { return this.#state; }

  // JAP@Fix (lifecycle): end() used to set #ended=true itself, so when the
  // engine's state callback later ran _updateState(Idle) -> _forceEnd(), the
  // guard saw #ended and returned early — the "ended" event never fired,
  // waitForEnd() hung forever and recordToFile() never finalized the WAV.
  // Now: end() only REQUESTS the end; #ended is owned by _forceEnd(). If the
  // engine throws or never confirms within 5s, we force-complete ourselves.
  end = () => {
    if (this.#ended || this.#endRequested) return;
    this.#endRequested = true;
    if (this.#endTimer) { clearTimeout(this.#endTimer); this.#endTimer = null; }
    try {
      const result = this.engine.endCall(0, true);
      // JAP@Fix: an async engine that REJECTS its endCall promise used to
      // surface as an unhandledRejection while the call hung in limbo —
      // treat it exactly like a synchronous throw.
      if (result && typeof result.then === "function") {
        result.catch(() => this._forceEnd("end_failed"));
      }
    } catch {
      this._forceEnd("end_failed");
      return;
    }
    this.#endGraceTimer = setTimeout(() => this._forceEnd("end_timeout"), 5000);
    if (typeof this.#endGraceTimer.unref === "function") this.#endGraceTimer.unref();
  };

  mute = (muted) => {
    try { this.engine.setMute(muted); } catch {}
  };

  /** JAP@Add --- group-call participant management (no-op false when unsupported). */
  invite = (pnUserJid, lidUserJid = '', deviceJids = []) => {
    try { this.engine.inviteToCall({ invitedParticipantPnUserJid: pnUserJid, invitedParticipantLidUserJid: lidUserJid, deviceJids }); return true; } catch { return false; }
  };
  removeParticipant = (peerJid) => {
    try { this.engine.removeCallParticipant(peerJid); return true; } catch { return false; }
  };
  requestMute = (peerJid) => {
    try { this.engine.requestPeerMute(peerJid); return true; } catch { return false; }
  };
  react = (reaction) => {
    try { return this.engine.sendReaction(reaction); } catch { return false; }
  };
  setHandRaised = (raised) => {
    try { return this.engine.raiseHand(raised); } catch { return false; }
  };

  /** JAP@Add --- ms elapsed since this call object was created. */
  getDurationMs = () => Date.now() - (this.startedAt || Date.now());

  /**
   * JAP@Add --- record the INBOUND (remote peer) audio stream to a .wav file.
   * Returns a stop() function; the file is also finalized automatically on call end.
   */
  recordToFile = (filePath, opts = {}) => {
    if (this._recorder) throw new Error("Already recording this call.");
    this._recorder = createWavRecorder(filePath, opts);
    const onAudio = (pcm) => { try { this._recorder.write(pcm); } catch {} };
    const onEnd = () => { try { this._recorder?.close(); } catch {} this._recorder = null; };
    this.on("audio", onAudio);
    this.once("ended", onEnd);
    return () => {
      this.off("audio", onAudio);
      this.off("ended", onEnd);
      onEnd();
    };
  };

  waitForEnd = () => this.#endPromise;

  _updateState = (state) => {
    this.#state = state;
    if (state === CallState.PreacceptReceived) this.emit("ringing");
    else if (state === CallState.Active) this.emit("connected");
    else if (state === CallState.Idle || state === CallState.Ending) {
      this._forceEnd("ended");
    }
  };

  _emitAudio = (pcm) => { this.emit("audio", pcm); };

  _forceEnd = (reason) => {
    if (this.#ended) return;
    this.#ended = true;
    if (this.#endTimer) { clearTimeout(this.#endTimer); this.#endTimer = null; }
    if (this.#endGraceTimer) { clearTimeout(this.#endGraceTimer); this.#endGraceTimer = null; } // JAP@Fix
    this.emit("ended", reason);
    this.#endResolver(reason);
  };
}

export class VoipClient extends EventEmitter {
  #config;
  #engine = null;
  #relay = null;
  #signaling = null;
  #sock = null;
  #activeCall = null;
  #lastPeer = null; // JAP@Add: { peerJid, callId } for recovery
  #lastGroupJoin = null; // JAP@Add: params for rejoinGroupCall()
  #watchdogTimer = null; // JAP@Add: relay-health watchdog
  #watchdogMisses = 0;
  #lastReceivedPackets = -1; // JAP@Add: watchdog tracks real media traffic
  #recoveryAttempts = 0; // JAP@Fix: consecutive failed recoveries for the current call
  #capturePtr = 0;
  #captureChunkBytes = 0;
  #captureSampleRate = 16000;
  #captureChannels = 1;
  #captureFramesPerChunk = 320;
  #feeder = null;

  constructor(config = {}) {
    super(); // JAP@Add --- VoipClient now emits 'incoming-call' / 'outgoing-call' / 'call-ended'
    this.#config = config;
  }

  connectWithSocket = async (existingSock) => {
    this.#sock = existingSock;
    await this.#initVoipStack();
  };

  #initVoipStack = async () => {
    this.#signaling = new SignalingBridge({
      sock: this.#sock,
      // JAP@Add --- surface inbound offers as 'incoming-call' events
      onIncomingCall: (info) => this.#handleIncomingCall(info),
    });
    await this.#signaling.init();

    this.#relay = this.#config.relay ?? new RelayRtcTransport({
      onTransportMessage: (data, ip, port) => this.#engine?.handleOnTransportMessage(data, ip, port),
      onIceRtt: (rttMs, ip, port) => this.#engine?.updateIceRtt(rttMs, ip, port),
    });

    // JAP@Add --- `config.engine`/`config.relay` injection (tests + custom stacks)
    this.#engine = this.#config.engine ?? new WasmEngine({
      resourcesPath: this.#config.resourcesPath,
      callbacks: {
        onSignalingXmpp: (peerJid, callId, xmlPayload) =>
          this.#signaling.sendSignaling(peerJid, callId, xmlPayload),
        onCallEvent: (eventType, eventData) => this.#handleCallEvent(eventType, eventData),
        sendDataToRelay: (data, ip, port) => this.#relay.send(data, ip, port),
        onAudioCaptureInit: (config) => this.#handleAudioCaptureInit(config),
        onAudioCaptureStart: () => this.#handleAudioCaptureStart(),
        onAudioCaptureStop: () => this.#handleAudioCaptureStop(),
        onAudioPlaybackData: (audioData) => this.#activeCall?._emitAudio(audioData),
        cryptoHkdf: computeHkdf,
        hmacSha256: computeHmacSha256,
      },
    });

    await this.#engine.initialize();
    this.#signaling.attachEngine(this.#engine);

    const selfPnJid = this.#sock.authState.creds.me?.id;
    const selfLidJid = this.#sock.authState.creds.me?.lid;
    this.#engine.initVoipStack(selfPnJid, toBareJid(selfPnJid), selfLidJid);
    await this.#engine.waitForVoipStackReady();
    try { this.#engine.updateNetworkMedium(2, 0); } catch {}

    this.#sock.ws.on("CB:call", (node) => {
      this.#signaling.processIncomingCall(node, this.#engine, this.#activeCall?.callId ?? "");
    });
    this.#sock.ws.on("CB:receipt", (node) => {
      if (!isCallReceiptNode(node)) return;
      this.#signaling.processIncomingReceipt(node, this.#engine, this.#activeCall?.callId ?? "");
    });
    // JAP@Add --- socket-drop recovery: end media cleanly, re-announce on reconnect
    try {
      this.#sock.ev.on("connection.update", ({ connection }) => {
        if (connection === "close" && this.#activeCall) {
          this.#activeCall._forceEnd("socket_closed");
        } else if (connection === "open") {
          this.emit("voip-ready", {});
        }
      });
    } catch {}
  };

  /** JAP@Add --- true while a call object exists (dialing, ringing or active). */
  isBusy = () => !!this.#activeCall;

  /** JAP@Add --- the current ActiveCall, or null when idle. */
  getActiveCall = () => this.#activeCall;

  #handleIncomingCall = (info) => {
    this.emit("incoming-call", { ...info, busy: this.isBusy() });
    if (info.busy || info.ignored) return;
    // JAP@Add --- optional auto-reject
    if (this.#config?.autoReject) {
      void this.rejectCall(info.callId, info.from).catch(() => {});
      return;
    }
    // JAP@Add --- optional auto-answer (1:1) / auto-join (group)
    if (this.#config?.autoAnswer && !info.isGroupCall) {
      void this.answerCall(info.callId, { audioSource: this.#config.audioSource }).catch(() => {});
    } else if (this.#config?.autoJoinGroup && info.isGroupCall) {
      void this.joinGroupCall(info.callId, { audioSource: this.#config.audioSource }).catch(() => {});
    }
  };

  /** JAP@Add --- pending inbound offers (answers must come from here). */
  getPendingCalls = () => this.#signaling?.listPendingOffers?.() ?? [];

  /**
   * JAP@Add --- decline an inbound call (delegates to the socket's `rejectCall`)
   * and optionally send a text reply to the caller.
   */
  rejectCall = async (callId, callFrom, { text } = {}) => {
    if (!this.#sock) throw new Error("Not connected. Call connectWithSocket() first.");
    await this.#sock.rejectCall(callId, callFrom);
    const replyText = text ?? this.#config?.autoRejectText;
    if (replyText) {
      try { await this.#sock.sendMessage(callFrom, { text: replyText }); } catch {}
    }
  };

  /**
   * JAP@Add --- answer an inbound 1:1 call. The offer must still be pending
   * (see `getPendingCalls()`); offers expire after `offerTtlMs` (default 45s).
   */
  answerCall = async (callId, { audioSource = "silence", durationMs = 120_000, isMicEnabled = true } = {}) => {
    if (!this.#engine || !this.#signaling) throw new Error("Not connected. Call connectWithSocket() first.");
    if (this.#activeCall) throw new Error("A call is already active.");
    const offer = this.#signaling.takePendingOffer(callId);
    if (!offer) throw new Error(`No pending inbound offer for ${callId} (expired, answered, or unknown)`);
    const ttl = this.#config?.offerTtlMs ?? 45_000;
    if (Date.now() - offer.receivedAt > ttl) throw new Error(`Inbound offer ${callId} expired`);
    if (offer.isGroupCall) throw new Error(`Offer ${callId} is a group call — use joinGroupCall() instead`);
    const call = new ActiveCall(callId, this.#engine, durationMs, { direction: "inbound", from: offer.from });
    call._audioSource = audioSource;
    this.#activeCall = call;
    this.#lastPeer = { peerJid: offer.from, callId };
    call.once("ended", (reason) => {
      if (this.#activeCall === call) this.#activeCall = null;
      this.#stopWatchdog();
      this.emit("call-ended", { callId, reason });
    });
    this.#engine.acceptCall({ isMicEnabled });
    call._updateState(CallState.AcceptSent);
    this.emit("call-answered", { callId, from: offer.from });
    this.#startWatchdog();
    return call;
  };

  /**
   * JAP@Add --- join an inbound group call (offer must be pending).
   */
  joinGroupCall = async (callId, { audioSource = "silence", durationMs = 120_000, hasVideo = false, joinAndAccept = true, chatName = "" } = {}) => {
    if (!this.#engine || !this.#signaling) throw new Error("Not connected. Call connectWithSocket() first.");
    if (this.#activeCall) throw new Error("A call is already active.");
    const offer = this.#signaling.takePendingOffer(callId);
    if (!offer) throw new Error(`No pending group offer for ${callId} (expired, joined, or unknown)`);
    const ttl = this.#config?.offerTtlMs ?? 45_000;
    if (Date.now() - offer.receivedAt > ttl) throw new Error(`Group offer ${callId} expired`);
    const call = new ActiveCall(callId, this.#engine, durationMs, { direction: "group-inbound", from: offer.from, groupJid: offer.groupJid });
    call._audioSource = audioSource;
    this.#activeCall = call;
    this.#lastPeer = { peerJid: offer.from, callId };
    this.#lastGroupJoin = {
      callId, callCreatorJid: offer.callCreator, initialPeerJid: offer.from,
      hasVideo, groupJid: offer.groupJid, joinAndAccept, chatName,
    };
    call.once("ended", (reason) => {
      if (this.#activeCall === call) this.#activeCall = null;
      this.#stopWatchdog();
      this.emit("call-ended", { callId, reason });
    });
    this.#engine.joinOngoingCall({ ...this.#lastGroupJoin });
    this.emit("group-call-joined", { callId, groupJid: offer.groupJid, from: offer.from });
    this.#startWatchdog();
    return call;
  };

  /**
   * JAP@Add --- start a new outbound group call.
   * `participants`: phone numbers (digits) — LIDs are resolved automatically.
   */
  startGroupCall = async (groupJid, participants = [], { audioSource = "silence", durationMs = 120_000, useVideo = false, chatName = "" } = {}) => {
    if (!this.#engine || !this.#signaling) throw new Error("Not connected. Call connectWithSocket() first.");
    if (this.#activeCall) throw new Error("A call is already active.");
    if (!groupJid || !participants.length) throw new Error("startGroupCall(groupJid, participants) needs a group + at least 1 participant");
    const pnJids = participants.map((p) => `${String(p).replace(/\D/g, "")}@s.whatsapp.net`);
    const lidJids = [];
    for (const pn of pnJids) {
      try { await this.#sock.presenceSubscribe(pn); } catch {}
      try {
        const lid = await this.#signaling.resolveLid(pn);
        if (lid) lidJids.push(lid);
      } catch {}
    }
    const deviceJids = [];
    for (const lid of lidJids.length ? lidJids : pnJids) {
      try {
        const devs = await this.#signaling.discoverPeerDevices(lid);
        deviceJids.push(...devs);
      } catch {}
    }
    await this.#signaling.ensureSessionsForPeers(deviceJids.length ? deviceJids : pnJids);
    const callId = ("00" + randomBytes(16).toString("hex").slice(2)).toUpperCase();
    const call = new ActiveCall(callId, this.#engine, durationMs, { direction: "group-outbound", groupJid });
    call._audioSource = audioSource;
    this.#activeCall = call;
    this.#lastPeer = { peerJid: groupJid, callId };
    call.once("ended", (reason) => {
      if (this.#activeCall === call) this.#activeCall = null;
      this.#stopWatchdog();
      this.emit("call-ended", { callId, reason });
    });
    this.emit("group-call-started", { callId, groupJid });
    this.#engine.startGroupCall({ pnUserJids: pnJids, lidUserJids: lidJids, deviceJidsCsv: deviceJids.slice(0, 32), callId, useVideo, groupJid, chatName });
    this.#startWatchdog();
    return call;
  };

  /** JAP@Add --- rejoin the last group call (recovery after a drop). */
  rejoinGroupCall = async (overrides = {}) => {
    if (!this.#engine) throw new Error("Not connected. Call connectWithSocket() first.");
    if (this.#activeCall) throw new Error("A call is already active.");
    if (!this.#lastGroupJoin) throw new Error("No previous group call to rejoin");
    const params = { ...this.#lastGroupJoin, ...overrides };
    const call = new ActiveCall(params.callId, this.#engine, overrides.durationMs ?? 120_000, { direction: "group-inbound", groupJid: params.groupJid });
    call._audioSource = overrides.audioSource ?? "silence";
    this.#activeCall = call;
    call.once("ended", (reason) => {
      if (this.#activeCall === call) this.#activeCall = null;
      this.#stopWatchdog();
      this.emit("call-ended", { callId: params.callId, reason });
    });
    this.#engine.joinOngoingCall(params);
    this.emit("group-call-rejoined", { callId: params.callId, groupJid: params.groupJid });
    this.#startWatchdog();
    return call;
  };

  /** JAP@Add --- invite a participant into the active group call. */
  inviteToGroupCall = async (phoneNumber, deviceJids = []) => {
    if (!this.#activeCall) throw new Error("No active call");
    const targetNumber = String(phoneNumber).replace(/\D/g, "");
    const lid = await this.#signaling.resolveLid(`${targetNumber}@s.whatsapp.net`).catch(() => "");
    return this.#activeCall.invite(`${targetNumber}@s.whatsapp.net`, lid || "", deviceJids);
  };

  /** JAP@Add --- kick a participant from the active group call. */
  removeGroupParticipant = async (peerJid) => {
    if (!this.#activeCall) throw new Error("No active call");
    return this.#activeCall.removeParticipant(peerJid);
  };

  /** JAP@Add --- call-link preview/join (scheduled / lobby calls). */
  previewCallLink = (token, opts = {}) => {
    if (!this.#engine) throw new Error("Not connected. Call connectWithSocket() first.");
    return this.#engine.previewCallLink({ token, ...opts });
  };
  joinCallLink = () => {
    if (!this.#engine) throw new Error("Not connected. Call connectWithSocket() first.");
    return this.#engine.joinCallLink();
  };

  /** JAP@Add --- combined engine + relay stats snapshot. */
  getStats = () => {
    let call = null;
    try { call = this.#engine?.getCallInfo?.() ?? null; } catch {}
    let relay = null;
    try { relay = this.#relay?.getStats?.() ?? null; } catch {}
    return { busy: this.isBusy(), callId: this.#activeCall?.callId ?? null, call, relay };
  };

  /**
   * JAP@Add --- media-path recovery: re-send the crypto rekey + the call offer.
   * Called automatically by the watchdog; safe to call manually too.
   */
  recoverCall = async ({ peerJid, callId, retryCount = 1 } = {}) => {
    const target = peerJid || this.#lastPeer?.peerJid;
    const id = callId || this.#lastPeer?.callId || this.#activeCall?.callId;
    if (!target || !id) throw new Error("recoverCall needs a peer (no call on record)");
    // JAP@Fix (recovery): fail loudly when there is no engine at all — the old
    // silent catch made a fully-disconnected client report a "recovery" that
    // did nothing, so watchdog loops looked healthy while sending zero bytes.
    if (!this.#engine) throw new Error("recoverCall: engine not connected (connectWithSocket() first)");
    const out = { rekey: false, offer: false };
    try { this.#engine.resendEncRekeyRetry(target, retryCount); out.rekey = true; } catch {}
    try { this.#engine.resendOfferOnDecryptionFailure(target, id); out.offer = true; } catch {}
    this.emit("call-recovery", { peerJid: target, callId: id, ...out });
    return out;
  };

  call = async (phoneNumber, opts = {}) => {
    if (!this.#engine || !this.#signaling) throw new Error("Not connected. Call connectWithSocket() first.");
    if (this.#activeCall) throw new Error("A call is already active.");

    const targetNumber = phoneNumber.replace(/\D/g, "");
    const targetPnJid = `${targetNumber}@s.whatsapp.net`;
    const durationMs = opts.durationMs ?? 120_000;
    const audioSource = opts.audioSource ?? "silence";

    const peerLid = await this.#signaling.resolveLid(targetPnJid);
    if (!peerLid) throw new Error(`Could not resolve LID for ${targetPnJid}`);

    for (const jid of [targetPnJid, peerLid]) {
      try { await this.#sock.presenceSubscribe(jid); } catch {}
    }
    await new Promise((r) => setTimeout(r, 750));

    const peerDeviceJids = await this.#signaling.discoverPeerDevices(peerLid);
    const deviceList = peerDeviceJids.length ? peerDeviceJids : [toBareJid(peerLid)];

    await this.#signaling.ensureSessionsForPeers(deviceList);

    await new Promise((r) => setTimeout(r, 500));
    await this.#signaling.issueTcToken(peerLid);
    const tcToken = await this.#signaling.ensureTcToken(peerLid, targetPnJid);

    const callId = ("00" + randomBytes(16).toString("hex").slice(2)).toUpperCase();

    const call = new ActiveCall(callId, this.#engine, durationMs);
    call._audioSource = audioSource;
    this.#activeCall = call;
    // JAP@Fix: release the slot when the call ends (was never cleared → isBusy stuck true)
    call.once("ended", (reason) => {
      if (this.#activeCall === call) this.#activeCall = null;
      this.#stopWatchdog();
      this.emit("call-ended", { callId, reason });
    });
    this.emit("outgoing-call", { callId, to: targetPnJid });
    this.#lastPeer = { peerJid: peerLid, callId };
    this.#startWatchdog();

    this.#engine.startCall({
      peerJid: peerLid,
      peerPn: targetPnJid,
      peerList: deviceList,
      callId,
      isVideo: false,
      isLidCall: true,
      isFromDialer: false,
      extraData: tcToken,
    });

    return call;
  };

  #startWatchdog = () => {
    this.#stopWatchdog();
    const intervalMs = this.#config?.watchdogIntervalMs ?? 5000;
    const maxSilent = this.#config?.watchdogMaxSilent ?? 3;
    if (!intervalMs || !maxSilent) return;
    this.#watchdogMisses = 0;
    this.#lastReceivedPackets = -1;
    this.#watchdogTimer = setInterval(() => {
      if (!this.#activeCall) { this.#stopWatchdog(); return; }
      // JAP@Fix (watchdog on real media traffic): "openConnections > 0" only
      // proves a transport EXISTS, not that media flows — a relay can sit in
      // the open state receiving zero RTP for the entire call (NAT drop,
      // relay-side eviction) and the old check called that healthy. Health is
      // now defined as receivedPackets INCREASING between ticks once the call
      // is active. Before the first packet ever arrives (dialing/ringing) we
      // fall back to the transport-existence check so we don't kill call setup.
      let stats = null;
      try { stats = this.#relay?.getStats?.() ?? null; } catch {}
      const open = stats?.openConnections ?? -1;
      const received = stats?.receivedPackets ?? -1;
      const callIsActive = this.#activeCall.state === CallState.Active;
      const sawFirstPacket = received > 0;
      let healthy;
      if (callIsActive && sawFirstPacket && received >= 0 && this.#lastReceivedPackets >= 0) {
        healthy = received > this.#lastReceivedPackets; // real media moved
      } else {
        healthy = open !== 0; // setup phase: transport existing is enough
      }
      this.#lastReceivedPackets = received;
      if (!healthy) {
        this.#watchdogMisses += 1;
      } else {
        this.#watchdogMisses = 0;
        this.#recoveryAttempts = 0; // healthy again — reset the recovery budget
      }
      if (this.#watchdogMisses >= maxSilent) {
        this.#watchdogMisses = 0;
        // JAP@Fix (recovery): the old loop retried forever with no memory —
        // a dead relay meant rekey+offer spam every N*interval for the whole
        // call, and the caller never learned recovery had failed. Now each
        // call gets a bounded budget (default 3); when it runs out we emit
        // 'call-unrecoverable' and force-end so upper layers can redial.
        const maxRecoveries = this.#config?.watchdogMaxRecoveries ?? 3;
        this.#recoveryAttempts += 1;
        this.emit("call-degraded", {
          callId: this.#activeCall.callId,
          attempt: this.#recoveryAttempts,
          maxRecoveries,
        });
        if (this.#recoveryAttempts > maxRecoveries) {
          const dyingCallId = this.#activeCall.callId;
          this.#recoveryAttempts = 0;
          this.emit("call-unrecoverable", { callId: dyingCallId });
          this.#activeCall._forceEnd("unrecoverable");
          return;
        }
        void this.recoverCall({}).catch(() => {});
      }
    }, intervalMs);
    this.#watchdogTimer.unref?.();
  };

  #stopWatchdog = () => {
    if (this.#watchdogTimer) { clearInterval(this.#watchdogTimer); this.#watchdogTimer = null; }
    this.#watchdogMisses = 0;
    this.#recoveryAttempts = 0;
  };

  disconnect = () => {
    this.#stopWatchdog();
    this.#activeCall?._forceEnd("disconnect");
    this.#activeCall = null;
    this.#relay?.closeAll();
    this.#engine?.destroy();
    this.#engine = null;
    this.#relay = null;
    this.#signaling = null;
    this.#sock = null;
  };

  #handleCallEvent = (eventType, eventData) => {
    if (eventType === 16 && eventData) {
      try {
        const parsed = JSON.parse(eventData);
        const info = parsed.call_info ?? parsed.callInfo ?? {};
        const callState = Number(info.call_state ?? info.callState ?? 0);
        this.#activeCall?._updateState(callState);
      } catch {}
    } else if (eventType === 156 && eventData) {
      try {
        const update = JSON.parse(eventData);
        this.#relay?.updateRelayList(update);
      } catch {}
    } else if (eventType === 2) {
      this.#activeCall?._forceEnd("remote_end");
    }
  };

  #handleAudioCaptureInit = (config) => {
    if (!this.#engine) return;
    this.#captureSampleRate = config.sampleRate || 16000;
    this.#captureChannels = config.channels || 1;
    this.#captureFramesPerChunk = config.framesPerChunk || 320;
    const chunkSamples = this.#captureFramesPerChunk * this.#captureChannels;
    this.#captureChunkBytes = chunkSamples * Float32Array.BYTES_PER_ELEMENT;
    this.#capturePtr = this.#engine.malloc(this.#captureChunkBytes);
  };

  #handleAudioCaptureStart = () => {
    if (!this.#engine || !this.#capturePtr) return;
    const audioSource = this.#activeCall?._audioSource ?? "silence";
    this.#feeder = new AudioFeeder(
      this.#captureSampleRate,
      this.#captureChannels,
      this.#captureFramesPerChunk,
      (chunk) => {
        if (this.#engine && this.#capturePtr) this.#engine.sendAudioData(chunk, this.#capturePtr);
      },
      audioSource,
    );
    this.#feeder.start();
  };

  #handleAudioCaptureStop = () => {
    this.#feeder?.stop();
    this.#feeder = null;
    if (this.#engine && this.#capturePtr) {
      try { this.#engine.free(this.#capturePtr); } catch {}
      this.#capturePtr = 0;
    }
  };
}


/**
 * JAP@Add --- one-liner VoIP setup: creates a VoipClient, binds it to an active
 * Baileys socket, stores it as `sock.voip`, and returns it.
 *
 * ```js
 * import { attachVoip } from '@japofc/baileys'
 * const voip = await attachVoip(sock, {
 *   autoReject: true,                       // decline inbound calls automatically
 *   autoRejectText: 'Bot cannot take calls, please type your message 🙏',
 *   // autoAnswer: true,                    // ...or answer them instead
 *   // autoJoinGroup: true,                 // ...or auto-join group calls
 * })
 * voip.on('incoming-call', ({ from }) => console.log('ringing from', from))
 * const call = await voip.call('62812xxxx', { audioSource: './greeting.mp3' })
 * await call.waitForEnd()
 * ```
 */
export const attachVoip = async (sock, config = {}) => {
  if (!sock?.ws) throw new Error("attachVoip(sock) requires an active Baileys socket.");
  const client = new VoipClient(config);
  await client.connectWithSocket(sock);
  try { sock.voip = client; } catch {}
  return client;
};
