import { EventEmitter } from 'events';
export { CallState } from './types.js';
export { createWavRecorder } from './call-recorder.js';
export { AudioFeeder } from './audio-feeder.js';
export { VideoFeeder, VIDEO_FORMAT_I420, i420FrameSize } from './video-feeder.js';
export { createPortDispatcher } from './worker-listeners.js';
export type { PortDispatcher } from './worker-listeners.js';

/** Construct a VoipClient without attaching it to a socket yet. */
export declare function makeVoipClient(config?: Record<string, any>): VoipClient;

export interface VoiceRecognitionHandle {
    readonly transcript: string;
    readonly segments: string[];
    stop: () => Promise<string>;
}
/** Pipe a call's inbound audio into a speech-recognition callback. */
export declare function bindVoiceRecognition(
    call: ActiveCall,
    recognize: (pcm: Buffer, info: { sampleRate: number; channels: number; encoding: 'pcm16' }) => Promise<string | { text?: string }> | string | { text?: string },
    opts?: { chunkMs?: number; sampleRate?: number; onText?: (text: string, info: { final: boolean }) => void; onError?: (err: unknown) => void }
): VoiceRecognitionHandle;
export type { WavRecorder, WavRecorderOptions } from './call-recorder.js';

export interface VoipClientConfig {
    /** Pre-built WASM engine (tests + custom stacks). */
    engine?: any;
    /** Pre-built relay transport. */
    relay?: any;
    /** Path to the VOIP wasm resources directory. */
    resourcesPath?: string;
    /** Logger used for relay/transport warnings (e.g. a failed relay connection). */
    logger?: { warn?: (obj: any, msg?: string) => void; [key: string]: any };
    /** Relay-health watchdog poll interval in ms (default 5000; 0 disables). */
    watchdogIntervalMs?: number;
    /** Consecutive empty-relay polls before recovery kicks in (default 3). */
    watchdogMaxSilent?: number;
    /**
     * Recovery budget per call (default 3): after this many consecutive failed
     * recoveries the client emits 'call-unrecoverable' and force-ends the call
     * instead of retrying forever.
     */
    watchdogMaxRecoveries?: number;
    [key: string]: any;
}

export interface AnswerCallOptions {
    audioSource?: string;
    /** JAP@Add (§2.174) — uplink video source; omit for an audio-only call. */
    videoSource?: string | { data: Buffer; ext?: string } | null;
    durationMs?: number;
    isMicEnabled?: boolean;
}

export interface JoinGroupCallOptions {
    audioSource?: string;
    /** JAP@Add (§2.174) — uplink video source; setting it defaults `hasVideo` to true. */
    videoSource?: string | { data: Buffer; ext?: string } | null;
    durationMs?: number;
    hasVideo?: boolean;
    joinAndAccept?: boolean;
    chatName?: string;
}

export interface StartGroupCallOptions {
    audioSource?: string;
    /** JAP@Add (§2.174) — uplink video source; setting it defaults `useVideo` to true. */
    videoSource?: string | { data: Buffer; ext?: string } | null;
    durationMs?: number;
    useVideo?: boolean;
    chatName?: string;
}

export interface RecoverCallOptions {
    peerJid?: string;
    callId?: string;
    retryCount?: number;
}

/** A live (or recently ended) voice/video call. Emits 'audio' with PCM chunks. */
export class ActiveCall extends EventEmitter {
    constructor(callId: string, engine: any, durationMs: number, meta?: Record<string, any>);
    readonly state: any;
    startedAt: number;
    end(): any;
    mute(muted: boolean): any;
    invite(pnUserJid: string, lidUserJid?: string, deviceJids?: string[]): any;
    removeParticipant(peerJid: string): any;
    requestMute(peerJid: string): any;
    react(reaction: string): any;
    setHandRaised(raised: boolean): any;
    getDurationMs(): number;
    /**
     * Record the call to a .wav. `mix: true` (§2.183) writes stereo — remote peer left, your
     * own uplink right — instead of inbound-only mono. Returns a stop function.
     */
    recordToFile(filePath: string, opts?: { sampleRate?: number; channels?: number; mix?: boolean }): () => void;
    /**
     * JAP@Add (§2.182) — write the remote participant's video to an mp4 via ffmpeg.
     * Returns a stop function. Emits 'video-recording-stopped' / 'video-recording-error'.
     */
    recordVideoToFile(filePath: string, opts?: { fps?: number; userJid?: string }): (reason?: string) => void;
    /**
     * Inbound (remote peer) audio as a Node stream: object-mode `Float32Array` frames by
     * default, or raw 16-bit little-endian PCM with `{ encoding: 'pcm16' }`. Ends with the
     * call; `stop()` detaches early.
     */
    audioStream(opts?: {
        encoding?: 'float32' | 'pcm16';
        highWaterMark?: number;
    }): import('node:stream').Readable & { stop: () => void };
    /**
     * Swap what the call is playing WITHOUT hanging up: a file path/URL,
     * `{ data: Buffer, ext }`, a `lavfi:` graph, or `"silence"`. Returns true
     * when a live decoder was swapped, false when audio capture has not
     * started yet (the source is remembered for when it does).
     */
    setAudioSource(source: string | { data: Buffer; ext?: string }): boolean;
    /**
     * JAP@Add (§2.174) — the video sibling of `setAudioSource`. Pass null to stop
     * sending video without leaving the call. Returns true when a live feeder was
     * swapped, false when video capture has not started yet (the source is kept).
     */
    setVideoSource(source: string | { data: Buffer; ext?: string } | null): boolean;
    /** Mute/unmute the outgoing video track. False when the WASM build lacks the export. */
    setVideoMuted(muted: boolean): boolean;
    pauseVideo(): boolean;
    resumeVideo(): boolean;
    /** Ask the peer to upgrade this audio call to video. */
    requestVideoUpgrade(): boolean;
    acceptPeerVideo(peerJid: string): boolean;
    /** Request a fresh key frame from a participant's encoder (recovers a frozen tile). */
    requestKeyFrame(userJid: string): boolean;
    waitForEnd(): Promise<any>;
}

