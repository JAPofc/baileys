import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { VoipClient, attachVoip } from '../lib/VoIP/index.js';

// End-to-end VoIP coverage on injected fakes (config.engine / config.relay):
// the full outbound call() pipeline, the watchdog recovery budget added by
// the "improve VoIP call recovery" fix, and the recoverCall engine guard.
// No network, no wasm — every seam the real stack uses is faked at the same
// interface the production code calls.

const PEER_PN = '628123456789@s.whatsapp.net';
const PEER_LID = '111222333@lid';

const makeFullSock = () => {
    const ws = new EventEmitter();
    const ev = new EventEmitter();
    const queries = [];
    return {
        ws, ev, queries,
        authState: {
            creds: { me: { id: '627000000000:3@s.whatsapp.net', lid: '999888777@lid' } },
            keys: {
                // ensureTcToken() reads the cached token from here — return one
                // for whatever jid is asked so call() never needs the network.
                get: async (type, jids) => {
                    if (type !== 'tctoken') return {};
                    const out = {};
                    for (const j of jids) out[j] = { token: Buffer.from('tok-' + j), timestamp: '1' };
                    return out;
                },
                set: async () => ({}),
            },
        },
        generateMessageTag: () => 'e2e-tag',
        query: async (node) => { queries.push(node); return {}; },
        sendNode: async () => ({}),
        waitForMessage: async () => null,
        presenceSubscribe: async () => {},
        getUSyncDevices: async () => [{ jid: PEER_LID }, { jid: '111222333:12@lid' }],
        rejectCall: async () => {},
        sendMessage: async () => ({}),
        signalRepository: {
            lidMapping: { getLIDForPN: async (pn) => (pn === PEER_PN ? PEER_LID : null) },
            jidToSignalProtocolAddress: (j) => j,
            validateSession: async () => ({ exists: true }), // skip the encrypt iq path
            decryptMessage: async () => { throw new Error('no session'); },
            encryptMessage: async () => ({ type: 'msg', ciphertext: new Uint8Array(1) }),
        },
    };
};

const makeEngine = () => {
    const calls = [];
    const rec = (name) => (...args) => { calls.push([name, ...args]); };
    return {
        calls,
        initialize: async () => {}, initVoipStack: () => {}, waitForVoipStackReady: async () => {},
        updateNetworkMedium: () => {}, destroy: () => {},
        startCall: rec('startCall'), endCall: rec('endCall'), setMute: () => 0,
        acceptCall: rec('acceptCall'),
        resendOfferOnDecryptionFailure: rec('resendOffer'), resendEncRekeyRetry: rec('resendRekey'),
        getCallInfo: () => ({ state: 6 }),
        handleSignalingOffer: rec('offer'), handleSignalingMessage: rec('msg'),
        handleSignalingAck: rec('ack'), handleSignalingReceipt: rec('receipt'),
        handleOnTransportMessage: () => {}, updateIceRtt: () => {},
    };
};

// Relay whose health the test script controls tick by tick.
const makeRelay = (openConnections = 0) => {
    const relay = {
        openConnections,
        getStats: () => ({ openConnections: relay.openConnections }),
        send: () => {}, closeAll: () => {},
    };
    return relay;
};

const offerNode = (callId, from) => ({
    tag: 'call', attrs: { from }, content: [{
        tag: 'offer', attrs: { 'call-id': callId, platform: '0', version: '1', e: '0', t: '1' }, content: undefined,
    }],
});
const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));

describe('VoIP e2e: outbound call() pipeline', () => {
    it('drives the full LID→devices→sessions→tctoken→startCall flow', async () => {
        const sock = makeFullSock();
        const engine = makeEngine();
        const voip = await attachVoip(sock, { engine, relay: makeRelay(1) });

        let outgoing = null;
        voip.on('outgoing-call', (o) => { outgoing = o; });

        const call = await voip.call('+62 812-3456-789', { durationMs: 0 });

        // engine got a fully-resolved dial
        const dial = engine.calls.find((c) => c[0] === 'startCall');
        assert.ok(dial, 'engine.startCall must be invoked');
        const args = dial[1];
        assert.equal(args.peerJid, PEER_LID, 'dial targets the resolved LID');
        assert.equal(args.peerPn, PEER_PN, 'PN jid built from digits only');
        assert.equal(args.isLidCall, true);
        assert.ok(args.peerList.includes(PEER_LID), 'device list includes discovered devices');
        assert.ok(Buffer.isBuffer(args.extraData) || args.extraData instanceof Uint8Array, 'tctoken passed as extraData');

        // call id format: 32 uppercase hex chars starting "00"
        assert.match(args.callId, /^00[0-9A-F]{30}$/);
        assert.equal(call.callId, args.callId);
        assert.equal(call.direction, 'outbound');

        // events + state
        assert.ok(outgoing && outgoing.to === PEER_PN);
        assert.equal(voip.isBusy(), true);
        assert.equal(voip.getActiveCall(), call);

        // the tctoken privacy iq was issued through the socket
        assert.ok(sock.queries.some((q) => q.tag === 'iq' && q.attrs?.xmlns === 'privacy'), 'issueTcToken iq sent');

        // a second dial while busy must refuse
        await assert.rejects(voip.call('628999'), /already active/);

        call._forceEnd('test');
        assert.equal(voip.isBusy(), false, 'slot released on end');
        voip.disconnect();
    });

    it('fails loudly when the peer LID cannot be resolved', async () => {
        const sock = makeFullSock();
        sock.signalRepository.lidMapping.getLIDForPN = async () => null;
        const voip = await attachVoip(sock, { engine: makeEngine(), relay: makeRelay(1) });
        await assert.rejects(voip.call('628123456789'), /Could not resolve LID/);
        assert.equal(voip.isBusy(), false);
        voip.disconnect();
    });
});

