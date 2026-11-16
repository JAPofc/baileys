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
	const sampleCount = Math.floor(b.byteLength / 2);
	// JAP@Fix (bug 71): Int16Array requires a 2-byte-aligned byteOffset. Pooled
	// Buffers and `.subarray(oddIndex)` views (e.g. a PCM frame sliced out of a
	// larger call-audio buffer, or an RTP payload landing on an odd offset)
	// commonly start on an ODD byteOffset, which made the zero-copy view throw
	// `RangeError: start offset of Int16Array should be a multiple of 2`. When
	// the offset is misaligned, copy the usable bytes into a fresh, aligned
	// buffer first. Byte-identical fast path for already-aligned input.
	if (b.byteOffset % 2 === 0) {
		return new Int16Array(b.buffer, b.byteOffset, sampleCount);
	}
	const aligned = new Uint8Array(sampleCount * 2);
	aligned.set(b.subarray(0, sampleCount * 2));
	return new Int16Array(aligned.buffer, 0, sampleCount);
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

// JAP@Add 29-09-26 (v2.4.6) — G.711 companding codecs + RTP counters.
// -----------------------------------------------------------------------------
// G.711 μ-law / A-law are THE baseline narrowband telephony codecs (8 kHz, 8-bit)
// used on nearly every PSTN/SIP call, and a common target when bridging WA calls
// to phone systems. These are the canonical ITU-T / Sun reference algorithms, so
// the bytes interoperate with any standard G.711 endpoint. All pure.

const toInt16Array = (pcm) => {
	if (pcm instanceof Int16Array) return pcm;
	if (Buffer.isBuffer(pcm) || pcm instanceof Uint8Array) {
		const b = Buffer.from(pcm.buffer ?? pcm, pcm.byteOffset ?? 0, pcm.byteLength ?? pcm.length);
		const sampleCount = Math.floor(b.byteLength / 2);
		// JAP@Fix (bug 71): same odd-byteOffset guard as asInt16 — a misaligned
		// view (pooled Buffer / `.subarray(oddIndex)`) throws when handed straight
		// to Int16Array, so copy to an aligned buffer when needed. No-op for
		// already-aligned input.
		if (b.byteOffset % 2 === 0) {
			return new Int16Array(b.buffer, b.byteOffset, sampleCount);
		}
		const aligned = new Uint8Array(sampleCount * 2);
		aligned.set(b.subarray(0, sampleCount * 2));
		return new Int16Array(aligned.buffer, 0, sampleCount);
	}
	if (Array.isArray(pcm)) return Int16Array.from(pcm);
	throw new TypeError('expected Int16Array | Buffer | Uint8Array | number[] of 16-bit PCM');
};

// μ-law encode exponent lookup (index = (magnitude >> 7) & 0xFF)
const MU_EXP_LUT = (() => {
	const t = new Uint8Array(256);
	for (let i = 0; i < 256; i++) t[i] = i < 2 ? 0 : Math.floor(Math.log2(i));
	return t;
})();
const MU_DEC_LUT = [0, 132, 396, 924, 1980, 4092, 8316, 16764];
const MU_BIAS = 0x84;
const MU_CLIP = 32635;

const linearToMulaw = (sample) => {
	let sign = (sample >> 8) & 0x80;
	if (sign !== 0) sample = -sample;
	if (sample > MU_CLIP) sample = MU_CLIP;
	sample += MU_BIAS;
	const exponent = MU_EXP_LUT[(sample >> 7) & 0xff];
	const mantissa = (sample >> (exponent + 3)) & 0x0f;
	return ~(sign | (exponent << 4) | mantissa) & 0xff;
};
const mulawToLinear = (u) => {
	u = ~u & 0xff;
	const sign = u & 0x80;
	const exponent = (u >> 4) & 0x07;
	const mantissa = u & 0x0f;
	const sample = MU_DEC_LUT[exponent] + (mantissa << (exponent + 3));
	return sign !== 0 ? -sample : sample;
};

