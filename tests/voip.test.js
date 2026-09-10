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
