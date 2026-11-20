// §2.105 real ffmpeg transcoding paths + §2.106 peer messages.
//
// The ffmpeg half runs only where a real binary is available (FFMPEG_PATH / ffmpeg-static /
// PATH); it is skipped, not failed, otherwise — the rest of the suite must stay portable.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveFfmpegPath } from '../lib/Utils/ffmpeg-path.js';
import { extractVideoThumb, generateThumbnail } from '../lib/Utils/messages-media.js';
import { videoToJpeg, convertToOpusBuffer, getAudioDuration } from '../lib/index.js';

const ffmpeg = await resolveFfmpegPath().catch(() => null);
const isJpeg = buf => Buffer.isBuffer(buf) && buf.length > 2 && buf[0] === 0xff && buf[1] === 0xd8;

describe('§2.105 real ffmpeg transcoding', { skip: ffmpeg ? false : 'no ffmpeg binary available' }, () => {
	const dir = mkdtempSync(join(tmpdir(), 'jap-ffmpeg-'));
	const short = join(dir, 'short.mp4');
	const long = join(dir, 'long.mp4');
	const wav = join(dir, 'tone.wav');
	const make = (args) => execFileSync(ffmpeg, ['-y', ...args], { stdio: 'ignore' });
	make(['-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=10', '-t', '0.8', short]);
	make(['-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=10', '-t', '3', long]);
	make(['-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '1', wav]);

	test('a clip shorter than the seek point still yields a frame', async () => {
		const thumb = await extractVideoThumb(short, '00:00:01', { width: 320, height: -1 });
		assert.ok(isJpeg(thumb), `expected a JPEG, got ${thumb.length} bytes`);
	});

	test('a normal clip is unaffected, and an explicit seek is honoured', async () => {
		assert.ok(isJpeg(await extractVideoThumb(long, '00:00:01', { width: 320, height: -1 })));
		assert.ok(isJpeg(await extractVideoThumb(long, '00:00:02', { width: 160, height: -1 })));
		assert.ok(isJpeg(await extractVideoThumb(long, 0, { width: 320, height: -1 })));
	});

	test('a file ffmpeg cannot decode raises instead of returning an empty buffer', async () => {
		const bogus = join(dir, 'bogus.mp4');
		execFileSync('bash', ['-c', `printf 'not a video' > ${bogus}`]);
		await assert.rejects(() => extractVideoThumb(bogus, '00:00:01', { width: 320, height: -1 }));
	});

	test('videoToJpeg accepts a Buffer and cleans up after itself', async () => {
		const out = await videoToJpeg(readFileSync(short));
		assert.ok(isJpeg(Buffer.from(out)));
	});

	test('generateThumbnail produces a usable preview for a short video', async () => {
		const { thumbnail } = await generateThumbnail(short, 'video', {});
		assert.ok(thumbnail, 'no thumbnail produced');
		assert.ok(isJpeg(Buffer.from(thumbnail, typeof thumbnail === 'string' ? 'base64' : undefined)));
	});

	test('convertToOpusBuffer really produces an Ogg/Opus voice note', async () => {
		const res = await convertToOpusBuffer(readFileSync(wav));
		assert.equal(res.mimetype, 'audio/ogg; codecs=opus');
		assert.equal(res.ptt, true);
		assert.ok(res.buffer.length > 1000);
		assert.equal(res.buffer.subarray(0, 4).toString(), 'OggS');
	});

	test('getAudioDuration reads the real duration', async () => {
		const seconds = await getAudioDuration(readFileSync(wav));
		assert.ok(seconds >= 0.5 && seconds <= 1.5, `unexpected duration ${seconds}`);
	});

	test.after?.(() => rmSync(dir, { recursive: true, force: true }));
});

// ---------------------------------------------------------------- §2.106
const makeSendPeer = async () => {
	const { readFileSync: read } = await import('node:fs');
	const src = read(new URL('../lib/Socket/messages-send.js', import.meta.url), 'utf8');
	const start = src.indexOf('    const sendPeerMessage = async (protocolContent');
	const end = src.indexOf('\n    const createParticipantNodes', start);
	const body = src.slice(start, end);
	const { Boom } = await import('@hapi/boom');
	const { proto } = await import('../WAProto/index.js');
	const { jidNormalizedUser } = await import('../lib/WABinary/index.js');
	const relayed = [];
	const relayMessage = async (jid, content, options) => {
		relayed.push({ jid, content, options });
		return 'MSGID';
	};
	const scope = new Function('Boom', 'proto', 'jidNormalizedUser', 'authState', 'relayMessage',
		`${body}\nreturn { sendPeerMessage, sendPeerDataOperationMessage, requestAppStateKeyResync }`
	)(Boom, proto, jidNormalizedUser, { creds: { me: { id: '62811:3@s.whatsapp.net' } } }, relayMessage);
	return { ...scope, relayed };
};

test('§2.106 sendPeerMessage relays a protocolMessage to your own jid', async () => {
	const { sendPeerMessage, relayed } = await makeSendPeer();
	const id = await sendPeerMessage({ type: 1 });
	assert.equal(id, 'MSGID');
	assert.equal(relayed[0].jid, '62811@s.whatsapp.net', 'peer messages go to your own normalized jid');
	assert.deepEqual(relayed[0].options.additionalAttributes, { category: 'peer', push_priority: 'high_force' });
	assert.deepEqual(relayed[0].options.additionalNodes, [{ tag: 'meta', attrs: { appdata: 'default' } }]);
	assert.deepEqual(relayed[0].content, { protocolMessage: { type: 1 } });

	await sendPeerMessage({ type: 2 }, { pushPriority: 'low', appdata: 'critical_block', additionalNodes: [{ tag: 'x', attrs: {} }] });
	assert.equal(relayed[1].options.additionalAttributes.push_priority, 'low');
	assert.deepEqual(relayed[1].options.additionalNodes, [{ tag: 'x', attrs: {} }]);

	await assert.rejects(() => sendPeerMessage(null), /pass the protocolMessage/);
});

test('§2.106 PDO still goes out exactly as before', async () => {
	const { sendPeerDataOperationMessage, relayed } = await makeSendPeer();
	await sendPeerDataOperationMessage({ placeholderMessageResendRequest: [{ messageKey: { id: 'A' } }] });
	const { protocolMessage } = relayed[0].content;
	assert.equal(protocolMessage.type, 16 /* PEER_DATA_OPERATION_REQUEST_MESSAGE */);
	assert.ok(protocolMessage.peerDataOperationRequestMessage);
	assert.equal(relayed[0].options.additionalAttributes.category, 'peer');
});

test('§2.106 requestAppStateKeyResync normalises every key-id shape', async () => {
	const { requestAppStateKeyResync, relayed } = await makeSendPeer();
	const raw = Buffer.from([1, 2, 3]);
	await requestAppStateKeyResync([raw, { keyId: Buffer.from([4]) }, raw.toString('base64')]);
	const { protocolMessage } = relayed[0].content;
	assert.equal(protocolMessage.type, 7 /* APP_STATE_SYNC_KEY_REQUEST */);
	assert.deepEqual(protocolMessage.appStateSyncKeyRequest.keyIds.map(k => [...k.keyId]), [[1, 2, 3], [4], [1, 2, 3]]);
	await assert.rejects(() => requestAppStateKeyResync([]), /at least one key id/);
});
