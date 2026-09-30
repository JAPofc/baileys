import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync, unlinkSync } from 'node:fs';
import { VoipClient, ActiveCall, attachVoip, createWavRecorder } from '../lib/VoIP/index.js';

describe('createWavRecorder', () => {
    it('writes a valid wav', () => {
        const path = join(tmpdir(), `jap-test-${Date.now()}.wav`);
        const rec = createWavRecorder(path);
        rec.write(new Float32Array([0.5, -0.5, 0.25, -0.25]));
        rec.close();
        rec.close();
        const wav = readFileSync(path);
        assert.equal(wav.subarray(0, 4).toString(), 'RIFF');
        assert.equal(wav.subarray(8, 12).toString(), 'WAVE');
        assert.equal(wav.readUInt32LE(40), 8);
        unlinkSync(path);
    });
});

describe('VoipClient (offline-safe)', () => {
    it('starts idle as EventEmitter', () => {
        const v = new VoipClient();
        assert.ok(v instanceof EventEmitter);
        assert.equal(v.isBusy(), false);
        assert.equal(v.getActiveCall(), null);
        assert.equal(typeof v.rejectCall, 'function');
    });
    it('attachVoip validates socket', async () => {
        await assert.rejects(attachVoip(null), /active Baileys socket/);
        await assert.rejects(attachVoip({}), /active Baileys socket/);
    });
    it('ActiveCall records + tracks duration', () => {
        const path = join(tmpdir(), `jap-call-${Date.now()}.wav`);
        const call = new ActiveCall('C1', { endCall() { }, setMute() { } }, 0);
        assert.ok(call.getDurationMs() >= 0);
        const stop = call.recordToFile(path);
        call._emitAudio(new Float32Array(160));
        stop();
        assert.equal(readFileSync(path).length, 44 + 320);
        unlinkSync(path);
    });
});

const makeMockSock = () => {
    const ws = new EventEmitter();
    const ev = new EventEmitter();
    return {
        ws, ev,
        authState: { creds: { me: { id: '1@s.whatsapp.net', lid: '1@lid' } }, keys: { set: async () => ({}), get: async () => ({}) } },
        generateMessageTag: () => 'tag1',
        query: async () => ({}),
        sendNode: async () => ({}),
        waitForMessage: async () => null,
        presenceSubscribe: async () => {},
        getUSyncDevices: async () => [],
        rejectCall: async () => {},
        sendMessage: async () => ({}),
        signalRepository: {
            lidMapping: { getLIDForPN: async (pn) => String(pn).replace('s.whatsapp.net', 'lid') },
            jidToSignalProtocolAddress: (j) => j,
            validateSession: async () => ({ exists: true }),
            decryptMessage: async () => { throw new Error('no session'); },
            encryptMessage: async () => ({ type: 'msg', ciphertext: new Uint8Array(1) }),
        },
    };
};

const makeMockEngine = () => {
    const calls = [];
    const rec = (name) => (...args) => { calls.push([name, ...args]); };
    return {
        calls,
        initialize: async () => {}, initVoipStack: () => {}, waitForVoipStackReady: async () => {},
        updateNetworkMedium: () => {}, destroy: () => {},
        startCall: rec('startCall'), endCall: rec('endCall'), setMute: () => 0,
        acceptCall: rec('acceptCall'),
        startGroupCall: rec('startGroupCall'), joinOngoingCall: rec('joinOngoingCall'),
        inviteToCall: rec('inviteToCall'), removeCallParticipant: rec('removeCallParticipant'), requestPeerMute: rec('requestPeerMute'),
        previewCallLink: (...a) => { calls.push(['previewCallLink', ...a]); return { ok: true }; },
        joinCallLink: rec('joinCallLink'),
        resendOfferOnDecryptionFailure: rec('resendOffer'), resendEncRekeyRetry: rec('resendRekey'),
        getCallInfo: () => ({ state: 6 }),
        handleSignalingOffer: rec('offer'), handleSignalingMessage: rec('msg'),
        handleSignalingAck: rec('ack'), handleSignalingReceipt: rec('receipt'),
        handleOnTransportMessage: () => {}, updateIceRtt: () => {},
        malloc: () => 0, free: () => {}, sendAudioData: () => {},
    };
};

const offerNode = (callId, from, extraAttrs = {}) => ({
    tag: 'call', attrs: { from }, content: [{
        tag: 'offer', attrs: { 'call-id': callId, platform: '0', version: '1', e: '0', t: '1', ...extraAttrs }, content: undefined,
    }],
});
const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));