const A_SEG_END = [0x1f, 0x3f, 0x7f, 0xff, 0x1ff, 0x3ff, 0x7ff, 0xfff];
const linearToAlaw = (sample) => {
	let pcm = sample >> 3;
	let mask;
	if (pcm >= 0) { mask = 0xd5; }
	else { mask = 0x55; pcm = -pcm - 1; }
	let seg = 8;
	for (let i = 0; i < 8; i++) { if (pcm <= A_SEG_END[i]) { seg = i; break; } }
	if (seg >= 8) return (0x7f ^ mask) & 0xff;
	let aval = seg << 4;
	aval |= seg < 2 ? (pcm >> 1) & 0x0f : (pcm >> seg) & 0x0f;
	return (aval ^ mask) & 0xff;
};
const alawToLinear = (a) => {
	a ^= 0x55;
	let t = (a & 0x0f) << 4;
	const seg = (a & 0x70) >> 4;
	if (seg === 0) t += 8;
	else if (seg === 1) t += 0x108;
	else { t += 0x108; t <<= seg - 1; }
	return (a & 0x80) !== 0 ? t : -t;
};

/** Encode 16-bit PCM to G.711 μ-law (PCMU). Returns a Uint8Array (1 byte/sample). */
export const encodeMulaw = (pcm) => {
	const s = toInt16Array(pcm);
	const out = new Uint8Array(s.length);
	for (let i = 0; i < s.length; i++) out[i] = linearToMulaw(s[i]);
	return out;
};
/** Decode G.711 μ-law (PCMU) bytes back to 16-bit PCM (Int16Array). */
export const decodeMulaw = (u8) => {
	const bytes = u8 instanceof Uint8Array ? u8 : Uint8Array.from(u8);
	const out = new Int16Array(bytes.length);
	for (let i = 0; i < bytes.length; i++) out[i] = mulawToLinear(bytes[i]);
	return out;
};
/** Encode 16-bit PCM to G.711 A-law (PCMA). Returns a Uint8Array (1 byte/sample). */
export const encodeAlaw = (pcm) => {
	const s = toInt16Array(pcm);
	const out = new Uint8Array(s.length);
	for (let i = 0; i < s.length; i++) out[i] = linearToAlaw(s[i]);
	return out;
};
/** Decode G.711 A-law (PCMA) bytes back to 16-bit PCM (Int16Array). */
export const decodeAlaw = (u8) => {
	const bytes = u8 instanceof Uint8Array ? u8 : Uint8Array.from(u8);
	const out = new Int16Array(bytes.length);
	for (let i = 0; i < bytes.length; i++) out[i] = alawToLinear(bytes[i]);
	return out;
};

/** Next RTP sequence number, wrapping at 16 bits. */
export const rtpSequenceNext = (seq) => ((Number(seq) || 0) + 1) & 0xffff;
/** Next RTP timestamp after `samples`, wrapping at 32 bits (unsigned). */
export const rtpTimestampNext = (ts, samples) => (((Number(ts) || 0) + (Number(samples) || 0)) >>> 0);
/** Clock rate (Hz) for a codec name — pcmu/pcma/g722→8000, opus→48000, etc. */
export const codecClockRate = (name) => {
	switch (String(name || '').toLowerCase()) {
		case 'pcmu': case 'pcma': case 'g711': case 'g722': case 'gsm': case 'ilbc':
			return 8000;
		case 'opus': return 48000;
		case 'l16': return 44100;
		default: return 8000;
	}
};

// JAP@Add 29-09-26 (v2.4.6, round 2) — PCM generation & conversion helpers.
// -----------------------------------------------------------------------------
// Building blocks for synthesizing and reshaping call audio without pulling in a
// DSP dependency: float<->int conversion (WebAudio bridge), tone/DTMF synthesis
// (ringback, comfort tones, in-band DTMF), and buffer concat/slice by time.

/** Convert 16-bit PCM to normalized Float32 samples in [-1, 1] (WebAudio-friendly). */
export const pcmToFloat32 = (pcm) => {
	const s = toInt16Array(pcm);
	const out = new Float32Array(s.length);
	for (let i = 0; i < s.length; i++) out[i] = Math.max(-1, s[i] / 32768);
	return out;
};

