// Tests for v2.4.6 pairing-code diagnostics/suggest + protocol-capture upgrades.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import EventEmitter from 'node:events';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    PAIRING_CODE_ALPHABET,
    isValidPairingCode,
    describePairingCodeIssues,
    suggestPairingCode,
    PAIRING_LOOKALIKE_MAP
} from '../lib/Utils/pairing-tools.js';
import { captureEventStream, redactEventData, readAndEmitEventStream } from '../lib/Utils/baileys-event-stream.js';

test('describePairingCodeIssues accepts O/U/I/0 and flags only symbols/length', () => {
    // O, U, I and 0 are all valid — WhatsApp does not restrict the alphabet.
    const ok = describePairingCodeIssues('OUIJ-BOU0');
    assert.equal(ok.ok, true);
    assert.equal(ok.code, 'OUIJBOU0');
    assert.equal(ok.invalid.length, 0);

    // only non-alphanumeric characters are disallowed
    const bad = describePairingCodeIssues('JAP@COD!');
    assert.equal(bad.ok, false);
    assert.equal(bad.code, null);
    assert.deepEqual(bad.invalid.map((v) => v.char), ['@', '!']);
    assert.match(bad.message, /disallowed character\(s\): @, ! \(only A-Z and 0-9 are allowed\)/);

    const short = describePairingCodeIssues('ABC');
    assert.equal(short.ok, false);
    assert.match(short.message, /length is 3, must be 8/);
});

test('suggestPairingCode always yields a valid 8-char code', () => {
    // default: no substitution — alphanumeric kept as-is, symbols dropped, padded.
    const out = suggestPairingCode('OU-IJ@B', { random: () => 0 });
    assert.equal(out.length, 8);
    assert.equal(isValidPairingCode(out), true);
    assert.ok(out.startsWith('OUIJB'), `got ${out}`); // O/U/I preserved, '@' dropped

    // padding uses the generation alphabet (Crockford, index 0 = '1')
    const padded = suggestPairingCode('AB', { random: () => 0 });
    assert.equal(padded.slice(0, 2), 'AB');
    assert.equal(padded[2], PAIRING_CODE_ALPHABET[0]);

    // optional look-alike map can de-ambiguate for human-readable codes
    const mapped = suggestPairingCode('OO', { map: PAIRING_LOOKALIKE_MAP, random: () => 0 });
    assert.equal(mapped.slice(0, 2), '00'); // O→0 via the optional map
    assert.equal(isValidPairingCode(mapped), true);
});

test('redactEventData masks secret-bearing fields but keeps plain data', () => {
    const red = redactEventData({
        connection: 'open',
        creds: { noiseKey: { private: Buffer.from([1, 2]) }, registrationId: 42, signedIdentityKey: 'x', me: { id: '1@s.whatsapp.net' } }
    });
    assert.equal(red.connection, 'open');
    assert.equal(red.creds.noiseKey, '[redacted]');
    assert.equal(red.creds.signedIdentityKey, '[redacted]');
    assert.equal(red.creds.registrationId, 42);
    assert.equal(red.creds.me.id, '1@s.whatsapp.net');
});

test('captureEventStream redacts, filters, replays, and stop() unpatches', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'v246-capture-'));
    try {
        const file = join(dir, 'events.ndjson');
        const ev = new EventEmitter();
        const original = ev.emit;
        const cap = captureEventStream(ev, file, { events: 'connection.update' });

        ev.emit('connection.update', { connection: 'open', creds: { noiseKey: 'SECRET' } });
        ev.emit('messages.upsert', { messages: [] }); // filtered out
        await new Promise((r) => setTimeout(r, 30));

        // stop restores the original emit
        cap.stop();
        assert.equal(ev.emit, original);
        ev.emit('connection.update', { connection: 'close' }); // not captured after stop
        await new Promise((r) => setTimeout(r, 20));

        const written = await readFile(file, 'utf-8');
        const lines = written.trim().split('\n');
        assert.equal(lines.length, 1); // only the one connection.update, message filtered, post-stop ignored
        const rec = JSON.parse(lines[0]);
        assert.equal(rec.event, 'connection.update');
        assert.equal(rec.data.connection, 'open');
        assert.equal(rec.data.creds.noiseKey, '[redacted]'); // secret masked on disk

        // replay still works
        const replay = readAndEmitEventStream(file);
        const seen = [];
        replay.ev.on('connection.update', (d) => seen.push(d));
        await replay.task;
        assert.equal(seen.length, 1);
        assert.equal(seen[0].connection, 'open');
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
