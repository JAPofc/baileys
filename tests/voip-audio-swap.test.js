import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Mid-call audio source switching: AudioFeeder.swapSource + the
// ActiveCall/VoipClient setAudioSource surface.

describe('AudioFeeder.swapSource', () => {
    it('before start(): stores the source, returns false', async () => {
        const { AudioFeeder } = await import('../lib/VoIP/audio-feeder.js');
        const feeder = new AudioFeeder(16000, 1, 320, () => { }, 'silence');
        assert.equal(feeder.swapSource('./menu.mp3'), false);
        assert.equal(feeder.source, './menu.mp3');
    });

    it('while running: restarts the pipeline with the new source, returns true', async () => {
        const { AudioFeeder } = await import('../lib/VoIP/audio-feeder.js');
        const feeder = new AudioFeeder(16000, 1, 320, () => { }, 'silence');
        feeder.start();
        try {
            await new Promise((r) => setTimeout(r, 200));
            assert.equal(feeder.swapSource('lavfi:sine=frequency=440:duration=1'), true);
            assert.equal(feeder.source, 'lavfi:sine=frequency=440:duration=1');
        } finally {
            feeder.stop();
        }
    });

    it('after stop(): back to storing only, returns false', async () => {
        const { AudioFeeder } = await import('../lib/VoIP/audio-feeder.js');
        const feeder = new AudioFeeder(16000, 1, 320, () => { }, 'silence');
        feeder.start();
        feeder.stop();
        assert.equal(feeder.swapSource('./b.mp3'), false);
    });
});

describe('ActiveCall.setAudioSource', () => {
    const stubEngine = { endCall() { }, setMute() { } };

    it('unwired call: stores the tag, returns false', async () => {
        const { ActiveCall } = await import('../lib/VoIP/index.js');
        const call = new ActiveCall('CALL1', stubEngine, 0);
        assert.equal(call.setAudioSource('./greeting.mp3'), false);
        assert.equal(call._audioSource, './greeting.mp3');
        call.end();
    });

    it('wired call: delegates to the client hook and returns its result', async () => {
        const { ActiveCall } = await import('../lib/VoIP/index.js');
        const call = new ActiveCall('CALL2', stubEngine, 0);
        let got = null;
        call._switchAudioSource = (s) => { got = s; return true; };
        assert.equal(call.setAudioSource('./menu.mp3'), true);
        assert.equal(got, './menu.mp3');
        call.end();
    });
});

describe('VoipClient wiring (source contract)', () => {
    it('every ActiveCall registration wires the mid-call swap hook', async () => {
        const { readFile } = await import('node:fs/promises');
        const src = await readFile(new URL('../lib/VoIP/index.js', import.meta.url), 'utf-8');
        const registrations = (src.match(/this\.#activeCall = call;/g) || []).length;
        const hooks = (src.match(/call\._switchAudioSource = \(source\) => this\.setAudioSource\(source\)/g) || []).length;
        assert.ok(registrations >= 5, `expected >=5 call registrations, got ${registrations}`);
        assert.equal(hooks, registrations, 'every registration wires _switchAudioSource');
        // client-side: throws without an active call, swaps the live feeder when present
        assert.match(src, /setAudioSource: no active call/);
        assert.match(src, /this\.#feeder\.swapSource\(source\)/);
    });

    it('is declared in the type surface', async () => {
        const { readFile } = await import('node:fs/promises');
        const dts = await readFile(new URL('../lib/VoIP/index.d.ts', import.meta.url), 'utf-8');
        const hits = (dts.match(/setAudioSource\(source: string \| \{ data: Buffer; ext\?: string \}\): boolean;/g) || []).length;
        assert.equal(hits, 2, 'ActiveCall + VoipClient both declare setAudioSource');
    });
});