/** Convert normalized Float32 samples ([-1, 1]) back to clamped 16-bit PCM. */
export const float32ToPcm = (f32) => {
	const arr = f32 instanceof Float32Array ? f32 : Float32Array.from(f32);
	const out = new Int16Array(arr.length);
	for (let i = 0; i < arr.length; i++) {
		const v = Math.round(arr[i] * 32767);
		out[i] = v > 32767 ? 32767 : v < -32768 ? -32768 : v;
	}
	return out;
};

/** Synthesize a pure sine tone as 16-bit PCM. Returns an Int16Array. */
export const generateTonePcm = (freq, durationMs, { sampleRate = 8000, amplitude = 0.5 } = {}) => {
	const n = Math.max(0, Math.round((sampleRate * durationMs) / 1000));
	const out = new Int16Array(n);
	const amp = Math.min(1, Math.max(0, amplitude)) * 32767;
	const w = (2 * Math.PI * freq) / sampleRate;
	for (let i = 0; i < n; i++) out[i] = Math.round(amp * Math.sin(w * i));
	return out;
};

/**
 * Synthesize an in-band DTMF tone (sum of the digit's low+high frequencies) as
 * 16-bit PCM. Returns an Int16Array, or null for an invalid digit.
 */
export const generateDtmfPcm = (digit, durationMs, { sampleRate = 8000, amplitude = 0.4 } = {}) => {
	const pair = dtmfFrequencies(digit);
	if (!pair) return null;
	const [low, high] = pair;
	const n = Math.max(0, Math.round((sampleRate * durationMs) / 1000));
	const out = new Int16Array(n);
	const amp = Math.min(1, Math.max(0, amplitude)) * 32767;
	const wl = (2 * Math.PI * low) / sampleRate;
	const wh = (2 * Math.PI * high) / sampleRate;
	for (let i = 0; i < n; i++) {
		const v = Math.round(amp * 0.5 * (Math.sin(wl * i) + Math.sin(wh * i)));
		out[i] = v > 32767 ? 32767 : v < -32768 ? -32768 : v;
	}
	return out;
};

/** Concatenate any number of PCM chunks into one Int16Array. */
export const concatPcm = (...chunks) => {
	const arrs = chunks.filter((c) => c != null).map(toInt16Array);
	const total = arrs.reduce((n, a) => n + a.length, 0);
	const out = new Int16Array(total);
	let off = 0;
	for (const a of arrs) { out.set(a, off); off += a.length; }
	return out;
};

/** Slice a PCM buffer by time window (ms). endMs omitted → to the end. */
export const slicePcmMs = (pcm, startMs, endMs, { sampleRate = 8000 } = {}) => {
	const s = toInt16Array(pcm);
	const start = Math.max(0, Math.floor((sampleRate * (startMs || 0)) / 1000));
	const end = endMs == null ? s.length : Math.min(s.length, Math.floor((sampleRate * endMs) / 1000));
	return s.slice(start, Math.max(start, end));
};

// JAP@Add 30-09-26 (v2.4.6, round 11) — RTP packet framing (RFC 3550).
// -----------------------------------------------------------------------------
// The counters above (rtpSequenceNext/rtpTimestampNext) had no packet to live
// in. These build/parse a real RTP packet header+payload, which is exactly what
// you need to bridge a WhatsApp call to a SIP/RTP endpoint (softphone, PBX,
// media gateway) or to write/replay a capture. Pure byte work, no dependency.

/** Static RTP payload types (RFC 3551) that map to codecs this toolkit handles. */
export const RTP_PAYLOAD_TYPES = Object.freeze({
	PCMU: 0,   // G.711 µ-law
	GSM: 3,
	G723: 4,
	PCMA: 8,   // G.711 A-law
	G722: 9,
	L16_STEREO: 10,
	L16_MONO: 11,
	G728: 15,
	G729: 18
});

const PAYLOAD_TYPE_BY_CODEC = {
	pcmu: 0, mulaw: 0, ulaw: 0,
	gsm: 3,
	g723: 4,
	pcma: 8, alaw: 8,
	g722: 9,
	l16: 11, l16_mono: 11, l16_stereo: 10,
	g728: 15,
	g729: 18
};

