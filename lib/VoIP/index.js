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
  #ended = false;
  _audioSource = "silence";

  constructor(callId, engine, durationMs) {
    super();
    this.callId = callId;
    this.startedAt = Date.now(); // JAP@Add
    this._recorder = null; // JAP@Add
    this.engine = engine;
    this.#endPromise = new Promise((res) => { this.#endResolver = res; });
    if (durationMs > 0) {
      this.#endTimer = setTimeout(() => this.end(), durationMs);
    }
  }

  get state() { return this.#state; }

  end = () => {
    if (this.#ended) return;
    this.#ended = true;
    if (this.#endTimer) { clearTimeout(this.#endTimer); this.#endTimer = null; }
    try { this.engine.endCall(0, true); } catch {}
  };

  mute = (muted) => {
    try { this.engine.setMute(muted); } catch {}
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

    this.#relay = new RelayRtcTransport({
      onTransportMessage: (data, ip, port) => this.#engine?.handleOnTransportMessage(data, ip, port),
      onIceRtt: (rttMs, ip, port) => this.#engine?.updateIceRtt(rttMs, ip, port),
    });

    this.#engine = new WasmEngine({
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
  };

  /** JAP@Add --- true while a call object exists (dialing, ringing or active). */
  isBusy = () => !!this.#activeCall;

  /** JAP@Add --- the current ActiveCall, or null when idle. */
  getActiveCall = () => this.#activeCall;

  #handleIncomingCall = (info) => {
    this.emit("incoming-call", { ...info, busy: this.isBusy() });
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
      this.emit("call-ended", { callId, reason });
    });
    this.emit("outgoing-call", { callId, to: targetPnJid });

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

  disconnect = () => {
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
 * import { attachVoip } from '@j.ap/baileys'
 * const voip = await attachVoip(sock)
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
