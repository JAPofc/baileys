import { EventEmitter } from "node:events";
import { randomBytes, createHmac } from "node:crypto";

import { WasmEngine } from "./wasm-engine.js";
import { RelayRtcTransport } from "./relay-transport.js";
import { SignalingBridge } from "./signaling.js";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { AudioFeeder } from "./audio-feeder.js";
import { VideoFeeder, i420FrameSize } from "./video-feeder.js"; // JAP@Add (§2.174)
import { CallState } from "./types.js";
import { Readable } from "node:stream";
import { createWavRecorder } from "./call-recorder.js";

export { CallState } from "./types.js";
export { createWavRecorder } from "./call-recorder.js"; // JAP@Add
export { AudioFeeder } from "./audio-feeder.js"; // JAP@Add (§2.85)
export { VideoFeeder, VIDEO_FORMAT_I420, i420FrameSize } from "./video-feeder.js"; // JAP@Add (§2.85)
export { createPortDispatcher } from "./worker-listeners.js"; // JAP@Add (§2.102)

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

/**
 * JAP@Add (§2.182): wrap raw I420 frames in a container. Returns null when no ffmpeg binary
 * is available, which the caller reports rather than buffering frames nobody will write.
 */
const spawnFfmpegRawVideo = (filePath, { width, height }, fps, onError) => {
  let binary = process.env.FFMPEG_PATH || "ffmpeg";
  try {
    const required = createRequire(import.meta.url);
    const staticPath = required("ffmpeg-static");
    if (typeof staticPath === "string" && staticPath) binary = staticPath;
  } catch {}
  try {
    const proc = spawn(binary, [
      "-loglevel", "error",
      "-f", "rawvideo", "-pix_fmt", "yuv420p",
      "-s", `${width}x${height}`, "-r", String(fps),
      "-i", "pipe:0",
      "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
      "-y", filePath
    ], { stdio: ["pipe", "ignore", "pipe"] });
    proc.on("error", (err) => onError?.(err));
    proc.stdin.on("error", () => {}); // EPIPE once ffmpeg exits is expected
    return proc;
  }
  catch (err) {
    onError?.(err);
    return null;
  }
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
  _videoSource = null; // JAP@Add (§2.174): null = no video uplink

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

  /**
   * JAP@Add --- switch what the call is playing WITHOUT hanging up: a file
   * path/URL, `{ data: Buffer, ext }`, a `lavfi:` graph, or `"silence"`.
   * IVR-style flows become one-liners:
   * ```js
   * const call = await voip.call('62812xxxx', { audioSource: './greeting.mp3' })
   * // ...later, mid-call:
   * call.setAudioSource('./menu.mp3')
   * call.setAudioSource('silence') // stop playing, stay on the call
   * ```
   * Returns true when a live decoder was swapped, false when the call is not
   * feeding audio yet (the new source is still remembered for when it does).
   */
  setAudioSource = (source) => {
    this._audioSource = source;
    if (typeof this._switchAudioSource === "function") {
      return this._switchAudioSource(source);
    }
    return false;
  };

  /**
   * JAP@Add (§2.174) --- the video sibling of setAudioSource(). `VideoFeeder` has
   * shipped (and been exported) since §2.85 with nothing wired to it, so a call
   * had no way to send video at all; this is that wire.
   *
   * ```js
   * const call = await voip.call('62812xxxx', { videoSource: 'lavfi:testsrc' })
   * call.setVideoSource('./clip.mp4')   // swap mid-call
   * call.setVideoSource(null)           // stop sending video, stay on the call
   * ```
   * Returns true when a live feeder was swapped, false when the call is not
   * capturing video yet (the source is remembered for when it starts).
   */
  setVideoSource = (source) => {
    this._videoSource = source ?? null;
    if (typeof this._switchVideoSource === "function") {
      return this._switchVideoSource(this._videoSource);
    }
    return false;
  };

  /**
   * Forward one control to the engine. Returns false when this WASM build has
   * no such export, or when the call fails.
   *
   * The optional-chaining form (`engine.setVideoMute?.(x)`) is deliberately NOT
   * used here: on a build without the export it does nothing and evaluates
   * without throwing, so the caller would be told `true` -- "video muted" --
   * while nothing happened. A control that silently does nothing is the exact
   * failure this batch exists to remove.
   */
  #control = (name, ...args) => {
    const fn = this.engine?.[name];
    if (typeof fn !== "function") return false;
    try { fn.apply(this.engine, args); return true; } catch { return false; }
  };

  /** Mute/unmute the outgoing video track without tearing the feeder down. */
  setVideoMuted = (muted) => this.#control("setVideoMute", !!muted);

  /** Pause/resume the video stream (keeps the call and the negotiated track). */
  pauseVideo = () => this.#control("videoStreamPause");
  resumeVideo = () => this.#control("videoStreamResume");

  /** Ask the peer to upgrade this audio call to video. */
  requestVideoUpgrade = () => this.#control("requestVideoUpgrade");

  /** Accept a peer's video (answer to their upgrade request). */
  acceptPeerVideo = (peerJid) => this.#control("acceptPeerVideo", peerJid);

  /** Ask a participant's encoder for a fresh key frame (recovers a frozen tile). */
  requestKeyFrame = (userJid) => this.#control("requestKeyFrame", userJid);

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
  /**
   * Record the call to a .wav.
   *
   * JAP@Add (§2.183): `{ mix: true }` writes a **stereo** file with the remote peer on the
   * left channel and our own uplink on the right, instead of the inbound-only mono file that
   * was the only option before -- a recording of a conversation that contained one side of it.
   * The two directions are interleaved as they arrive; neither is resampled, so this assumes
   * the capture and playback rates match (they do: both come from the same engine config).
   */
  recordToFile = (filePath, opts = {}) => {
    if (this._recorder) throw new Error("Already recording this call.");
    const { mix = false, ...wavOpts } = opts;
    this._recorder = createWavRecorder(filePath, mix ? { ...wavOpts, channels: 2 } : wavOpts);
    const listeners = [];
    if (mix) {
      // interleave: a frame from either side is written with silence in the other channel,
      // which keeps both directions in sync without buffering either one.
      const writeSide = (pcm, leftChannel) => {
        if (!pcm?.length || !this._recorder) return;
        const out = new Float32Array(pcm.length * 2);
        for (let i = 0; i < pcm.length; i++) out[i * 2 + (leftChannel ? 0 : 1)] = pcm[i];
        try { this._recorder.write(out); } catch {}
      };
      const onIn = (pcm) => writeSide(pcm, true);
      const onOut = (pcm) => writeSide(pcm, false);
      this.on("audio", onIn);
      this.on("audio-out", onOut);
      listeners.push(["audio", onIn], ["audio-out", onOut]);
    }
    else {
      const onAudio = (pcm) => { try { this._recorder.write(pcm); } catch {} };
      this.on("audio", onAudio);
      listeners.push(["audio", onAudio]);
    }
    const onEnd = () => { try { this._recorder?.close(); } catch {} this._recorder = null; };
    this.once("ended", onEnd);
    return () => {
      for (const [event, fn] of listeners) this.off(event, fn);
      this.off("ended", onEnd);
      onEnd();
    };
  };

  /**
   * JAP@Add (§2.182) --- write the remote participant's video to a file.
   *
   * Frames arrive as raw I420, so ffmpeg is spawned to contain them; the geometry is taken
   * from the first frame. A mid-call resolution change ends the recording rather than
   * silently writing torn frames -- ffmpeg's rawvideo demuxer has one fixed size, and a
   * half-corrupt file that looks fine until played is worse than a short one.
   * Returns a stop function.
   */
  recordVideoToFile = (filePath, { fps = 30, userJid } = {}) => {
    if (this._videoRecorder) throw new Error("Already recording video for this call.");
    let proc = null;
    let geometry = null;
    let stopped = false;
    const stop = (reason) => {
      if (stopped) return;
      stopped = true;
      this.off("video", onFrame);
      this.off("ended", onEnd);
      this._videoRecorder = null;
      try { proc?.stdin?.end(); } catch {}
      this.emit("video-recording-stopped", { filePath, reason });
    };
    const onFrame = (frame) => {
      if (stopped || !frame?.frame?.length) return;
      if (userJid && frame.userJid !== userJid) return;
      if (!geometry) {
        geometry = { width: frame.width, height: frame.height };
        proc = spawnFfmpegRawVideo(filePath, geometry, fps, (err) => { this.emit("video-recording-error", err); stop("ffmpeg_error"); });
        if (!proc) { stop("ffmpeg_unavailable"); return; }
      }
      else if (frame.width !== geometry.width || frame.height !== geometry.height) {
        stop("geometry_changed");
        return;
      }
      try { proc.stdin.write(Buffer.from(frame.frame)); } catch {}
    };
    const onEnd = () => stop("call_ended");
    this._videoRecorder = { stop };
    this.on("video", onFrame);
    this.once("ended", onEnd);
    return stop;
  };

  /**
   * JAP@Add (§2.82) --- the inbound (remote peer) audio as a Node stream, so it can be piped
   * straight into ffmpeg, a transcription service, an upload, or a file:
   *
   * ```js
   * const pcm = call.audioStream({ encoding: 'pcm16' })      // 16-bit LE, 16 kHz mono
   * pcm.pipe(createWriteStream('./peer.raw'))
   * // or keep the raw floats: call.audioStream()            // objectMode Float32Array
   * ```
   *
   * Frames are independent copies (see BUGREPORT 2.82), so holding on to them is safe.
   * The stream ends by itself when the call ends; `stream.stop()` detaches early.
   */
  audioStream = ({ encoding = 'float32', highWaterMark } = {}) => {
    if (encoding !== 'float32' && encoding !== 'pcm16') {
      throw new TypeError(`audioStream: unsupported encoding "${encoding}" (use 'float32' or 'pcm16')`);
    }
    const objectMode = encoding === 'float32';
    const stream = new Readable({
      objectMode,
      highWaterMark: highWaterMark ?? (objectMode ? 64 : 1 << 16),
      read: () => {}
    });
    const onAudio = (pcm) => {
      if (!pcm?.length) return;
      if (objectMode) {
        stream.push(pcm);
        return;
      }
      const out = Buffer.allocUnsafe(pcm.length * 2);
      for (let i = 0; i < pcm.length; i++) {
        const s = Math.max(-1, Math.min(1, pcm[i]));
        out.writeInt16LE(Math.round(s * (s < 0 ? 0x8000 : 0x7fff)), i * 2);
      }
      stream.push(out);
    };
    const detach = () => {
      this.off("audio", onAudio);
      this.off("ended", onEnded);
    };
    const onEnded = () => { detach(); stream.push(null); };
    this.on("audio", onAudio);
    this.once("ended", onEnded);
    stream.stop = () => { detach(); stream.push(null); };
    return stream;
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
  /** JAP@Add (§2.182): one decoded frame from a remote participant. */
  _emitVideo = (frame) => { this.emit("video", frame); };
  /** JAP@Add (§2.183): one chunk of the audio WE are sending. */
  _emitUplinkAudio = (pcm) => { this.emit("audio-out", pcm); };

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
  #videoFeeder = null; // JAP@Add (§2.174)
  #videoPtr = 0;
  #videoPtrBytes = 0;
  #videoGeometry = null;

  constructor(config = {}) {
    super(); // JAP@Add --- VoipClient now emits 'incoming-call' / 'outgoing-call' / 'call-ended'
    this.#config = config;
    // JAP@Add (§2.175): an injected engine is usable immediately. It used to be
    // picked up only inside connectWithSocket(), so every engine-level control
    // reported "engine not connected" on a client that was handed one.
    // connectWithSocket() still owns initialization; this only publishes the
    // reference it would have set anyway.
    this.#engine = config.engine ?? null;
  }

  connectWithSocket = async (existingSock) => {
    this.#sock = existingSock;
    await this.#initVoipStack();
  };

  #initVoipStack = async () => {
    // JAP@Fix (§2.80): a reconnect used to leave the previous bridge wired to the shared
    // auth state forever -- detach it before building the new one.
    this.#signaling?.dispose?.();
    this.#signaling = new SignalingBridge({
      sock: this.#sock,
      // JAP@Add --- surface inbound offers as 'incoming-call' events
      onIncomingCall: (info) => this.#handleIncomingCall(info),
    });
    await this.#signaling.init();

    this.#relay = this.#config.relay ?? new RelayRtcTransport({
      onTransportMessage: (data, ip, port) => this.#engine?.handleOnTransportMessage(data, ip, port),
      onIceRtt: (rttMs, ip, port) => this.#engine?.updateIceRtt(rttMs, ip, port),
      // JAP@Fix (§2.79): relay connect failures used to surface as unhandled rejections
      onTransportError: (err, relay) => this.#config?.logger?.warn?.({ err, relay: relay?.id }, 'relay connection failed'),
      logger: this.#config?.logger,
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
        onVideoCaptureStart: (config) => this.#handleVideoCaptureStart(config), // JAP@Add (§2.174)
        onVideoCaptureStop: () => this.#handleVideoCaptureStop(),
        onAudioPlaybackData: (audioData) => this.#activeCall?._emitAudio(audioData),
        onVideoFrame: (frame) => this.#activeCall?._emitVideo(frame), // JAP@Add (§2.182)
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
  /**
   * JAP@Add --- swap the active call's uplink audio source mid-call (see
   * ActiveCall.setAudioSource for the accepted source shapes). Throws when no
   * call is active. Returns true when a live ffmpeg decoder was swapped,
   * false when audio capture has not started yet (the source is stored and
   * used as soon as the engine opens the uplink).
   */
  setAudioSource = (source) => {
    if (!this.#activeCall) throw new Error("setAudioSource: no active call");
    this.#activeCall._audioSource = source;
    if (this.#feeder) return this.#feeder.swapSource(source);
    return false;
  };

  /**
   * JAP@Add (§2.174) --- swap the active call's uplink VIDEO source mid-call, or
   * pass null to stop sending video. Throws when no call is active. Returns true
   * when a live feeder was swapped, false when video capture has not started yet
   * (the source is stored and used as soon as the engine opens the video uplink).
   */
  setVideoSource = (source) => {
    if (!this.#activeCall) throw new Error("setVideoSource: no active call");
    this.#activeCall._videoSource = source ?? null;
    if (!this.#videoFeeder) return false;
    if (source == null) {
      // stopping video is not "swap to nothing" -- tear the feeder down so
      // ffmpeg exits instead of decoding frames nobody sends
      this.#handleVideoCaptureStop();
      return true;
    }
    return this.#videoFeeder.swapSource(source);
  };

  /** JAP@Add (§2.175) --- waiting-room controls for group calls / call links. */
  /** JAP@Add (§2.184) --- choose which participants to receive, and at what video quality. */
  setParticipantSubscriptions = (participantJids = [], videoQualities = []) =>
    this.#engineCall("updateParticipantsRxSubscription", participantJids, videoQualities);
  admitToCall = (peerJid) => this.#engineCall("waitingRoomAdmit", peerJid);
  denyFromCall = (peerJid) => this.#engineCall("waitingRoomDeny", peerJid);
  admitAllToCall = () => this.#engineCall("waitingRoomAdmitAll");
  setWaitingRoomEnabled = (enabled) => this.#engineCall("waitingRoomToggleActiveCall", !!enabled);
  /**
   * JAP@Add (§2.210) --- start the local video preview for a call.
   *
   * The engine has exposed `startVideoPreview` all along and nothing on this class ever
   * called it, so the only way to reach it was the unsupported `engineCommand()` escape
   * hatch. Both arguments default to the active call and the logged-in identity, because
   * in practice a caller previewing their own camera already knows neither by hand.
   *
   * @param {string} [callId] defaults to the active call
   * @param {string} [selfJid] defaults to this account's own JID
   */
  startVideoPreview = (callId, selfJid) => {
    const resolvedCallId = callId ?? this.#activeCall?.callId;
    if (!resolvedCallId) {
      throw new Error("startVideoPreview: no active call, and no callId was given");
    }
    const resolvedSelfJid = selfJid
      ?? this.#sock?.authState?.creds?.me?.id
      ?? this.#sock?.authState?.creds?.me?.lid;
    if (!resolvedSelfJid) {
      throw new Error("startVideoPreview: not connected, and no selfJid was given");
    }
    return this.#engineCall("startVideoPreview", resolvedCallId, resolvedSelfJid);
  };
  /** Start/stop sharing a screen in the active call. */
  startScreenShare = () => this.#engineCall("startScreenShare");
  stopScreenShare = () => this.#engineCall("stopScreenShare");
  /** Wave at a participant (the social ping WhatsApp shows in group calls). */
  sendWave = (opts) => this.#engineCall("sendWave", opts);
  /** Tell the stack which tile layout is on screen, so it can allocate bitrate. */
  notifyViewChange = (viewMode, pinnedPeerJid = "") => this.#engineCall("notifyUiViewChange", viewMode, pinnedPeerJid);

  #engineCall = (name, ...args) => {
    if (!this.#engine) throw new Error(`${name}: engine not connected (connectWithSocket() first)`);
    if (typeof this.#engine[name] !== "function") throw new Error(`${name}: not supported by this engine`);
    return this.#engine[name](...args);
  };

  /**
   * JAP@Add (§2.175) --- escape hatch to any WASM export by name.
   *
   * Explicitly NOT covered by semver and not validated: the named methods above
   * are the supported surface. This exists so that needing one unwrapped command
   * does not mean forking the package. If you find yourself using it often, open
   * an issue and it should become a real method.
   */
  engineCommand = (name, args = []) => {
    if (!this.#engine) throw new Error("engineCommand: engine not connected (connectWithSocket() first)");
    return this.#engine.engineCommand(name, args);
  };

  /**
   * JAP@Add (§2.176) --- call quality, parsed.
   *
   * The WASM stack has always exposed `getShortStatisticString()` /
   * `getDebugStatisticString()` and nothing read them. The format is a build
   * detail and WhatsApp changes it, so the parser is deliberately tolerant: it
   * pulls every `key=value` / `key:value` pair it can find, coerces numbers, and
   * always returns the untouched string as `raw` so a caller is never blocked by
   * a shape we failed to anticipate.
   */
  getCallQuality = ({ verbose = false } = {}) => {
    if (!this.#engine) throw new Error("getCallQuality: engine not connected (connectWithSocket() first)");
    const raw = verbose
      ? (this.#engine.getDebugStatisticString?.() ?? "")
      : (this.#engine.getShortStatisticString?.() ?? "");
    return { callId: this.#activeCall?.callId ?? null, raw, metrics: parseStatString(raw) };
  };

  /**
   * JAP@Add (§2.176) --- emit a 'call-stats' event every `intervalMs` while a call
   * is up. Returns a stop function; stopping is also automatic when the call
   * ends, so a caller cannot leak the timer by forgetting (§2.54 / §2.160).
   */
  monitorCallQuality = ({ intervalMs = 5000, verbose = false } = {}) => {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      throw new RangeError("monitorCallQuality: intervalMs must be a positive number");
    }
    const call = this.#activeCall;
    if (!call) throw new Error("monitorCallQuality: no active call");
    let stopped = false;
    const timer = setInterval(() => {
      if (stopped || this.#activeCall !== call) return;
      try { this.emit("call-stats", this.getCallQuality({ verbose })); } catch {}
    }, intervalMs);
    if (typeof timer.unref === "function") timer.unref();
    const stop = () => {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
    };
    call.once("ended", stop);
    return stop;
  };

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
  answerCall = async (callId, { audioSource = "silence", videoSource = null, durationMs = 120_000, isMicEnabled = true } = {}) => {
    if (!this.#engine || !this.#signaling) throw new Error("Not connected. Call connectWithSocket() first.");
    if (this.#activeCall) throw new Error("A call is already active.");
    const offer = this.#signaling.takePendingOffer(callId);
    if (!offer) throw new Error(`No pending inbound offer for ${callId} (expired, answered, or unknown)`);
    const ttl = this.#config?.offerTtlMs ?? 45_000;
    if (Date.now() - offer.receivedAt > ttl) throw new Error(`Inbound offer ${callId} expired`);
    if (offer.isGroupCall) throw new Error(`Offer ${callId} is a group call — use joinGroupCall() instead`);
    const call = new ActiveCall(callId, this.#engine, durationMs, { direction: "inbound", from: offer.from });
    call._audioSource = audioSource;
    call._videoSource = videoSource ?? null; // JAP@Add (§2.174)
    this.#activeCall = call;
    call._switchAudioSource = (source) => this.setAudioSource(source); // JAP@Add --- mid-call source swap
    call._switchVideoSource = (source) => this.setVideoSource(source); // JAP@Add (§2.174)
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
  joinGroupCall = async (callId, { audioSource = "silence", videoSource = null, durationMs = 120_000, hasVideo = !!videoSource, joinAndAccept = true, chatName = "" } = {}) => {
    if (!this.#engine || !this.#signaling) throw new Error("Not connected. Call connectWithSocket() first.");
    if (this.#activeCall) throw new Error("A call is already active.");
    const offer = this.#signaling.takePendingOffer(callId);
    if (!offer) throw new Error(`No pending group offer for ${callId} (expired, joined, or unknown)`);
    const ttl = this.#config?.offerTtlMs ?? 45_000;
    if (Date.now() - offer.receivedAt > ttl) throw new Error(`Group offer ${callId} expired`);
    const call = new ActiveCall(callId, this.#engine, durationMs, { direction: "group-inbound", from: offer.from, groupJid: offer.groupJid });
    call._audioSource = audioSource;
    call._videoSource = videoSource ?? null; // JAP@Add (§2.174)
    this.#activeCall = call;
    call._switchAudioSource = (source) => this.setAudioSource(source); // JAP@Add --- mid-call source swap
    call._switchVideoSource = (source) => this.setVideoSource(source); // JAP@Add (§2.174)
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
  startGroupCall = async (groupJid, participants = [], { audioSource = "silence", videoSource = null, durationMs = 120_000, useVideo = !!videoSource, chatName = "" } = {}) => {
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
    call._videoSource = videoSource ?? null; // JAP@Add (§2.174)
    this.#activeCall = call;
    call._switchAudioSource = (source) => this.setAudioSource(source); // JAP@Add --- mid-call source swap
    call._switchVideoSource = (source) => this.setVideoSource(source); // JAP@Add (§2.174)
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
    call._videoSource = overrides.videoSource ?? null; // JAP@Add (§2.174)
    this.#activeCall = call;
    call._switchAudioSource = (source) => this.setAudioSource(source); // JAP@Add --- mid-call source swap
    call._switchVideoSource = (source) => this.setVideoSource(source); // JAP@Add (§2.174)
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
  /**
   * JAP@Add (§2.180) --- create a call link.
   *
   * `sock.createCallLink()` has existed in lib/Socket/chats.js all along, while the VoIP
   * client only offered previewCallLink()/joinCallLink() -- so the one piece needed to
   * *produce* a link lived on the other object and nobody connected the two. Returns the
   * token plus the https URL a user can actually be sent.
   */
  createCallLink = async ({ video = false, startTime, timeoutMs } = {}) => {
    const sock = this.#sock;
    if (!sock) throw new Error("createCallLink: not connected (connectWithSocket() first)");
    if (typeof sock.createCallLink !== "function") {
      throw new Error("createCallLink: this socket build has no createCallLink()");
    }
    const token = await sock.createCallLink(video ? "video" : "audio", startTime ? { startTime } : undefined, timeoutMs);
    if (!token) throw new Error("createCallLink: the server returned no token");
    return { token, url: `https://call.whatsapp.com/${video ? "video" : "voice"}/${token}` };
  };

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
    const videoSource = opts.videoSource ?? null; // JAP@Add (§2.174)

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
    call._videoSource = videoSource ?? null; // JAP@Add (§2.174)
    this.#activeCall = call;
    call._switchAudioSource = (source) => this.setAudioSource(source); // JAP@Add --- mid-call source swap
    call._switchVideoSource = (source) => this.setVideoSource(source); // JAP@Add (§2.174)
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
    this.#signaling?.dispose?.();
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
        // JAP@Add (§2.183): the uplink was write-only -- nothing could observe what we sent,
        // so a recording could only ever contain half of the conversation.
        this.#activeCall?._emitUplinkAudio(chunk);
      },
      audioSource,
    );
    this.#feeder.start();
  };

  // ─── JAP@Add (§2.174): video capture, mirroring the audio path above ────
  #handleVideoCaptureStart = ({ width, height, maxFps } = {}) => {
    const call = this.#activeCall;
    if (!this.#engine || !call) return;
    const source = call._videoSource;
    if (!source) return; // the peer wants video; this call was not asked to send any
    // The engine dictates the geometry. I420 needs even dimensions, and
    // i420FrameSize() throws on anything else -- better here, once, than as a
    // torn frame 30 times a second.
    const w = Math.trunc(Number(width) || 0) & ~1;
    const h = Math.trunc(Number(height) || 0) & ~1;
    const fps = Math.max(1, Math.trunc(Number(maxFps) || 0) || 30);
    if (w <= 0 || h <= 0) {
      this.#config.logger?.warn?.({ width, height }, "voip: video capture started with no usable geometry");
      return;
    }
    const bytes = i420FrameSize(w, h);
    this.#videoPtr = this.#engine.malloc(bytes);
    this.#videoPtrBytes = bytes;
    this.#videoGeometry = { width: w, height: h, fps };
    this.#videoFeeder = new VideoFeeder(w, h, fps, (frame) => {
      if (!this.#engine || !this.#videoPtr) return;
      this.#engine.sendVideoFrame(frame, this.#videoPtr, this.#videoGeometry);
    }, source);
    this.#videoFeeder.start();
    this.emit("video-capture-start", { width: w, height: h, fps, source });
  };

  #handleVideoCaptureStop = () => {
    this.#videoFeeder?.stop();
    this.#videoFeeder = null;
    this.#videoGeometry = null;
    if (this.#engine && this.#videoPtr) {
      try { this.#engine.free(this.#videoPtr); } catch {}
    }
    this.#videoPtr = 0;
    this.#videoPtrBytes = 0;
    this.emit("video-capture-stop", {});
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
/**
 * JAP@Add (§2.85) --- construct a VoipClient without attaching it yet.
 *
 * `attachVoip(sock)` is the one-liner; `makeVoipClient(config)` is for when you want the
 * client first (to wire listeners, inject an engine, keep it across reconnects) and connect
 * later with `client.connectWithSocket(sock)`.
 *
 * ```js
 * const voip = makeVoipClient({ autoAccept: false })
 * voip.on('call', c => c.accept())
 * await voip.connectWithSocket(sock)
 * ```
 */
/**
 * JAP@Add (§2.176) --- tolerant `key=value` scraper for the engine stat strings.
 * Unknown keys are kept as-is; nothing is dropped for not matching a schema.
 */
const parseStatString = (raw) => {
  const metrics = {};
  if (typeof raw !== "string" || !raw) return metrics;
  for (const [, key, value] of raw.matchAll(/([A-Za-z][\w.\-]*)\s*[=:]\s*("[^"]*"|[^\s,;|]+)/g)) {
    const cleaned = value.replace(/^"|"$/g, "");
    const numeric = Number(cleaned);
    metrics[key] = cleaned !== "" && Number.isFinite(numeric) ? numeric : cleaned;
  }
  return metrics;
};

export const makeVoipClient = (config = {}) => new VoipClient(config);

/**
 * JAP@Add (§2.85) --- pipe a call's inbound audio into a speech-recognition callback.
 *
 * Any async recognizer works: it receives 16-bit LE PCM chunks of `chunkMs` milliseconds
 * (default 2 s) and returns text. Returns a handle with `stop()` and the running transcript.
 *
 * ```js
 * const rec = bindVoiceRecognition(call, async pcm => (await transcribeAudio(pcm)).text, {
 *     chunkMs: 3000, onText: t => console.log('heard:', t)
 * })
 * ```
 */
export const bindVoiceRecognition = (call, recognize, { chunkMs = 2000, sampleRate = 16000, onText, onError } = {}) => {
  if (typeof call?.audioStream !== "function") throw new TypeError("bindVoiceRecognition(call, …) requires an ActiveCall");
  if (typeof recognize !== "function") throw new TypeError("bindVoiceRecognition(call, recognize): recognize must be a function");
  if (!Number.isFinite(chunkMs) || chunkMs < 100) throw new TypeError(`bindVoiceRecognition: chunkMs must be >= 100, got ${chunkMs}`);

  const bytesPerChunk = Math.floor((sampleRate * 2 * chunkMs) / 1000);
  const stream = call.audioStream({ encoding: "pcm16" });
  const transcript = [];
  let buffered = [];
  let bufferedBytes = 0;
  let stopped = false;
  let inFlight = Promise.resolve();

  const flush = (final = false) => {
    if (!bufferedBytes || (!final && bufferedBytes < bytesPerChunk)) return;
    const pcm = Buffer.concat(buffered, bufferedBytes);
    buffered = [];
    bufferedBytes = 0;
    inFlight = inFlight
      .then(() => recognize(pcm, { sampleRate, channels: 1, encoding: "pcm16" }))
      .then(result => {
        const text = typeof result === "string" ? result : result?.text;
        if (text) {
          transcript.push(text);
          onText?.(text, { final });
        }
      })
      .catch(err => { onError ? onError(err) : call.emit?.("recognition-error", err); });
  };

  let ended = false;
  const endPromise = new Promise(resolve => {
    stream.once("end", () => { ended = true; resolve(); });
    stream.once("close", () => { ended = true; resolve(); });
  });

  stream.on("data", chunk => {
    if (stopped) return;
    buffered.push(chunk);
    bufferedBytes += chunk.length;
    flush(false);
  });
  stream.on("end", () => { flush(true); });

  return {
    get transcript() { return transcript.join(" "); },
    get segments() { return [...transcript]; },
    stop: async () => {
      if (stopped) return transcript.join(" ");
      // let whatever the stream already buffered land before we close it, otherwise a
      // stop() right after the last frame would throw that audio away
      if (!ended) {
        await Promise.race([endPromise, new Promise(resolve => setImmediate(resolve))]);
      }
      stopped = true;
      stream.stop();
      flush(true);
      await inFlight;
      return transcript.join(" ");
    }
  };
};

export const attachVoip = async (sock, config = {}) => {
  if (!sock?.ws) throw new Error("attachVoip(sock) requires an active Baileys socket.");
  const client = new VoipClient(config);
  await client.connectWithSocket(sock);
  try { sock.voip = client; } catch {}
  return client;
};