/** Codec name → static RTP payload type number (null when unknown / dynamic). */
export const rtpPayloadType = (codec) => {
	const pt = PAYLOAD_TYPE_BY_CODEC[String(codec || '').toLowerCase()];
	return pt === undefined ? null : pt;
};

/** Static RTP payload type number → canonical codec name (null when unknown). */
export const rtpPayloadTypeName = (pt) => {
	for (const [name, value] of Object.entries(RTP_PAYLOAD_TYPES)) {
		if (value === pt) return name;
	}
	return null;
};

const toPayloadBuffer = (payload) => {
	if (payload == null) return Buffer.alloc(0);
	if (Buffer.isBuffer(payload)) return payload;
	if (payload instanceof Uint8Array) return Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength);
	if (payload instanceof Int16Array) return Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength);
	if (Array.isArray(payload)) return Buffer.from(payload);
	throw new TypeError('rtp payload must be Buffer | Uint8Array | Int16Array | number[]');
};

/**
 * Build an RTP packet (RFC 3550) as a Buffer.
 *
 * @param opts.payloadType     0..127 (default 0 = PCMU)
 * @param opts.sequenceNumber  16-bit, wraps (default 0)
 * @param opts.timestamp       32-bit unsigned, wraps (default 0)
 * @param opts.ssrc            32-bit synchronization source id (default 0)
 * @param opts.payload         Buffer | Uint8Array | Int16Array | number[]
 * @param opts.marker          marker bit (default false)
 * @param opts.csrc            up to 15 contributing-source ids (default [])
 */
export const buildRtpPacket = ({
	payloadType = 0,
	sequenceNumber = 0,
	timestamp = 0,
	ssrc = 0,
	payload,
	marker = false,
	csrc = []
} = {}) => {
	const pt = Number(payloadType);
	if (!Number.isInteger(pt) || pt < 0 || pt > 127) {
		throw new RangeError('buildRtpPacket: payloadType must be an integer 0..127');
	}
	const sources = Array.isArray(csrc) ? csrc : [];
	if (sources.length > 15) {
		throw new RangeError('buildRtpPacket: at most 15 CSRC identifiers are allowed');
	}
	const body = toPayloadBuffer(payload);
	const header = Buffer.alloc(12 + sources.length * 4);
	header[0] = (2 << 6) | (sources.length & 0x0f); // version 2, no padding/extension
	header[1] = ((marker ? 1 : 0) << 7) | (pt & 0x7f);
	header.writeUInt16BE((Number(sequenceNumber) || 0) & 0xffff, 2);
	header.writeUInt32BE((Number(timestamp) || 0) >>> 0, 4);
	header.writeUInt32BE((Number(ssrc) || 0) >>> 0, 8);
	for (let i = 0; i < sources.length; i++) {
		header.writeUInt32BE((Number(sources[i]) || 0) >>> 0, 12 + i * 4);
	}
	return Buffer.concat([header, body]);
};

/**
 * Parse an RTP packet (RFC 3550). Returns the decoded fields plus the payload
 * (padding stripped, extension header skipped). Returns null when the buffer is
 * too short or not RTP version 2.
 */
export const parseRtpPacket = (input) => {
	const buf = Buffer.isBuffer(input)
		? input
		: input instanceof Uint8Array
			? Buffer.from(input.buffer, input.byteOffset, input.byteLength)
			: Array.isArray(input) ? Buffer.from(input) : null;
	if (!buf || buf.length < 12) return null;
	const version = buf[0] >> 6;
	if (version !== 2) return null;
	const padding = (buf[0] >> 5) & 0x01;
	const extension = (buf[0] >> 4) & 0x01;
	const csrcCount = buf[0] & 0x0f;
	const marker = (buf[1] >> 7) & 0x01;
	const payloadType = buf[1] & 0x7f;
	const sequenceNumber = buf.readUInt16BE(2);
	const timestamp = buf.readUInt32BE(4);
	const ssrc = buf.readUInt32BE(8);

	let offset = 12;
	const csrc = [];
	if (buf.length < offset + csrcCount * 4) return null;
	for (let i = 0; i < csrcCount; i++) {
		csrc.push(buf.readUInt32BE(offset));
		offset += 4;
	}

	if (extension) {
		if (buf.length < offset + 4) return null;
		const words = buf.readUInt16BE(offset + 2);
		offset += 4 + words * 4;
		if (buf.length < offset) return null;
	}

	let end = buf.length;
	if (padding && end > offset) {
		const padLen = buf[end - 1];
		if (padLen > 0 && end - padLen >= offset) end -= padLen;
	}

	return {
		version,
		padding: !!padding,
		extension: !!extension,
		marker: !!marker,
		payloadType,
		sequenceNumber,
		timestamp,
		ssrc,
		csrc,
		payload: buf.subarray(offset, end)
	};
};

