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
export {};
