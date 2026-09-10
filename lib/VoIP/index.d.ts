import { EventEmitter } from 'events';
export { CallState } from './types.js';
export { createWavRecorder } from './call-recorder.js';
export type { WavRecorder, WavRecorderOptions } from './call-recorder.js';

export interface VoipClientConfig {
    /** Pre-built WASM engine (tests + custom stacks). */
    engine?: any;
    /** Pre-built relay transport. */
    relay?: any;
    /** Path to the VOIP wasm resources directory. */
    resourcesPath?: string;
    [key: string]: any;
}

export interface AnswerCallOptions {
    audioSource?: string;
    durationMs?: number;
    isMicEnabled?: boolean;
}

export interface JoinGroupCallOptions {
    audioSource?: string;
    durationMs?: number;
    hasVideo?: boolean;
    joinAndAccept?: boolean;
    chatName?: string;
}

export interface StartGroupCallOptions {
    audioSource?: string;
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
    recordToFile(filePath: string, opts?: Record<string, any>): any;
    waitForEnd(): Promise<any>;
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
    getPendingCalls(): any[];
    rejectCall(callId: string, callFrom: string, options?: { text?: string }): Promise<any>;
    answerCall(callId: string, options?: AnswerCallOptions): Promise<any>;
    joinGroupCall(callId: string, options?: JoinGroupCallOptions): Promise<any>;
    startGroupCall(groupJid: string, participants?: string[], options?: StartGroupCallOptions): Promise<any>;
    rejoinGroupCall(overrides?: Record<string, any>): Promise<any>;
    inviteToGroupCall(phoneNumber: string, deviceJids?: string[]): Promise<any>;
    removeGroupParticipant(peerJid: string): Promise<any>;
    previewCallLink(token: string, opts?: Record<string, any>): any;
    joinCallLink(): any;
    getStats(): any;
    recoverCall(options?: RecoverCallOptions): Promise<any>;
    call(phoneNumber: string, opts?: Record<string, any>): Promise<any>;
    disconnect(): any;
}

/** Instantiate VoipClient on an active socket (also sets `sock.voip`). */
export declare const attachVoip: (sock: any, config?: VoipClientConfig) => Promise<VoipClient>;