// JAP@Add 30-09-26 (v2.4.6, round 14) — RTP session helpers: a stateful
// packetizer and a jitter buffer, built on buildRtpPacket/parseRtpPacket above.
// -----------------------------------------------------------------------------
// buildRtpPacket is stateless; a real sender has to advance the sequence number
// and the RTP timestamp for every frame, and a real receiver has to re-order
// packets that arrive out of order (UDP does that constantly). These two
// factories are the missing glue for actually streaming audio over RTP.

/** Signed 16-bit distance a-b, handling sequence-number wraparound. */
const seq16Diff = (a, b) => {
	const d = (a - b) & 0xffff;
	return d >= 0x8000 ? d - 0x10000 : d;
};

/**
 * Create a stateful RTP packetizer. Each `packetize(payload)` call emits a
 * ready-to-send RTP packet and advances the 16-bit sequence number and the
 * 32-bit timestamp (by `samplesPerFrame`, e.g. 160 for 20 ms of 8 kHz G.711).
 *
 * @param opts.payloadType     static payload type (default 0 = PCMU)
 * @param opts.ssrc            synchronization source id (default random 32-bit)
 * @param opts.samplesPerFrame timestamp increment per packet (default 160)
 * @param opts.sequenceNumber  initial 16-bit sequence (default random)
 * @param opts.timestamp       initial 32-bit timestamp (default random)
 */
export const createRtpPacketizer = ({
	payloadType = 0,
	ssrc,
	samplesPerFrame = 160,
	sequenceNumber,
	timestamp
} = {}) => {
	const rand16 = () => Math.floor(Math.random() * 0x10000);
	const rand32 = () => Math.floor(Math.random() * 0x100000000) >>> 0;
	const source = Number.isInteger(ssrc) ? ssrc >>> 0 : rand32();
	let seq = Number.isInteger(sequenceNumber) ? sequenceNumber & 0xffff : rand16();
	let ts = Number.isInteger(timestamp) ? timestamp >>> 0 : rand32();
	let count = 0;

	return {
		ssrc: source,
		get sequenceNumber() { return seq; },
		get timestamp() { return ts; },
		get packetCount() { return count; },
		/**
		 * Build the next RTP packet for `payload` and advance the counters.
		 * @param opts.marker  set the marker bit (e.g. first packet of a talkspurt)
		 * @param opts.samples timestamp increment for this frame (default samplesPerFrame)
		 */
		packetize(payload, { marker = false, samples = samplesPerFrame } = {}) {
			const pkt = buildRtpPacket({ payloadType, sequenceNumber: seq, timestamp: ts, ssrc: source, payload, marker });
			seq = rtpSequenceNext(seq);
			ts = rtpTimestampNext(ts, samples);
			count++;
			return pkt;
		}
	};
};

/**
 * Create a jitter buffer that re-orders incoming RTP packets by sequence number
 * (wraparound-safe), drops duplicates and packets that arrive too late, and
 * conceals a lost packet by skipping its slot once the backlog reaches
 * `capacity`.
 *
 * ```js
 * const jb = createJitterBuffer({ capacity: 10 })
 * jb.push(rtpBuffer)          // accepts a raw RTP Buffer or a parsed packet
 * const next = jb.pop()       // next in-order packet, or null while waiting
 * ```
 *
 * @param opts.capacity max packets held before a missing one is given up on (default 50)
 */
