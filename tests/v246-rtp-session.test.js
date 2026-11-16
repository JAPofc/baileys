// Tests for the v2.4.6 RTP session helpers: createRtpPacketizer + createJitterBuffer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRtpPacketizer, createJitterBuffer, parseRtpPacket } from '../lib/Utils/voip-tools.js';

// Deterministic single-packet helper (fixed seq, default other fields).
const mk = (seq) => createRtpPacketizer({ sequenceNumber: seq, timestamp: 0, ssrc: 1 }).packetize(Buffer.from([seq & 0xff]));

test('packetizer emits correct headers and advances seq/timestamp', () => {
    const tx = createRtpPacketizer({ payloadType: 8, ssrc: 0x1234, samplesPerFrame: 160, sequenceNumber: 100, timestamp: 1000 });
    const p0 = parseRtpPacket(tx.packetize(Buffer.from([1])));
    const p1 = parseRtpPacket(tx.packetize(Buffer.from([2]), { marker: true }));
    assert.equal(p0.sequenceNumber, 100);
    assert.equal(p0.timestamp, 1000);
    assert.equal(p0.ssrc, 0x1234);
    assert.equal(p0.payloadType, 8);
    assert.equal(p0.marker, false);
    assert.equal(p1.sequenceNumber, 101);
    assert.equal(p1.timestamp, 1160); // +samplesPerFrame
    assert.equal(p1.marker, true);
    assert.equal(tx.sequenceNumber, 102);
    assert.equal(tx.timestamp, 1320);
    assert.equal(tx.packetCount, 2);
});

test('packetizer per-frame samples override, and seq wraps at 16 bits', () => {
    const tx = createRtpPacketizer({ sequenceNumber: 65535, timestamp: 0 });
    tx.packetize(Buffer.from([0]), { samples: 320 });
    assert.equal(tx.sequenceNumber, 0);   // wrapped
    assert.equal(tx.timestamp, 320);
});

test('packetizer defaults ssrc/seq/ts to random 16/32-bit values', () => {
    const tx = createRtpPacketizer();
    assert.ok(tx.ssrc >= 0 && tx.ssrc <= 0xffffffff);
    assert.ok(tx.sequenceNumber >= 0 && tx.sequenceNumber <= 0xffff);
    assert.ok(tx.timestamp >= 0 && tx.timestamp <= 0xffffffff);
});

test('jitter buffer pops in order and returns null when empty', () => {
    const jb = createJitterBuffer({ capacity: 10 });
    jb.push(mk(10)); jb.push(mk(11)); jb.push(mk(12));
    assert.equal(jb.pop().sequenceNumber, 10);
    assert.equal(jb.pop().sequenceNumber, 11);
    assert.equal(jb.pop().sequenceNumber, 12);
    assert.equal(jb.pop(), null);
});

test('jitter buffer re-orders out-of-order arrivals', () => {
    const jb = createJitterBuffer({ capacity: 10 });
    jb.push(mk(5)); jb.push(mk(7)); jb.push(mk(6));
    assert.deepEqual([jb.pop().sequenceNumber, jb.pop().sequenceNumber, jb.pop().sequenceNumber], [5, 6, 7]);
});

test('jitter buffer waits for a gap, then conceals the loss at capacity', () => {
    const jb = createJitterBuffer({ capacity: 3 });
    jb.push(mk(20));
    assert.equal(jb.pop().sequenceNumber, 20); // expected now 21
    jb.push(mk(22)); jb.push(mk(23));
    assert.equal(jb.pop(), null);              // 21 missing, backlog < capacity → wait
    jb.push(mk(24));                           // backlog == capacity → skip lost 21
    assert.equal(jb.pop().sequenceNumber, 22);
    assert.equal(jb.stats.lost, 1);
});

test('jitter buffer drops duplicates and late packets', () => {
    const jb = createJitterBuffer({ capacity: 10 });
    assert.equal(jb.push(mk(30)), true);
    assert.equal(jb.push(mk(30)), false); // duplicate
    assert.equal(jb.stats.dropped, 1);
    jb.pop();                             // emits 30, expected → 31
    assert.equal(jb.push(mk(29)), false); // arrived too late
});

test('force pop and flush drain in order, skipping gaps', () => {
    const jb = createJitterBuffer({ capacity: 100 });
    jb.push(mk(1)); jb.push(mk(3)); jb.push(mk(5));
    assert.deepEqual(jb.flush().map((p) => p.sequenceNumber), [1, 3, 5]);
    assert.equal(jb.size, 0);
});

test('jitter buffer accepts a parsed packet or a raw buffer; rejects junk', () => {
    const jb = createJitterBuffer();
    assert.equal(jb.push(parseRtpPacket(mk(9))), true);
    assert.equal(jb.push(mk(10)), true);
    assert.equal(jb.push('garbage'), false);
    assert.equal(jb.push(Buffer.alloc(4)), false); // too short to parse
});

test('clear resets state and stats', () => {
    const jb = createJitterBuffer();
    jb.push(mk(1)); jb.pop();
    jb.clear();
    assert.equal(jb.size, 0);
    assert.deepEqual(jb.stats, { pushed: 0, popped: 0, dropped: 0, lost: 0, buffered: 0 });
});
