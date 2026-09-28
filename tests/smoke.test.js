import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pino from 'pino';
import { makeWASocket, initAuthCreds } from '../lib/index.js';

// Guards the whole socket wrapper chain: a scoping/typo bug in ANY layer
// (e.g. the username.js `reserveUsername` ReferenceError that broke every
// single makeWASocket() call) fails here instead of in production.
describe('smoke: makeWASocket construct + end', () => {
    it('constructs with in-memory auth, exposes layers, ends cleanly', async () => {
        const keys = { get: async () => ({}), set: async () => {} };
        const sock = makeWASocket({
            auth: { creds: initAuthCreds(), keys },
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false
        });
        // socket wrapper chain is intact (username layer regression)
        for (const fn of [
            'end', 'logout', 'query',
            'checkUsername', 'checkUsernameMulti', 'setUsername', 'reserveUsername',
            'deleteUsername', 'getMyUsername', 'setUsernamePin',
            'findUserByUsername', 'fetchContactUsernames', 'getUsernameRecommendations'
        ]) {
            assert.equal(typeof sock[fn], 'function', `sock.${fn} must be a function`);
        }
        // never crash the runner on late network errors after end()
        sock.ws?.on?.('error', () => {});
        await sock.end();
    });
});