describe('VoIP e2e: watchdog recovery budget', () => {
    it('bounded recoveries → call-unrecoverable → force-end', async () => {
        const sock = makeFullSock();
        const engine = makeEngine();
        const relay = makeRelay(0); // dead from the start
        const voip = await attachVoip(sock, {
            engine, relay,
            watchdogIntervalMs: 10, watchdogMaxSilent: 1, watchdogMaxRecoveries: 2,
        });

        const degraded = [];
        let unrecoverable = null;
        let endedReason = null;
        voip.on('call-degraded', (d) => degraded.push(d));
        voip.on('call-unrecoverable', (u) => { unrecoverable = u; });
        voip.on('call-ended', ({ reason }) => { endedReason = reason; });

        sock.ws.emit('CB:call', offerNode('E2E-BUDGET', PEER_PN));
        await tick();
        await voip.answerCall('E2E-BUDGET');

        await tick(150); // several watchdog ticks on a dead relay

        // budget of 2: attempts 1 and 2 recover, attempt 3 crosses the budget
        assert.ok(degraded.length >= 3, `expected >=3 call-degraded, got ${degraded.length}`);
        assert.deepEqual(
            degraded.slice(0, 3).map((d) => d.attempt), [1, 2, 3],
            'degraded events carry a monotonically increasing attempt counter'
        );
        assert.ok(degraded.every((d) => d.maxRecoveries === 2 && d.callId === 'E2E-BUDGET'));
        assert.ok(unrecoverable && unrecoverable.callId === 'E2E-BUDGET', 'call-unrecoverable fired');
        assert.equal(endedReason, 'unrecoverable', 'call force-ended with reason unrecoverable');
        assert.equal(voip.isBusy(), false, 'slot released after unrecoverable');
        // recovery actually re-sent rekey+offer while budget lasted
        assert.ok(engine.calls.some((c) => c[0] === 'resendRekey'));
        assert.ok(engine.calls.some((c) => c[0] === 'resendOffer'));
        voip.disconnect();
    });

    it('a healthy relay resets the budget (flaky network never exhausts it)', async () => {
        const sock = makeFullSock();
        const relay = makeRelay(0);
        const voip = await attachVoip(sock, {
            engine: makeEngine(), relay,
            // budget generous enough that the first outage below can never
            // exhaust it — the point is testing the reset, not the cutoff
            watchdogIntervalMs: 10, watchdogMaxSilent: 1, watchdogMaxRecoveries: 100,
        });

        const degraded = [];
        let unrecoverable = false;
        voip.on('call-degraded', (d) => degraded.push(d));
        voip.on('call-unrecoverable', () => { unrecoverable = true; });

        sock.ws.emit('CB:call', offerNode('E2E-FLAKY', PEER_PN));
        await tick();
        await voip.answerCall('E2E-FLAKY');

        await tick(35);            // a couple of dead ticks → attempt(s) burned
        assert.ok(degraded.length >= 1, 'went degraded while relay was dead');
        relay.openConnections = 1; // network comes back
        await tick(50);            // healthy ticks must reset the budget
        const afterRecovery = degraded.length;
        relay.openConnections = 0; // dies again
        await tick(50);

        const secondOutage = degraded.slice(afterRecovery);
        assert.ok(secondOutage.length >= 1, 'second outage detected');
        assert.equal(secondOutage[0].attempt, 1, 'budget restarted at 1 after a healthy period');
        assert.equal(unrecoverable, false, 'flaky-but-recovering call never declared unrecoverable');
        assert.equal(voip.isBusy(), true, 'call still alive');
        voip.disconnect();
    });

    it('watchdog stops itself when the call ends cleanly', async () => {
        const sock = makeFullSock();
        const relay = makeRelay(0);
        const voip = await attachVoip(sock, {
            engine: makeEngine(), relay,
            watchdogIntervalMs: 10, watchdogMaxSilent: 1, watchdogMaxRecoveries: 50,
        });
        let degradedAfterEnd = 0;
        sock.ws.emit('CB:call', offerNode('E2E-END', PEER_PN));
        await tick();
        const call = await voip.answerCall('E2E-END');
        call._forceEnd('test');
        voip.on('call-degraded', () => { degradedAfterEnd += 1; });
        await tick(60);
        assert.equal(degradedAfterEnd, 0, 'no watchdog activity after the call ended');
        voip.disconnect();
    });
});

describe('VoIP e2e: recoverCall guard rails', () => {
    it('throws without an engine instead of reporting a fake success', async () => {
        const voip = new VoipClient({});
        await assert.rejects(
            voip.recoverCall({ peerJid: PEER_LID, callId: 'X' }),
            /engine not connected/,
            'disconnected client must not pretend recovery worked'
        );
    });
    it('throws without any peer on record', async () => {
        const sock = makeFullSock();
        const voip = await attachVoip(sock, { engine: makeEngine(), relay: makeRelay(1) });
        await assert.rejects(voip.recoverCall({}), /needs a peer/);
        voip.disconnect();
    });
    it('manual recoverCall resends rekey + offer for the active call', async () => {
        const sock = makeFullSock();
        const engine = makeEngine();
        const voip = await attachVoip(sock, { engine, relay: makeRelay(1) });
        sock.ws.emit('CB:call', offerNode('E2E-REC', PEER_PN));
        await tick();
        await voip.answerCall('E2E-REC');
        const events = [];
        voip.on('call-recovery', (e) => events.push(e));
        const out = await voip.recoverCall({});
        assert.deepEqual(out, { rekey: true, offer: true });
        assert.equal(events.length, 1);
        assert.equal(events[0].callId, 'E2E-REC');
        voip.disconnect();
    });
});
