/** VoIP tools — pure audio/call math (PCM s16le assumed unless noted). */
export interface PcmFormat {
	sampleRate?: number;
	bytesPerSample?: number;
	channels?: number;
}
type Pcm = Buffer | Uint8Array | Int16Array | number[];
/** Duration (ms) of a PCM buffer of `byteLength` bytes. */
export declare const pcmDurationMs: (byteLength: number, opts?: PcmFormat) => number;
/** Byte length needed to hold `durationMs` of PCM audio. */
export declare const pcmByteLength: (durationMs: number, opts?: PcmFormat) => number;
/** RMS loudness of a PCM frame, normalized 0..1. */
export declare const rmsLevel: (pcm: Pcm) => number;
/** Peak absolute sample of a PCM frame, normalized 0..1. */
export declare const peakLevelPcm: (pcm: Pcm) => number;
/** 0..1 linear amplitude → dBFS (silence → -Infinity). */
export declare const dbfsFromRms: (rms: number) => number;
/** True when a PCM frame is below `thresholdDb` dBFS (VAD gate). */
export declare const isSilentPcm: (pcm: Pcm, opts?: { thresholdDb?: number }) => boolean;
/** Apply a clamping linear gain to a PCM frame (new Buffer). */
export declare const applyGainPcm: (pcm: Pcm, gain: number) => Buffer;
/** Mix two PCM frames with clamping (new Buffer). */
export declare const mixPcm: (a: Pcm, b: Pcm) => Buffer;
/** Output-per-input sample ratio between two sample rates. */
export declare const resampleRatio: (fromRate: number, toRate: number) => number;
/** Downmix an interleaved stereo int16 frame to mono (new Buffer). */
export declare const downmixStereoToMono: (pcm: Pcm) => Buffer;
/** Call duration as 'M:SS' or 'H:MM:SS'. */
export declare const formatCallDuration: (ms: number) => string;
/** Mean inter-arrival jitter (ms), RFC 3550 estimator. */
export declare const estimateJitterMs: (arrivalTimes: number[], opts?: { packetMs?: number }) => number;
/** Packet-loss rate 0..1 from received vs expected. */
export declare const packetLossRate: (received: number, expected: number) => number;
/** True when `digit` is valid DTMF (0-9, *, #, A-D). */
export declare const isValidDtmf: (digit: string) => boolean;
/** [low, high] Hz tone pair for a DTMF digit, or null. */
export declare const dtmfFrequencies: (digit: string) => [number, number] | null;
/** Rough MOS (1..5) estimate from loss (0..1) and latency (ms). */
export declare const estimateMos: (lossRate?: number, latencyMs?: number) => number;
/** Encode 16-bit PCM to G.711 μ-law (PCMU). */
export declare const encodeMulaw: (pcm: Int16Array | Buffer | Uint8Array | number[]) => Uint8Array;
/** Decode G.711 μ-law (PCMU) bytes to 16-bit PCM. */
export declare const decodeMulaw: (u8: Uint8Array | number[]) => Int16Array;
/** Encode 16-bit PCM to G.711 A-law (PCMA). */
export declare const encodeAlaw: (pcm: Int16Array | Buffer | Uint8Array | number[]) => Uint8Array;
/** Decode G.711 A-law (PCMA) bytes to 16-bit PCM. */
export declare const decodeAlaw: (u8: Uint8Array | number[]) => Int16Array;
/** Next RTP sequence number, wrapping at 16 bits. */
export declare const rtpSequenceNext: (seq: number) => number;
/** Next RTP timestamp after `samples`, wrapping at 32 bits (unsigned). */
export declare const rtpTimestampNext: (ts: number, samples: number) => number;
/** Clock rate (Hz) for a codec name. */
export declare const codecClockRate: (name: string) => number;
/** Convert 16-bit PCM to normalized Float32 samples in [-1, 1]. */
export declare const pcmToFloat32: (pcm: Int16Array | Buffer | Uint8Array | number[]) => Float32Array;
/** Convert normalized Float32 samples back to clamped 16-bit PCM. */
export declare const float32ToPcm: (f32: Float32Array | number[]) => Int16Array;
/** Synthesize a pure sine tone as 16-bit PCM. */
export declare const generateTonePcm: (freq: number, durationMs: number, opts?: { sampleRate?: number; amplitude?: number }) => Int16Array;
/** Synthesize an in-band DTMF tone as 16-bit PCM, or null for an invalid digit. */
export declare const generateDtmfPcm: (digit: string, durationMs: number, opts?: { sampleRate?: number; amplitude?: number }) => Int16Array | null;
/** Concatenate PCM chunks into one Int16Array. */
export declare const concatPcm: (...chunks: Array<Int16Array | Buffer | Uint8Array | number[]>) => Int16Array;
/** Slice a PCM buffer by time window (ms). */
export declare const slicePcmMs: (pcm: Int16Array | Buffer | Uint8Array | number[], startMs: number, endMs?: number, opts?: { sampleRate?: number }) => Int16Array;