describe('VoIP inbound answer (mocked engine)', () => {
    it('offer → pending → answerCall drives acceptCall', async () => {
        const sock = makeMockSock();
        const engine = makeMockEngine();
        const voip = await attachVoip(sock, { engine });
        let incoming = null;
        voip.on('incoming-call', (i) => { incoming = i; });
        sock.ws.emit('CB:call', offerNode('CALL1', '123@s.whatsapp.net'));
        await tick();
        assert.ok(incoming && incoming.callId === 'CALL1');
        assert.equal(voip.getPendingCalls().length, 1);
        const call = await voip.answerCall('CALL1');
        assert.equal(call.direction, 'inbound');
        assert.equal(call.from, '123@s.whatsapp.net');
        assert.ok(engine.calls.some((c) => c[0] === 'acceptCall'));
        assert.equal(voip.isBusy(), true);
        voip.disconnect();
    });
    it('answerCall rejects unknown/expired/group offers', async () => {
        const sock = makeMockSock();
        const voip = await attachVoip(sock, { engine: makeMockEngine() });
        await assert.rejects(voip.answerCall('NOPE'), /No pending/);
        sock.ws.emit('CB:call', offerNode('G1', '1@g.us'));
        await tick();
        await assert.rejects(voip.answerCall('G1'), /group call/);
        voip.disconnect();
    });
    it('autoAnswer picks up automatically', async () => {
        const sock = makeMockSock();
        const engine = makeMockEngine();
        const voip = await attachVoip(sock, { engine, autoAnswer: true });
        sock.ws.emit('CB:call', offerNode('CALL2', '456@s.whatsapp.net'));
        await tick();
        assert.equal(voip.isBusy(), true);
        assert.ok(engine.calls.some((c) => c[0] === 'acceptCall'));
        voip.disconnect();
    });
});

describe('VoIP group calls (mocked engine)', () => {
    it('joinGroupCall + rejoin + participant ops', async () => {
        const sock = makeMockSock();
        const engine = makeMockEngine();
        const voip = await attachVoip(sock, { engine });
        sock.ws.emit('CB:call', offerNode('GC1', '99@g.us'));
        await tick();
        const call = await voip.joinGroupCall('GC1');
        assert.equal(call.direction, 'group-inbound');
        assert.equal(call.groupJid, '99@g.us');
        assert.ok(engine.calls.some((c) => c[0] === 'joinOngoingCall'));
        assert.equal(call.invite('62812@s.whatsapp.net'), true);
        assert.equal(call.removeParticipant('62813@s.whatsapp.net'), true);
        call._forceEnd('test');
        assert.equal(voip.isBusy(), false);
        const again = await voip.rejoinGroupCall();
        assert.equal(again.callId, 'GC1');
        assert.equal(engine.calls.filter((c) => c[0] === 'joinOngoingCall').length, 2);
        voip.disconnect();
    });
    it('startGroupCall resolves LIDs + dials', async () => {
        const sock = makeMockSock();
        const engine = makeMockEngine();
        const voip = await attachVoip(sock, { engine });
        const call = await voip.startGroupCall('99@g.us', ['62812', '62813']);
        assert.equal(call.direction, 'group-outbound');
        const dial = engine.calls.find((c) => c[0] === 'startGroupCall');
        assert.ok(dial && dial[1].groupJid === '99@g.us');
        assert.deepEqual(dial[1].pnUserJids, ['62812@s.whatsapp.net', '62813@s.whatsapp.net']);
        voip.disconnect();
    });
    it('call links delegate', async () => {
        const sock = makeMockSock();
        const engine = makeMockEngine();
        const voip = await attachVoip(sock, { engine });
        assert.deepEqual(voip.previewCallLink('tok123'), { ok: true });
        voip.joinCallLink();
        assert.ok(engine.calls.some((c) => c[0] === 'joinCallLink'));
        voip.disconnect();
    });
});

describe('VoIP recovery (mocked engine)', () => {
    it('recoverCall resends rekey + offer, getStats works', async () => {
        const sock = makeMockSock();
        const engine = makeMockEngine();
        const voip = await attachVoip(sock, { engine });
        sock.ws.emit('CB:call', offerNode('CALL9', '123@s.whatsapp.net'));
        await tick();
        await voip.answerCall('CALL9');
        const out = await voip.recoverCall({});
        assert.deepEqual(out, { rekey: true, offer: true });
        const stats = voip.getStats();
        assert.equal(stats.busy, true);
        assert.equal(stats.call.state, 6);
        assert.ok(stats.relay && typeof stats.relay.openConnections === 'number');
        voip.disconnect();
    });
    it('watchdog emits call-degraded on dead relay', async () => {
        const sock = makeMockSock();
        const engine = makeMockEngine();
        const voip = await attachVoip(sock, { engine, watchdogIntervalMs: 10, watchdogMaxSilent: 2 });
        let degraded = 0;
        voip.on('call-degraded', () => { degraded += 1; });
        sock.ws.emit('CB:call', offerNode('CALLW', '123@s.whatsapp.net'));
        await tick();
        await voip.answerCall('CALLW');
        await tick(120);
        assert.ok(degraded >= 1, 'expected call-degraded');
        assert.ok(engine.calls.some((c) => c[0] === 'resendRekey'), 'expected auto recovery');
        voip.disconnect();
    });
    it('socket close ends the call', async () => {
        const sock = makeMockSock();
        const voip = await attachVoip(sock, { engine: makeMockEngine() });
        sock.ws.emit('CB:call', offerNode('CALLZ', '123@s.whatsapp.net'));
        await tick();
        await voip.answerCall('CALLZ');
        assert.equal(voip.isBusy(), true);
        sock.ev.emit('connection.update', { connection: 'close' });
        assert.equal(voip.isBusy(), false);
        voip.disconnect();
    });
});
