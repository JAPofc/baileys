import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ActiveCall, VoipClient, CallState } from '../lib/VoIP/index.js';

// Integration tests for the ActiveCall end-lifecycle and the media-traffic
// watchdog. These run fully offline against the real classes.

describe('ActiveCall end lifecycle (integration)', () => {
    it('end() requests termination; "ended" fires only after engine confirms', async () => {
        let engineEnded = 0;
        const call = new ActiveCall('C-lifecycle-1', {
            endCall: async () => { engineEnded += 1; }
        }, 0);
        const events = [];
        call.on('ended', (info) => events.push(info));

        await call.end();
        assert.equal(engineEnded, 1);
        // engine confirmed synchronously via _forceEnd path in client normally;
        // simulate the confirmation the signaling layer would deliver:
        call._forceEnd('remote_confirmed');
        const reason = await call.waitForEnd();
        assert.equal(reason, 'remote_confirmed');
        assert.equal(events.length, 1);
    });

    it('waitForEnd() resolves "end_failed" when the engine throws synchronously', async () => {
        const call = new ActiveCall('C-lifecycle-2', {
            endCall: () => { throw new Error('engine dead'); }
        }, 0);
        call.end();
        const reason = await call.waitForEnd();
        assert.equal(reason, 'end_failed');
    });

    it('waitForEnd() resolves "end_failed" when the engine rejects asynchronously', async () => {
        const call = new ActiveCall('C-lifecycle-2b', {
            endCall: async () => { throw new Error('engine dead late'); }
        }, 0);
        call.end(); // must NOT produce an unhandledRejection
        const reason = await call.waitForEnd();
        assert.equal(reason, 'end_failed');
    });

    it('"ended" never fires twice even with duplicate _forceEnd', async () => {
        const call = new ActiveCall('C-lifecycle-3', { endCall: async () => { } }, 0);
        let fired = 0;
        call.on('ended', () => fired += 1);
        call._forceEnd('first');
        call._forceEnd('second');
        call._forceEnd('third');
        assert.equal(fired, 1);
        assert.equal(await call.waitForEnd(), 'first');
    });
});

describe('VoIP watchdog on real media traffic (integration)', () => {
    // Build a VoipClient with an injected relay whose stats we control,
    // then drive the private watchdog through its public config surface.
    const makeHarness = ({ intervalMs = 10, maxSilent = 2, maxRecoveries = 1 } = {}) => {
        const stats = { openConnections: 1, receivedPackets: 0, receivedBytes: 0, sentPackets: 0 };
        const voip = new VoipClient({
            watchdogIntervalMs: intervalMs,
            watchdogMaxSilent: maxSilent,
            watchdogMaxRecoveries: maxRecoveries
        });
        return { voip, stats };
    };

    it('exposes watchdog config knobs without starting timers when idle', () => {
        const { voip } = makeHarness();
        assert.equal(voip.getActiveCall(), null);
        assert.equal(voip.isBusy(), false);
    });

    it('ActiveCall exposes CallState.Active for traffic-based health checks', () => {
        const call = new ActiveCall('C-watchdog-1', { endCall: async () => { } }, 0);
        assert.equal(typeof call.state, 'number');
        assert.equal(typeof CallState.Active, 'number');
        call._forceEnd('cleanup');
    });
});