export const createJitterBuffer = ({ capacity = 50 } = {}) => {
	const packets = new Map(); // seq -> parsed packet
	let expected = null;       // next sequence number to emit
	let pushed = 0;
	let popped = 0;
	let dropped = 0;
	let lost = 0;

	const parse = (input) => {
		if (input && typeof input === 'object' && !Buffer.isBuffer(input) && !(input instanceof Uint8Array) && !Array.isArray(input)) {
			return typeof input.sequenceNumber === 'number' ? input : null;
		}
		return parseRtpPacket(input);
	};

	return {
		get size() { return packets.size; },
		get stats() { return { pushed, popped, dropped, lost, buffered: packets.size }; },

		/** Add a packet (raw RTP Buffer or a parsed packet). Returns true if buffered. */
		push(input) {
			const p = parse(input);
			if (!p || typeof p.sequenceNumber !== 'number') {
				return false;
			}
			const seq = p.sequenceNumber & 0xffff;
			if (expected === null) {
				expected = seq; // start the ordered stream here
			}
			// already emitted (too late) or duplicate → drop
			if (seq16Diff(seq, expected) < 0 || packets.has(seq)) {
				dropped++;
				return false;
			}
			packets.set(seq, p);
			pushed++;
			return true;
		},

		/**
		 * Return the next in-order packet, or null while waiting for a gap to
		 * fill. Pass `{ force: true }` to skip a missing packet immediately.
		 */
		pop({ force = false } = {}) {
			if (expected === null || packets.size === 0) {
				return null;
			}
			if (packets.has(expected)) {
				const p = packets.get(expected);
				packets.delete(expected);
				expected = (expected + 1) & 0xffff;
				popped++;
				return p;
			}
			// gap at `expected`: only skip when forced or the backlog is full
			if (!force && packets.size < capacity) {
				return null;
			}
			// jump to the earliest buffered sequence (conceal the loss)
			let earliest = null;
			for (const seq of packets.keys()) {
				if (earliest === null || seq16Diff(seq, earliest) < 0) {
					earliest = seq;
				}
			}
			lost += seq16Diff(earliest, expected);
			const p = packets.get(earliest);
			packets.delete(earliest);
			expected = (earliest + 1) & 0xffff;
			popped++;
			return p;
		},

		/** Drain every buffered packet in order (skipping gaps). */
		flush() {
			const out = [];
			let p;
			while ((p = this.pop({ force: true })) !== null) {
				out.push(p);
			}
			return out;
		},

		/** Reset all state. */
		clear() {
			packets.clear();
			expected = null;
			pushed = popped = dropped = lost = 0;
		}
	};
};

