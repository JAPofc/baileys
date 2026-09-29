/**
 * VoIP tools — pure audio/call math for the WhatsApp call stack: PCM timing,
 * loudness, gain/mix, jitter & packet-loss stats, DTMF and a rough MOS score.
 *
 * ```js
 * import {
 *     pcmDurationMs, rmsLevel, isSilentPcm, applyGainPcm, mixPcm,
 *     estimateJitterMs, packetLossRate, estimateMos, formatCallDuration
 * } from '@japofc/baileys'
 *
 * pcmDurationMs(16000)                 // 1000 (ms) at 8kHz mono s16
 * isSilentPcm(frame)                   // VAD gate before sending
 * applyGainPcm(frame, 1.5)             // +50% volume, clipping-safe
 * estimateMos(0.02, 120)               // ~4.1 call-quality score
 * formatCallDuration(93_000)           // '1:33'
 * ```
 *
 * Everything is dependency-free, injectable-free and unit-tested. PCM helpers
 * assume signed 16-bit little-endian samples (WhatsApp's call audio format)
 * unless told otherwise.
 */

const DEFAULT_PCM = { sampleRate: 8000, bytesPerSample: 2, channels: 1 };

/** Duration (ms) of a PCM buffer of `byteLength` bytes. */
export const pcmDurationMs = (byteLength, opts = {}) => {
	const { sampleRate, bytesPerSample, channels } = { ...DEFAULT_PCM, ...opts };
	const frameBytes = bytesPerSample * channels * sampleRate;
	if (frameBytes <= 0) {
		return 0;
	}
	return (Math.max(0, byteLength) / frameBytes) * 1000;
};

/** Byte length needed to hold `durationMs` of PCM audio. */
export const pcmByteLength = (durationMs, opts = {}) => {
	const { sampleRate, bytesPerSample, channels } = { ...DEFAULT_PCM, ...opts };
	const bytes = Math.round((Math.max(0, durationMs) / 1000) * sampleRate) * bytesPerSample * channels;
	return bytes;
};

const asInt16 = (buf) => {
	if (buf instanceof Int16Array) {
		return buf;
	}
	const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf || []);
	// view the underlying bytes as little-endian int16 (drop a trailing odd byte)
	return new Int16Array(b.buffer, b.byteOffset, Math.floor(b.byteLength / 2));
};

/** Root-mean-square loudness of a PCM frame, normalized to 0..1. */
export const rmsLevel = (pcm) => {
	const samples = asInt16(pcm);
	if (!samples.length) {
		return 0;
	}
	let sumSq = 0;
	for (let i = 0; i < samples.length; i++) {
		const v = samples[i] / 32768;
		sumSq += v * v;
	}
	return Math.sqrt(sumSq / samples.length);
};

/** Peak absolute sample of a PCM frame, normalized to 0..1. */
export const peakLevelPcm = (pcm) => {
	const samples = asInt16(pcm);
	let peak = 0;
	for (let i = 0; i < samples.length; i++) {
		const v = Math.abs(samples[i]);
		if (v > peak) {
			peak = v;
		}
	}
	return peak / 32768;
};

/** Convert a 0..1 linear amplitude to dBFS (0 dBFS = full scale). Silence → -Infinity. */
export const dbfsFromRms = (rms) => (rms > 0 ? 20 * Math.log10(rms) : -Infinity);

/** True when a PCM frame is below `thresholdDb` dBFS (default -50): a VAD gate. */
export const isSilentPcm = (pcm, { thresholdDb = -50 } = {}) => dbfsFromRms(rmsLevel(pcm)) < thresholdDb;

/**
 * Apply a linear gain to a PCM frame, clamping to the int16 range so loud
 * gain never wraps around into noise. Returns a new Buffer.
 */
export const applyGainPcm = (pcm, gain) => {
	const samples = asInt16(pcm);
	const out = Buffer.alloc(samples.length * 2);
	for (let i = 0; i < samples.length; i++) {
		let v = Math.round(samples[i] * gain);
		if (v > 32767) {
			v = 32767;
		} else if (v < -32768) {
			v = -32768;
		}
		out.writeInt16LE(v, i * 2);
	}
	return out;
};

/**
 * Mix two PCM frames sample-by-sample with clamping (the shorter frame is
 * zero-padded). Returns a new Buffer the length of the longer input.
 */
export const mixPcm = (a, b) => {
	const sa = asInt16(a);
	const sb = asInt16(b);
	const len = Math.max(sa.length, sb.length);
	const out = Buffer.alloc(len * 2);
	for (let i = 0; i < len; i++) {
		let v = (sa[i] || 0) + (sb[i] || 0);
		if (v > 32767) {
			v = 32767;
		} else if (v < -32768) {
			v = -32768;
		}
		out.writeInt16LE(v, i * 2);
	}
	return out;
};