/** Parsed output of `VoipClient.getCallQuality()`. */
export interface CallQuality {
    callId: string | null;
    /** The engine's stat string, untouched — always present even when parsing finds nothing. */
    raw: string;
    /** Every `key=value` / `key:value` pair found; numeric values coerced to numbers. */
    metrics: Record<string, string | number>;
}

/**
 * Audio-only WhatsApp voice-call client (WASM call stack + WebRTC relay).
 * Emits 'incoming-call' / 'outgoing-call' / 'call-ended'.
 */
export class VoipClient extends EventEmitter {
    constructor(config?: VoipClientConfig);
    connectWithSocket(existingSock: any): Promise<void>;
    isBusy(): boolean;
    getActiveCall(): ActiveCall | null;
    /** Swap the active call's uplink audio source mid-call. Throws when no call is active. */
    setAudioSource(source: string | { data: Buffer; ext?: string }): boolean;
    getPendingCalls(): any[];
    rejectCall(callId: string, callFrom: string, options?: { text?: string }): Promise<any>;
    answerCall(callId: string, options?: AnswerCallOptions): Promise<any>;
    joinGroupCall(callId: string, options?: JoinGroupCallOptions): Promise<any>;
    startGroupCall(groupJid: string, participants?: string[], options?: StartGroupCallOptions): Promise<any>;
    rejoinGroupCall(overrides?: Record<string, any>): Promise<any>;
    inviteToGroupCall(phoneNumber: string, deviceJids?: string[]): Promise<any>;
    removeGroupParticipant(peerJid: string): Promise<any>;
    /** JAP@Add (§2.180) — create a call link; returns the token and the shareable https url. */
    createCallLink(opts?: { video?: boolean; startTime?: number; timeoutMs?: number }): Promise<{ token: string; url: string }>;
    previewCallLink(token: string, opts?: Record<string, any>): any;
    joinCallLink(): any;
    getStats(): any;
    recoverCall(options?: RecoverCallOptions): Promise<any>;
    /** JAP@Add (§2.174) — swap the active call's uplink video source, or null to stop sending video. */
    setVideoSource(source: string | { data: Buffer; ext?: string } | null): boolean;
    /** JAP@Add (§2.175) — waiting-room controls for group calls and call links. */
    /** JAP@Add (§2.184) — which participants to receive, and at what video quality. */
    setParticipantSubscriptions(participantJids: string[], videoQualities?: Array<string | number>): any;
    admitToCall(peerJid: string): any;
    denyFromCall(peerJid: string): any;
    admitAllToCall(): any;
    setWaitingRoomEnabled(enabled: boolean): any;
    /**
     * Start the local video preview. `callId` defaults to the active call and `selfJid` to
     * this account's own JID; both throw if they cannot be resolved.
     */
    startVideoPreview(callId?: string, selfJid?: string): any;
    startScreenShare(): any;
    stopScreenShare(): any;
    sendWave(opts?: { participantPnUserJid?: string; participantLidUserJid?: string; deviceJids?: string[] }): any;
    /** Tell the stack which tile layout is on screen so it can allocate bitrate. */
    notifyViewChange(viewMode: number, pinnedPeerJid?: string): any;
    /**
     * JAP@Add (§2.175) — call any WASM export by name.
     * NOT covered by semver and not validated; prefer the named methods above.
     */
    engineCommand(name: string, args?: unknown[]): any;
    /** JAP@Add (§2.176) — current call quality, parsed. */
    getCallQuality(opts?: { verbose?: boolean }): CallQuality;
    /**
     * JAP@Add (§2.176) — emit 'call-stats' every `intervalMs` while the call is up.
     * Returns a stop function; the monitor also stops itself when the call ends.
     */
    monitorCallQuality(opts?: { intervalMs?: number; verbose?: boolean }): () => void;
    call(phoneNumber: string, opts?: Record<string, any>): Promise<any>;
    disconnect(): any;
}

/** Instantiate VoipClient on an active socket (also sets `sock.voip`). */
export declare const attachVoip: (sock: any, config?: VoipClientConfig) => Promise<VoipClient>;
