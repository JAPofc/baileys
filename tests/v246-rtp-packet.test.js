// Tests for the v2.4.6 RTP packet framing helpers (RFC 3550) in voip-tools.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildRtpPacket, parseRtpPacket, rtpPayloadType, rtpPayloadTypeName, RTP_PAYLOAD_TYPES
} from '../lib/Utils/voip-tools.js';

test('buildRtpPacket: exact header byte layout (RFC 3550)', () => {
    const pkt = buildRtpPacket({ payloadType: 8, sequenceNumber: 1000, timestamp: 160000, ssrc: 0xDEADBEEF, marker: true, payload: Buffer.from([1, 2, 3, 4]) });
    assert.equal(pkt.length, 16); // 12-byte header + 4-byte payload
    assert.equal(pkt[0], 0x80);   // version 2, no padding/ext, cc=0
    assert.equal(pkt[1], 0x80 | 8); // marker + payload type 8
    assert.equal(pkt.readUInt16BE(2), 1000);
    assert.equal(pkt.readUInt32BE(4), 160000);
    assert.equal(pkt.readUInt32BE(8) >>> 0, 0xDEADBEEF);
});

test('parseRtpPacket: round-trips every field', () => {
    const payload = Buffer.from([9, 8, 7, 6, 5]);
    const pkt = buildRtpPacket({ payloadType: 0, sequenceNumber: 42, timestamp: 12345, ssrc: 777, payload });
    const p = parseRtpPacket(pkt);
    assert.equal(p.version, 2);
    assert.equal(p.marker, false);
    assert.equal(p.payloadType, 0);
    assert.equal(p.sequenceNumber, 42);
    assert.equal(p.timestamp, 12345);
    assert.equal(p.ssrc, 777);
    assert.deepEqual(p.csrc, []);
    assert.equal(Buffer.compare(p.payload, payload), 0);
});

test('CSRC list is encoded and parsed, payload offset correct', () => {
    const pkt = buildRtpPacket({ csrc: [111, 222], payload: [42] });
    assert.equal(pkt.length, 12 + 8 + 1);
    assert.equal(pkt[0] & 0x0f, 2); // cc = 2
    const p = parseRtpPacket(pkt);
    assert.deepEqual(p.csrc, [111, 222]);
    assert.equal(p.payload.length, 1);
    assert.equal(p.payload[0], 42);
});

test('sequence and timestamp wrap to 16/32 bits', () => {
    const p = parseRtpPacket(buildRtpPacket({ sequenceNumber: 70000, timestamp: 0x1FFFFFFFF }));
    assert.equal(p.sequenceNumber, 70000 & 0xffff);
    assert.equal(p.timestamp, 0x1FFFFFFFF >>> 0);
});

test('padding bit strips trailing padding bytes from payload', () => {
    const base = buildRtpPacket({ payload: Buffer.from([5, 5]) });
    const padded = Buffer.concat([base, Buffer.from([0, 0, 3])]); // 3 padding bytes, last = count
    padded[0] |= 0x20; // set padding flag
    const p = parseRtpPacket(padded);
    assert.equal(p.padding, true);
    assert.equal(p.payload.length, 2);
    assert.equal(p.payload[0], 5);
});

test('extension header is skipped', () => {
    const base = buildRtpPacket({ payload: Buffer.from([1, 2]) });
    // insert a 1-word extension between header and payload
    const header = base.subarray(0, 12);
    const payload = base.subarray(12);
    const ext = Buffer.from([0xBE, 0xDE, 0x00, 0x01, 0, 0, 0, 0]); // profile + length=1 word + 4 bytes
    const pkt = Buffer.concat([header, ext, payload]);
    pkt[0] |= 0x10; // set extension flag
    const p = parseRtpPacket(pkt);
    assert.equal(p.extension, true);
    assert.equal(Buffer.compare(p.payload, Buffer.from([1, 2])), 0);
});

test('buildRtpPacket accepts Int16Array / Uint8Array / number[] payloads', () => {
    assert.equal(parseRtpPacket(buildRtpPacket({ payload: new Uint8Array([1, 2]) })).payload.length, 2);
    assert.equal(parseRtpPacket(buildRtpPacket({ payload: new Int16Array([1, 2]) })).payload.length, 4);
    assert.equal(parseRtpPacket(buildRtpPacket({ payload: [1, 2, 3] })).payload.length, 3);
});

test('buildRtpPacket validates ranges', () => {
    assert.throws(() => buildRtpPacket({ payloadType: 200 }), RangeError);
    assert.throws(() => buildRtpPacket({ payloadType: -1 }), RangeError);
    assert.throws(() => buildRtpPacket({ csrc: new Array(16).fill(0) }), RangeError);
});

test('parseRtpPacket: null for too short / non-v2', () => {
    assert.equal(parseRtpPacket(Buffer.alloc(5)), null);
    const bad = buildRtpPacket({});
    bad[0] = 0x40; // version 1
    assert.equal(parseRtpPacket(bad), null);
    assert.equal(parseRtpPacket([]), null);
});

test('rtpPayloadType / rtpPayloadTypeName mapping', () => {
    assert.equal(rtpPayloadType('pcmu'), 0);
    assert.equal(rtpPayloadType('mulaw'), 0);
    assert.equal(rtpPayloadType('pcma'), 8);
    assert.equal(rtpPayloadType('alaw'), 8);
    assert.equal(rtpPayloadType('g722'), 9);
    assert.equal(rtpPayloadType('opus'), null); // dynamic PT
    assert.equal(rtpPayloadTypeName(0), 'PCMU');
    assert.equal(rtpPayloadTypeName(8), 'PCMA');
    assert.equal(rtpPayloadTypeName(99), null);
    assert.equal(RTP_PAYLOAD_TYPES.PCMU, 0);
    assert.equal(RTP_PAYLOAD_TYPES.G722, 9);
});

test('an empty packet is a valid 12-byte v2 header', () => {
    const pkt = buildRtpPacket({});
    assert.equal(pkt.length, 12);
    const p = parseRtpPacket(pkt);
    assert.equal(p.version, 2);
    assert.equal(p.payload.length, 0);
});
