import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import {
    makeWASocket, initAuthCreds, useMultiFileAuthState, BufferJSON,
    encodeBinaryNode, decodeBinaryNode, generateWAMessage, proto,
    DisconnectReason, formatPairingCode,
} from '../lib/index.js';

// WhatsApp integration suite: exercises whole subsystems end-to-end the way
// a real bot composes them — socket construction + pairing, the binary node
// wire codec, message generation → protobuf wire round-trips, and auth-state
// persistence — all offline (the ws never connects in the sandbox).

const silent = pino({ level: 'silent' });
const inMemKeys = () => {
    const store = {};
    return {
        get: async (type, ids) => {
            const out = {};
            for (const id of ids) if (store[`${type}:${id}`]) out[id] = store[`${type}:${id}`];
            return out;
        },
        set: async (data) => {
            for (const [type, byId] of Object.entries(data)) {
                for (const [id, val] of Object.entries(byId)) store[`${type}:${id}`] = val;
            }
        },
    };
};

const makeSock = () => {
    const sock = makeWASocket({
        auth: { creds: initAuthCreds(), keys: inMemKeys() },
        logger: silent,
        printQRInTerminal: false,
    });
    sock.ws?.on?.('error', () => {}); // sandbox: connection always fails late
    return sock;
};

describe('integration: pairing code flow', () => {
    it('random pairing code: 8-char Crockford, creds staged, creds.update fired', async () => {
        const sock = makeSock();
        let update = null;
        sock.ev.on('creds.update', (c) => { update = c; });
        try {
            // sendNode fails offline ("Connection Closed") — everything before
            // the network write must already have happened by then
            await sock.requestPairingCode('62812345678').catch(() => {});
            const code = sock.authState.creds.pairingCode;
            assert.match(code, /^[1-9A-HJ-NP-TV-Z]{8}$/, 'WA Crockford alphabet (no 0/I/O/U), 8 chars');
            assert.equal(sock.authState.creds.me?.id, '62812345678@s.whatsapp.net', 'phone staged as me.id');
            assert.ok(update, 'creds.update emitted so auth stores persist the code');
            assert.equal(update.pairingCode, code);
            // and it formats for display the way WA shows it
            assert.equal(formatPairingCode(code), `${code.slice(0, 4)}-${code.slice(4)}`);
        } finally {
            await sock.end();
        }
    });

    it('custom pairing code: accepted at exactly 8 chars, rejected otherwise', async () => {
        const sock = makeSock();
        try {
            await assert.rejects(sock.requestPairingCode('62812345678', 'ABC'), /exactly 8 chars/);
            await assert.rejects(sock.requestPairingCode('62812345678', 'ABCDEFGHI'), /exactly 8 chars/);
            await sock.requestPairingCode('62812345678', 'JAPJAP12').catch((e) => {
                // offline network failure is fine; a validation error is not
                assert.doesNotMatch(String(e.message), /8 chars/);
            });
            assert.equal(sock.authState.creds.pairingCode, 'JAPJAP12', 'custom code stored verbatim');
        } finally {
            await sock.end();
        }
    });
});

describe('integration: binary node wire codec', () => {
    it('encode → decode round-trips a nested iq with binary content', async () => {
        const node = {
            tag: 'iq',
            attrs: { to: 's.whatsapp.net', type: 'set', xmlns: 'md', id: 'round-1' },
            content: [{
                tag: 'link_code_companion_reg',
                attrs: { stage: 'companion_hello' },
                content: [{ tag: 'blob', attrs: {}, content: new Uint8Array([1, 2, 250, 255]) }],
            }],
        };
        const buf = encodeBinaryNode(node);
        assert.ok(buf.length > 0);
        const dec = await decodeBinaryNode(buf);
        assert.equal(dec.tag, 'iq');
        assert.deepEqual(dec.attrs, node.attrs);
        const reg = dec.content[0];
        assert.equal(reg.tag, 'link_code_companion_reg');
        assert.equal(reg.attrs.stage, 'companion_hello');
        assert.deepEqual([...reg.content[0].content], [1, 2, 250, 255]);
    });

    it('round-trips jid attrs and dictionary-token tags byte-identically', async () => {
        const node = {
            tag: 'message',
            attrs: { to: '628123456789@s.whatsapp.net', type: 'text', id: '3EB0ABCDEF' },
            content: [{ tag: 'enc', attrs: { v: '2', type: 'pkmsg' }, content: new Uint8Array(32).fill(7) }],
        };
        const once = encodeBinaryNode(node);
        const twice = encodeBinaryNode(await decodeBinaryNode(once));
        assert.deepEqual(Buffer.from(twice), Buffer.from(once), 'codec is stable across a round-trip');
    });
});

