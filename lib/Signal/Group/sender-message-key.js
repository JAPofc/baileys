import { deriveSecrets } from 'libsignal/src/crypto.js';
export class SenderMessageKey {
    constructor(iteration, seed) {
        // JAP@Fix (§2.110): sender-key records are persisted with a plain `JSON.stringify`, so
        // every seed comes back out of the store as `{ type: 'Buffer', data: [...] }`.
        // `SenderChainKey` wraps its seed in `Buffer.from()` and survives that; this class did
        // not, so the moment a *skipped* message key was replayed from the record -- i.e. any
        // out-of-order or retransmitted group message -- libsignal threw
        // "Expected Buffer instead of: Object" and the message was lost for good.
        seed = Buffer.isBuffer(seed) ? seed : Buffer.from(seed);
        const derivative = deriveSecrets(seed, Buffer.alloc(32), Buffer.from('WhisperGroup'));
        const keys = new Uint8Array(32);
        keys.set(new Uint8Array(derivative[0].slice(16)));
        keys.set(new Uint8Array(derivative[1].slice(0, 16)), 16);
        this.iv = Buffer.from(derivative[0].slice(0, 16));
        this.cipherKey = Buffer.from(keys.buffer);
        this.iteration = iteration;
        this.seed = seed;
    }
    getIteration() {
        return this.iteration;
    }
    getIv() {
        return this.iv;
    }
    getCipherKey() {
        return this.cipherKey;
    }
    getSeed() {
        return this.seed;
    }
}
