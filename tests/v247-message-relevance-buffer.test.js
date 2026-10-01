/**
 * tests/v247-message-relevance-buffer.test.js — batch V (v2.4.7)
 *
 * Covers BUGREPORT §2.57–§2.58: the chat-list test whose stub-type allowances could never
 * fire, and the event buffer that swallowed a chat-wide delete.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import P from 'pino';

import { proto } from '../WAProto/index.js';
import { makeEventBuffer } from '../lib/Utils/event-buffer.js';
import { isRealMessage, shouldIncrementChatUnread } from '../lib/Utils/process-message.js';
import { classifyMessage, isMissedCallMessage, isStubAboutMe, MISSED_CALL_STUB_TYPES } from '../lib/Utils/index.js';

const T = proto.WebMessageInfo.StubType;
const ME = '628111@s.whatsapp.net';
const logger = P({ level: 'silent' });

const stub = (messageStubType, extra = {}) => ({
	key: { remoteJid: '628999@s.whatsapp.net', id: 'S1', fromMe: false },
	messageStubType,
	messageTimestamp: 1,
	...extra
});
const text = (id = 'M1', remoteJid = '628999@s.whatsapp.net') => ({
	key: { remoteJid, id, fromMe: false },
	message: { conversation: 'hi' },
	messageTimestamp: 1
});

describe('§2.57 missed-call stubs count as real messages again', () => {
	it('every missed-call stub type is real (all four used to be false)', () => {
		for (const stubType of [T.CALL_MISSED_VOICE, T.CALL_MISSED_VIDEO, T.CALL_MISSED_GROUP_VOICE, T.CALL_MISSED_GROUP_VIDEO]) {
			assert.equal(isRealMessage(stub(stubType)), true, `stub type ${stubType}`);
		}
	});

	it('a "participant added" stub counts only when it names us', () => {
		const addedMe = stub(T.GROUP_PARTICIPANT_ADD, { messageStubParameters: [ME, '628222@s.whatsapp.net'] });
		const addedSomeoneElse = stub(T.GROUP_PARTICIPANT_ADD, { messageStubParameters: ['628222@s.whatsapp.net'] });
		assert.equal(isRealMessage(addedMe, ME), true);
		assert.equal(isRealMessage(addedSomeoneElse, ME), false);
		assert.equal(isRealMessage(addedSomeoneElse), true, 'without meId the old permissive behaviour is kept');
	});

	it('ordinary content still decides on its own merits', () => {
		assert.equal(isRealMessage(text()), true);
		assert.equal(isRealMessage({ key: { id: 'X' }, message: {} }), false, 'no content type');
		assert.equal(isRealMessage({ key: { id: 'X' } }), false, 'no message at all');
	});

	it('protocol, reaction and poll-update messages are still excluded', () => {
		const wrap = (message) => ({ key: { remoteJid: 'a@s.whatsapp.net', id: 'P1' }, message });
		assert.equal(isRealMessage(wrap({ protocolMessage: { type: 0 } })), false);
		assert.equal(isRealMessage(wrap({ reactionMessage: { text: '👍' } })), false);
		assert.equal(isRealMessage(wrap({ pollUpdateMessage: {} })), false);
	});

	it('an unrelated stub type is still not a real message', () => {
		assert.equal(isRealMessage(stub(T.GROUP_PARTICIPANT_REMOVE)), false);
		assert.equal(isRealMessage(stub(T.GROUP_CHANGE_SUBJECT)), false);
	});

	it('a missed call still does not raise the unread count', () => {
		assert.equal(shouldIncrementChatUnread(stub(T.CALL_MISSED_VOICE)), false, 'stubs never bump unread');
		assert.equal(shouldIncrementChatUnread(text()), true);
	});

	it('processMessage passes meId through', async () => {
		const source = await readFile(new URL('../lib/Utils/process-message.js', import.meta.url), 'utf8');
		assert.match(source, /isRealMessage\(message, meId\)/);
	});
});

describe('classifyMessage() and friends (v2.4.7 upgrade)', () => {
	it('describes a missed call', () => {
		const result = classifyMessage(stub(T.CALL_MISSED_VIDEO), ME);
		assert.deepEqual(result, {
			isReal: true, isStub: true, isMissedCall: true, isAboutMe: false,
			incrementsUnread: false, contentType: undefined
		});
	});

	it('describes an ordinary text message', () => {
		const result = classifyMessage(text(), ME);
		assert.equal(result.isReal, true);
		assert.equal(result.isStub, false);
		assert.equal(result.incrementsUnread, true);
		assert.equal(result.contentType, 'conversation');
	});

	it('flags a stub that names us', () => {
		const added = stub(T.GROUP_PARTICIPANT_ADD, { messageStubParameters: [ME] });
		assert.equal(isStubAboutMe(added, ME), true);
		assert.equal(isStubAboutMe(added, '628222@s.whatsapp.net'), false);
		assert.equal(isStubAboutMe(added), false, 'no meId -> false');
		assert.equal(classifyMessage(added, ME).isAboutMe, true);
	});

	it('exposes the missed-call table and is null-safe', () => {
		assert.equal(MISSED_CALL_STUB_TYPES.length, 4);
		assert.equal(isMissedCallMessage(stub(T.CALL_MISSED_VOICE)), true);
		assert.equal(isMissedCallMessage(text()), false);
		assert.equal(isMissedCallMessage(null), false);
		assert.deepEqual(classifyMessage(null), {
			isReal: false, isStub: false, isMissedCall: false, isAboutMe: false,
			incrementsUnread: false, contentType: undefined
		});
	});
});

describe('§2.58 the event buffer releases chat-wide deletes', () => {
	const collect = () => {
		const seen = [];
		const ev = makeEventBuffer(logger);
		ev.on('messages.delete', (d) => seen.push({ delete: d }));
		ev.on('messages.upsert', (d) => seen.push({ upsert: d.messages.map((m) => m.key.id) }));
		return { ev, seen };
	};
	const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

	it('a buffered "clear chat" is delivered on flush (it used to vanish)', async () => {
		const { ev, seen } = collect();
		ev.buffer();
		ev.emit('messages.delete', { jid: '628999@s.whatsapp.net', all: true });
		ev.flush();
		await settle();
		assert.deepEqual(seen, [{ delete: { jid: '628999@s.whatsapp.net', all: true } }]);
	});

	it('messages buffered before the clear are dropped with it', async () => {
		const { ev, seen } = collect();
		ev.buffer();
		ev.emit('messages.upsert', { type: 'notify', messages: [proto.WebMessageInfo.fromObject(text('M1'))] });
		ev.emit('messages.delete', { jid: '628999@s.whatsapp.net', all: true });
		ev.flush();
		await settle();
		assert.equal(seen.some((e) => e.upsert), false, 'the cleared chat must not also deliver its messages');
		assert.equal(seen.some((e) => e.delete?.all), true);
	});

	it('another chat buffered alongside it is untouched', async () => {
		const { ev, seen } = collect();
		ev.buffer();
		ev.emit('messages.upsert', { type: 'notify', messages: [proto.WebMessageInfo.fromObject(text('K1', '628777@s.whatsapp.net'))] });
		ev.emit('messages.delete', { jid: '628999@s.whatsapp.net', all: true });
		ev.flush();
		await settle();
		assert.deepEqual(seen.find((e) => e.upsert)?.upsert, ['K1']);
		assert.equal(seen.some((e) => e.delete?.all), true);
	});

	it('several cleared chats each produce their own event', async () => {
		const { ev, seen } = collect();
		ev.buffer();
		ev.emit('messages.delete', { jid: 'a@s.whatsapp.net', all: true });
		ev.emit('messages.delete', { jid: 'b@s.whatsapp.net', all: true });
		ev.flush();
		await settle();
		assert.deepEqual(seen.map((e) => e.delete.jid), ['a@s.whatsapp.net', 'b@s.whatsapp.net']);
	});

	it('key-based deletes still work, and coexist with a chat-wide one', async () => {
		const { ev, seen } = collect();
		ev.buffer();
		ev.emit('messages.delete', { keys: [{ remoteJid: '628777@s.whatsapp.net', id: 'K1', fromMe: false }] });
		ev.emit('messages.delete', { jid: '628999@s.whatsapp.net', all: true });
		ev.flush();
		await settle();
		assert.equal(seen.some((e) => e.delete?.all === true), true, 'the chat-wide delete');
		assert.deepEqual(seen.find((e) => e.delete?.keys)?.delete.keys.map((k) => k.id), ['K1'], 'the key delete');
	});

	it('passes straight through when the buffer is closed', async () => {
		const { ev, seen } = collect();
		ev.emit('messages.delete', { jid: '628999@s.whatsapp.net', all: true });
		await settle();
		assert.deepEqual(seen, [{ delete: { jid: '628999@s.whatsapp.net', all: true } }]);
	});

	it('the empty TODO branch is gone', async () => {
		const source = await readFile(new URL('../lib/Utils/event-buffer.js', import.meta.url), 'utf8');
		assert.doesNotMatch(source, /^\s*\/\/ TODO: add support\s*$/m);
		assert.match(source, /data\.messageDeleteAlls\[jid\] = deleteData;/);
	});
});