describe('integration: message pipeline → protobuf wire', () => {
    const OPTS = { userJid: '627000000000@s.whatsapp.net' };

    it('text message survives generate → encode → decode intact', async () => {
        const m = await generateWAMessage('628@s.whatsapp.net', {
            text: 'halo dari suite integrasi 🇮🇩',
        }, OPTS);
        const wire = proto.WebMessageInfo.encode(m).finish();
        const back = proto.WebMessageInfo.decode(wire);
        assert.equal(back.key.remoteJid, '628@s.whatsapp.net');
        assert.equal(back.key.fromMe, true);
        const text = back.message.extendedTextMessage?.text ?? back.message.conversation;
        assert.equal(text, 'halo dari suite integrasi 🇮🇩');
        assert.ok(Number(back.messageTimestamp) > 0);
    });

    it('reply context (quoted message) survives the wire', async () => {
        const quoted = await generateWAMessage('628@s.whatsapp.net', { text: 'original' }, OPTS);
        const m = await generateWAMessage('628@s.whatsapp.net', { text: 'balasan' }, {
            ...OPTS, quoted,
        });
        const back = proto.WebMessageInfo.decode(proto.WebMessageInfo.encode(m).finish());
        const ctx = back.message.extendedTextMessage.contextInfo;
        assert.equal(ctx.stanzaId, quoted.key.id);
        assert.equal(ctx.quotedMessage.extendedTextMessage?.text ?? ctx.quotedMessage.conversation, 'original');
    });

    it('every generated message id is unique and WA-shaped', async () => {
        const ids = new Set();
        for (let i = 0; i < 50; i += 1) {
            const m = await generateWAMessage('628@s.whatsapp.net', { text: `n${i}` }, OPTS);
            assert.match(m.key.id, /^[0-9A-F]{6,}$/i);
            ids.add(m.key.id);
        }
        assert.equal(ids.size, 50, 'no id collisions in 50 messages');
    });
});

describe('integration: auth state persistence', () => {
    it('multi-file auth state survives a save/load cycle with buffers intact', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'jap-auth-'));
        try {
            const first = await useMultiFileAuthState(dir);
            const original = first.state.creds;
            original.pairingCode = 'JAPJAP12'; // simulate mid-pairing state
            await first.saveCreds();

            const second = await useMultiFileAuthState(dir);
            const restored = second.state.creds;
            assert.equal(restored.pairingCode, 'JAPJAP12');
            assert.ok(Buffer.isBuffer(restored.noiseKey.private) || restored.noiseKey.private instanceof Uint8Array);
            assert.deepEqual(
                Buffer.from(restored.noiseKey.private),
                Buffer.from(original.noiseKey.private),
                'key material identical after reload'
            );
            assert.deepEqual(
                Buffer.from(restored.signedIdentityKey.public),
                Buffer.from(original.signedIdentityKey.public)
            );
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('BufferJSON round-trips creds through plain JSON', () => {
        const creds = initAuthCreds();
        const json = JSON.stringify(creds, BufferJSON.replacer);
        const back = JSON.parse(json, BufferJSON.reviver);
        assert.deepEqual(Buffer.from(back.noiseKey.private), Buffer.from(creds.noiseKey.private));
        assert.equal(back.registrationId, creds.registrationId);
    });

    it('a socket built from restored creds still works (construct + pairing staging)', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'jap-auth2-'));
        try {
            const boot = await useMultiFileAuthState(dir);
            await boot.saveCreds();
            const { state } = await useMultiFileAuthState(dir);
            const sock = makeWASocket({ auth: state, logger: silent, printQRInTerminal: false });
            sock.ws?.on?.('error', () => {});
            await sock.requestPairingCode('62811111111').catch(() => {});
            assert.match(sock.authState.creds.pairingCode, /^[1-9A-HJ-NP-TV-Z]{8}$/);
            await sock.end();
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

describe('integration: connection lifecycle events', () => {
    it('end() surfaces a close update with the reason error', async () => {
        const sock = makeSock();
        const closed = new Promise((resolve) => {
            sock.ev.on('connection.update', (u) => {
                if (u.connection === 'close') resolve(u);
            });
        });
        await sock.end(Object.assign(new Error('bye'), {
            output: { statusCode: DisconnectReason.connectionClosed },
        }));
        const update = await closed;
        assert.equal(update.connection, 'close');
        assert.equal(update.lastDisconnect?.error?.message, 'bye');
    });
});
