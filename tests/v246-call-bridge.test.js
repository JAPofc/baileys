// Tests for createCallBridge — the end-to-end, transport-agnostic audio bridge
// (WhatsApp linear PCM ⇆ RTP/SIP G.711). No sockets/WASM: audio and RTP go in,
// RTP and audio come out via callbacks/return values.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCallBridge, parseRtpPacket } from '../lib/Utils/voip-tools.js';

const ramp = (n) => { const p = new Int16Array(n); for (let i = 0; i < n; i++) p[i] = Math.round(4000 * Math.sin(i / 5)); return p; };

test('sendAudio chunks PCM into per-frame RTP packets (incl. a short tail)', () => {
    const sent = [];
    const A = createCallBridge({ codec: 'pcmu', ssrc: 1234, samplesPerFrame: 160, onRtp: (p) => sent.push(p) });
    const out = A.sendAudio(ramp(500), { marker: true });
    assert.equal(out.length, 4); // 160 + 160 + 160 + 20
    assert.equal(sent.length, 4);
    const p0 = parseRtpPacket(sent[0]);
    assert.equal(p0.marker, true); // marker only on the first packet
    assert.equal(p0.payloadType, 0); // PCMU
    assert.equal(p0.ssrc, 1234);
    assert.equal(p0.payload.length, 160); // 1 byte/sample G.711
    assert.equal(parseRtpPacket(sent[3]).payload.length, 20);
    assert.equal(parseRtpPacket(sent[1]).marker, false);
});

test('sequence numbers increment and timestamps advance by frame length', () => {
    const sent = [];
    const A = createCallBridge({ codec: 'pcmu', samplesPerFrame: 160, onRtp: (p) => sent.push(p) });
    A.sendAudio(ramp(320));
    const [a, b] = sent.map(parseRtpPacket);
    assert.equal((b.sequenceNumber - a.sequenceNumber) & 0xffff, 1);
    assert.equal((b.timestamp - a.timestamp) >>> 0, 160);
});

test('end-to-end loopback reconstructs the sample count and rough waveform', () => {
    const sent = [];
    const A = createCallBridge({ codec: 'pcmu', onRtp: (p) => sent.push(p) });
    const B = createCallBridge({ codec: 'pcmu' });
    const pcm = ramp(500);
    A.sendAudio(pcm);
    for (const pkt of sent) B.receiveRtp(pkt);
    const { frames, pcm: recon } = B.drainAudio();
    assert.equal(frames, 4);
    assert.equal(recon.length, 500);
    // G.711 is lossy but preserves sign/scale; require >90% same-sign samples
    let sameSign = 0;
    for (let i = 0; i < pcm.length; i++) if (pcm[i] === 0 || Math.sign(pcm[i]) === Math.sign(recon[i])) sameSign++;
    assert.ok(sameSign > pcm.length * 0.9);
});

test('onPcm fires once per delivered frame with seq/timestamp meta', () => {
    const sent = [];
    const A = createCallBridge({ codec: 'pcmu', samplesPerFrame: 160, onRtp: (p) => sent.push(p) });
    const metas = [];
    const B = createCallBridge({ codec: 'pcmu', onPcm: (_pcm, meta) => metas.push(meta) });
    A.sendAudio(ramp(480)); // 3 frames
    sent.forEach((p) => B.receiveRtp(p));
    B.drainAudio();
    assert.equal(metas.length, 3);
    assert.equal(typeof metas[0].seq, 'number');
    assert.equal(typeof metas[0].timestamp, 'number');
});

test('the jitter buffer re-orders out-of-order arrivals before playout', () => {
    const sent = [];
    const A = createCallBridge({ codec: 'pcma', samplesPerFrame: 160, onRtp: (p) => sent.push(p) });
    A.sendAudio(new Int16Array(480)); // 3 frames
    const B = createCallBridge({ codec: 'pcma' });
    // deliver 0, 2, 1 (middle late)
    B.receiveRtp(sent[0]);
    B.receiveRtp(sent[2]);
    B.receiveRtp(sent[1]);
    const { frames } = B.drainAudio();
    assert.equal(frames, 3);
});

test('drainAudio waits on a gap unless forced', () => {
    const sent = [];
    const A = createCallBridge({ codec: 'pcmu', samplesPerFrame: 160, onRtp: (p) => sent.push(p) });
    A.sendAudio(new Int16Array(480)); // 3 frames
    const B = createCallBridge({ codec: 'pcmu' });
    B.receiveRtp(sent[0]);
    B.receiveRtp(sent[2]); // seq 1 missing
    assert.equal(B.drainAudio().frames, 1); // only frame 0 in order
    // force skips the missing frame and plays frame 2
    assert.equal(B.drainAudio({ force: true }).frames, 1);
});

test('duplicate and invalid RTP are rejected by receiveRtp', () => {
    const sent = [];
    const A = createCallBridge({ codec: 'pcmu', onRtp: (p) => sent.push(p) });
    A.sendAudio(new Int16Array(160));
    const B = createCallBridge({ codec: 'pcmu' });
    assert.equal(B.receiveRtp(sent[0]), true);
    assert.equal(B.receiveRtp(sent[0]), false); // duplicate
    assert.equal(B.receiveRtp(Buffer.alloc(4)), false); // too short to be RTP
});

test('stats reflect frames, codec, payload type and packet count', () => {
    const A = createCallBridge({ codec: 'pcmu', ssrc: 9, samplesPerFrame: 160 });
    A.sendAudio(ramp(500)); // 4 frames
    const s = A.stats();
    assert.equal(s.framesSent, 4);
    assert.equal(s.codec, 'pcmu');
    assert.equal(s.payloadType, 0);
    assert.equal(s.ssrc, 9);
    assert.equal(s.packetizer.packetCount, 4);
    assert.equal(s.jitter.pushed, 0);
});

test('codec selection: pcma defaults to payload type 8; unknown codec throws', () => {
    assert.equal(createCallBridge({ codec: 'pcma' }).payloadType, 8);
    assert.equal(createCallBridge({ codec: 'pcmu' }).payloadType, 0);
    assert.throws(() => createCallBridge({ codec: 'opus' }), /unsupported codec/);
    assert.throws(() => createCallBridge({ codec: 'pcmu', samplesPerFrame: 0 }), /samplesPerFrame/);
});

test('empty audio produces no packets; close() clears buffered state', () => {
    const A = createCallBridge({ codec: 'pcmu' });
    assert.equal(A.sendAudio(new Int16Array(0)).length, 0);
    const sent = [];
    const S = createCallBridge({ codec: 'pcmu', onRtp: (p) => sent.push(p) });
    S.sendAudio(new Int16Array(320));
    const B = createCallBridge({ codec: 'pcmu' });
    B.receiveRtp(sent[0]);
    B.close();
    assert.equal(B.stats().jitter.buffered, 0);
});

test('a Buffer of little-endian PCM is accepted for sendAudio', () => {
    const sent = [];
    const A = createCallBridge({ codec: 'pcmu', samplesPerFrame: 160, onRtp: (p) => sent.push(p) });
    const buf = Buffer.alloc(320); // 160 samples of silence
    buf.writeInt16LE(10000, 0);
    const out = A.sendAudio(buf);
    assert.equal(out.length, 1);
    assert.equal(parseRtpPacket(sent[0]).payload.length, 160);
});