/** Static RTP payload types (RFC 3551) mapped to codecs this toolkit handles. */
export declare const RTP_PAYLOAD_TYPES: Readonly<Record<string, number>>;
/** Codec name → static RTP payload type number (null when unknown / dynamic). */
export declare const rtpPayloadType: (codec: string) => number | null;
/** Static RTP payload type number → canonical codec name (null when unknown). */
export declare const rtpPayloadTypeName: (pt: number) => string | null;
export interface RtpPacketInit {
    payloadType?: number;
    sequenceNumber?: number;
    timestamp?: number;
    ssrc?: number;
    payload?: Buffer | Uint8Array | Int16Array | number[];
    marker?: boolean;
    csrc?: number[];
}
export interface ParsedRtpPacket {
    version: number;
    padding: boolean;
    extension: boolean;
    marker: boolean;
    payloadType: number;
    sequenceNumber: number;
    timestamp: number;
    ssrc: number;
    csrc: number[];
    payload: Buffer;
}
/** Build an RTP packet (RFC 3550) as a Buffer. */
export declare const buildRtpPacket: (opts?: RtpPacketInit) => Buffer;
/** Parse an RTP packet (RFC 3550); null when too short or not version 2. */
export declare const parseRtpPacket: (input: Buffer | Uint8Array | number[]) => ParsedRtpPacket | null;

export interface RtpPacketizerInit {
    payloadType?: number;
    ssrc?: number;
    samplesPerFrame?: number;
    sequenceNumber?: number;
    timestamp?: number;
}
export interface RtpPacketizer {
    readonly ssrc: number;
    readonly sequenceNumber: number;
    readonly timestamp: number;
    readonly packetCount: number;
    packetize(payload: Buffer | Uint8Array | Int16Array | number[], opts?: { marker?: boolean; samples?: number }): Buffer;
}
/** Create a stateful RTP packetizer that advances sequence/timestamp per frame. */
export declare const createRtpPacketizer: (opts?: RtpPacketizerInit) => RtpPacketizer;

export interface JitterBufferStats {
    pushed: number;
    popped: number;
    dropped: number;
    lost: number;
    buffered: number;
}
export interface JitterBuffer {
    readonly size: number;
    readonly stats: JitterBufferStats;
    push(input: Buffer | Uint8Array | number[] | ParsedRtpPacket): boolean;
    pop(opts?: { force?: boolean }): ParsedRtpPacket | null;
    flush(): ParsedRtpPacket[];
    clear(): void;
}
/** Create a wraparound-safe jitter buffer that re-orders incoming RTP packets. */
export declare const createJitterBuffer: (opts?: { capacity?: number }) => JitterBuffer;

export interface CallBridgeInit {
    /** 'pcmu' (μ-law) or 'pcma' (A-law). Default 'pcmu'. */
    codec?: 'pcmu' | 'pcma';
    ssrc?: number;
    /** Override the static RTP payload type (default derived from codec). */
    payloadType?: number;
    /** Samples per RTP packet (default 160 = 20ms @ 8kHz). */
    samplesPerFrame?: number;
    /** Jitter-buffer depth (default 50). */
    jitterCapacity?: number;
    /** Outbound RTP sink (WA → SIP). */
    onRtp?: (rtp: Buffer, meta: { seq: number; frame: number }) => void;
    /** Inbound PCM sink (SIP → WA). */
    onPcm?: (pcm: Int16Array, meta: { seq: number; timestamp: number }) => void;
}
export interface CallBridgeStats {
    codec: string;
    payloadType: number;
    ssrc: number;
    framesSent: number;
    framesDelivered: number;
    packetizer: { sequenceNumber: number; timestamp: number; packetCount: number };
    jitter: JitterBufferStats;
}
export interface CallBridge {
    readonly codec: string;
    readonly payloadType: number;
    readonly ssrc: number;
    /** WA → SIP: transcode PCM to G.711 and emit one RTP packet per frame. */
    sendAudio(pcm: Int16Array | Buffer | Uint8Array | number[], opts?: { marker?: boolean }): Buffer[];
    /** SIP → WA: buffer an inbound RTP packet for in-order playout. */
    receiveRtp(rtp: Buffer | Uint8Array | number[] | ParsedRtpPacket): boolean;
    /** Pop in-order packets, decode to PCM, emit via onPcm. */
    drainAudio(opts?: { force?: boolean }): { frames: number; pcm: Int16Array };
    stats(): CallBridgeStats;
    close(): void;
}
/** End-to-end, transport-agnostic bridge: WhatsApp PCM ⇆ RTP/SIP G.711. */
export declare const createCallBridge: (opts?: CallBridgeInit) => CallBridge;
export {};