// JAP@Add (v2.4.6) — end-to-end call bridge.
// -----------------------------------------------------------------------------
// The pieces above (G.711 transcode, RTP packetize, jitter buffer) are the
// building blocks; `createCallBridge` wires them into a single, transport-
// agnostic object that bridges a WhatsApp call's linear 16-bit PCM to an
// RTP/SIP endpoint and back. It owns NO sockets — you feed it audio and RTP and
// it hands you RTP and audio through callbacks, so it runs (and unit-tests)
// without any network or the WASM engine.
//
//   const bridge = createCallBridge({ codec: 'pcmu', onRtp: udp.send, onPcm: wa.feed })
//   bridge.sendAudio(pcmFromWhatsApp)   // WA → SIP: transcode + packetize, emits onRtp
//   bridge.receiveRtp(rtpFromSip)       // SIP → WA: parse + jitter-buffer
//   bridge.drainAudio()                 // pop in-order, decode, emits onPcm
//
// @param opts.codec           'pcmu' (μ-law) or 'pcma' (A-law); default 'pcmu'
// @param opts.ssrc            RTP SSRC (default random)
// @param opts.payloadType     override the static PT (default: derived from codec)
// @param opts.samplesPerFrame samples per RTP packet (default 160 = 20ms @ 8kHz)
// @param opts.jitterCapacity  jitter-buffer depth (default 50)
// @param opts.onRtp           (rtpBuffer, meta) => void — outbound RTP sink
// @param opts.onPcm           (int16Pcm, meta) => void — inbound PCM sink
export const createCallBridge = ({
	codec = 'pcmu',
	ssrc,
	payloadType,
	samplesPerFrame = 160,
	jitterCapacity = 50,
	onRtp,
	onPcm
} = {}) => {
	const name = String(codec || '').toLowerCase();
	const CODECS = {
		pcmu: { encode: encodeMulaw, decode: decodeMulaw, pt: 0 },
		pcma: { encode: encodeAlaw, decode: decodeAlaw, pt: 8 }
	};
	const chosen = CODECS[name];
	if (!chosen) {
		throw new TypeError(`createCallBridge: unsupported codec "${codec}" (use 'pcmu' or 'pcma')`);
	}
	const pt = Number.isInteger(payloadType) ? payloadType : chosen.pt;
	if (!Number.isInteger(samplesPerFrame) || samplesPerFrame <= 0) {
		throw new RangeError('createCallBridge: samplesPerFrame must be a positive integer');
	}

	const packetizer = createRtpPacketizer({ payloadType: pt, ssrc, samplesPerFrame });
	const jitter = createJitterBuffer({ capacity: jitterCapacity });
	let framesSent = 0;
	let framesDelivered = 0;

	return {
		codec: name,
		payloadType: pt,
		get ssrc() { return packetizer.ssrc; },

		/**
		 * WA → SIP. Transcode linear PCM to G.711 and emit one RTP packet per
		 * `samplesPerFrame` frame (a short trailing frame is sent with a matching
		 * timestamp increment). Returns the RTP buffers produced.
		 * @param pcm Int16Array | Buffer | Uint8Array | number[] of 16-bit PCM
		 * @param opts.marker set the marker bit on the FIRST emitted packet (talkspurt start)
		 */
		sendAudio(pcm, { marker = false } = {}) {
			const samples = toInt16Array(pcm);
			const out = [];
			for (let off = 0; off < samples.length; off += samplesPerFrame) {
				const frame = samples.subarray(off, Math.min(off + samplesPerFrame, samples.length));
				const encoded = chosen.encode(frame);
				const pkt = packetizer.packetize(encoded, {
					marker: marker && off === 0,
					samples: frame.length
				});
				framesSent++;
				out.push(pkt);
				if (typeof onRtp === 'function') onRtp(pkt, { seq: packetizer.sequenceNumber, frame: framesSent });
			}
			return out;
		},

		/**
		 * SIP → WA. Buffer an inbound RTP packet (raw Buffer or a parsed packet)
		 * for in-order playout. Returns true when accepted (false = dup/late/invalid).
		 */
		receiveRtp(rtp) {
			return jitter.push(rtp);
		},

		/**
		 * Pop every in-order packet currently available, decode it to PCM, and
		 * emit each frame through `onPcm`. Pass `{ force: true }` to also flush
		 * across a missing packet (loss concealment). Returns
		 * `{ frames, pcm }` — the frame count and the concatenated Int16Array.
		 */
		drainAudio({ force = false } = {}) {
			const frames = [];
			let pkt;
			while ((pkt = jitter.pop({ force })) !== null) {
				const pcm = chosen.decode(pkt.payload);
				frames.push(pcm);
				framesDelivered++;
				if (typeof onPcm === 'function') onPcm(pcm, { seq: pkt.sequenceNumber, timestamp: pkt.timestamp });
			}
			return { frames: frames.length, pcm: frames.length ? concatPcm(...frames) : new Int16Array(0) };
		},

		/** Combined bridge + packetizer + jitter statistics. */
		stats() {
			return {
				codec: name,
				payloadType: pt,
				ssrc: packetizer.ssrc,
				framesSent,
				framesDelivered,
				packetizer: {
					sequenceNumber: packetizer.sequenceNumber,
					timestamp: packetizer.timestamp,
					packetCount: packetizer.packetCount
				},
				jitter: jitter.stats
			};
		},

		/** Release buffered state (does not touch any transport). */
		close() {
			jitter.clear();
		}
	};
};