/** Resample ratio (output samples per input sample) between two rates. */
export const resampleRatio = (fromRate, toRate) => {
	if (!(fromRate > 0) || !(toRate > 0)) {
		throw new Error('resampleRatio: rates must be positive');
	}
	return toRate / fromRate;
};

/** Downmix an interleaved stereo int16 frame to mono (averaged). Returns a new Buffer. */
export const downmixStereoToMono = (pcm) => {
	const s = asInt16(pcm);
	const frames = Math.floor(s.length / 2);
	const out = Buffer.alloc(frames * 2);
	for (let i = 0; i < frames; i++) {
		out.writeInt16LE(Math.round((s[i * 2] + s[i * 2 + 1]) / 2), i * 2);
	}
	return out;
};

/** Call duration as 'M:SS' (or 'H:MM:SS' past an hour). Negative clamps to 0. */
export const formatCallDuration = (ms) => {
	let s = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
	const h = Math.floor(s / 3600); s -= h * 3600;
	const m = Math.floor(s / 60); s -= m * 60;
	const pad = (n) => String(n).padStart(2, '0');
	return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

/**
 * Mean inter-arrival jitter (ms) from a list of packet arrival timestamps,
 * per the RFC 3550 smoothed-jitter estimator. Needs >= 3 timestamps.
 */
export const estimateJitterMs = (arrivalTimes, { packetMs = 20 } = {}) => {
	const t = (arrivalTimes || []).filter(n => Number.isFinite(n));
	if (t.length < 3) {
		return 0;
	}
	let jitter = 0;
	for (let i = 1; i < t.length; i++) {
		// D = deviation of the transit-time difference from the nominal spacing
		const d = Math.abs((t[i] - t[i - 1]) - packetMs);
		jitter += (d - jitter) / 16;
	}
	return jitter;
};

/** Packet-loss rate 0..1 from received vs expected counts (clamped). */
export const packetLossRate = (received, expected) => {
	if (!(expected > 0)) {
		return 0;
	}
	const lost = expected - received;
	return Math.min(1, Math.max(0, lost / expected));
};

const DTMF_ROWS = { '1': 697, '2': 697, '3': 697, 'A': 697, '4': 770, '5': 770, '6': 770, 'B': 770, '7': 852, '8': 852, '9': 852, 'C': 852, '*': 941, '0': 941, '#': 941, 'D': 941 };
const DTMF_COLS = { '1': 1209, '2': 1336, '3': 1477, 'A': 1633, '4': 1209, '5': 1336, '6': 1477, 'B': 1633, '7': 1209, '8': 1336, '9': 1477, 'C': 1633, '*': 1209, '0': 1336, '#': 1477, 'D': 1633 };

/** True when `digit` is a valid DTMF symbol: 0-9, *, #, A-D. */
export const isValidDtmf = (digit) => {
	const d = String(digit ?? '').toUpperCase();
	return d.length === 1 && d in DTMF_ROWS;
};

/** The [low, high] Hz tone pair for a DTMF digit, or null when invalid. */
export const dtmfFrequencies = (digit) => {
	const d = String(digit ?? '').toUpperCase();
	if (!(d in DTMF_ROWS)) {
		return null;
	}
	return [DTMF_ROWS[d], DTMF_COLS[d]];
};

/**
 * Rough Mean Opinion Score (1..5) estimate from packet loss (0..1) and
 * one-way latency (ms) — an E-model-inspired heuristic for call-quality
 * dashboards. 4.4≈excellent, 4.0≈good, 3.6≈fair, <3≈poor.
 */
export const estimateMos = (lossRate = 0, latencyMs = 0) => {
	const loss = Math.min(1, Math.max(0, lossRate));
	const latency = Math.max(0, latencyMs);
	// effective latency penalty (per ITU-T G.107 simplification)
	let effLatency = latency;
	if (latency > 160) {
		effLatency = latency + (latency - 120) * 0.11;
	}
	let r = 93.2 - (effLatency / 40) - (effLatency > 100 ? (effLatency - 100) / 40 : 0);
	r -= 2.5 * (loss * 100); // ~2.5 R-points lost per 1% packet loss
	r = Math.min(93.2, Math.max(0, r));
	// R-factor → MOS (ITU-T G.107 Annex B)
	const mos = 1 + 0.035 * r + r * (r - 60) * (100 - r) * 7e-6;
	return Math.round(Math.min(5, Math.max(1, mos)) * 100) / 100;
};
