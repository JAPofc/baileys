import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { analyzeProtocolCaptureFile, bindProtocolCapture, createProtocolCapture, protocolCaptureReport, redactBinaryNode, summarizeBinaryNode } from '../lib/index.js';

test('protocol capture redacts sensitive attrs and summarizes binary nodes', () => {
	const node = {
		tag: 'iq',
		attrs: { id: 'A1', type: 'set', token: 'SECRET', to: 's.whatsapp.net' },
		content: [{ tag: 'native', attrs: { mediaKey: 'KEY' }, content: Buffer.from('hello') }]
	};
	assert.deepEqual(summarizeBinaryNode(node), {
		tag: 'iq', id: 'A1', type: 'set', xmlns: undefined, to: 's.whatsapp.net', from: undefined, childTags: ['native']
	});
	const redacted = redactBinaryNode(node);
	assert.equal(redacted.attrs.token, '[redacted]');
	assert.equal(redacted.content[0].attrs.mediaKey, '[redacted]');
	assert.deepEqual(redacted.content[0].content, { type: 'Buffer', length: 5, sha256: '2cf24dba5fb0a30e' });
});

test('protocol capture records send/recv frames as redacted ndjson', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'proto-cap-'));
	try {
		const file = join(dir, 'capture.ndjson');
		const ws = new EventEmitter();
		const cap = bindProtocolCapture({ ws }, { file, clock: () => '2026-09-28T00:00:00.000Z' });
		ws.emit('frame:send', { tag: 'iq', attrs: { id: 'S1', auth: 'secret' }, content: [] });
		ws.emit('frame', { tag: 'notification', attrs: { id: 'R1' }, content: [{ tag: 'new-protocol', attrs: {} }] });
		await cap.close();
		const lines = (await readFile(file, 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
		assert.equal(lines.length, 2);
		assert.equal(lines[0].direction, 'send');
		assert.equal(lines[0].node.attrs.auth, '[redacted]');
		assert.equal(lines[1].summary.childTags[0], 'new-protocol');
		const analysis = await analyzeProtocolCaptureFile(file);
		assert.equal(analysis.totals.frames, 2);
		assert.ok(analysis.top.tags.some((r) => r.name === 'iq'));
		assert.match(protocolCaptureReport(analysis), /Protocol capture analysis/);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('createProtocolCapture filter can skip noisy frames', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'proto-cap-'));
	try {
		const file = join(dir, 'capture.ndjson');
		const cap = createProtocolCapture({ file, filter: (_dir, node) => node.tag !== 'presence' });
		await cap.record('recv', { tag: 'presence', attrs: {} });
		await cap.record('recv', { tag: 'iq', attrs: { id: '1' } });
		await cap.close();
		const lines = (await readFile(file, 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
		assert.equal(lines.length, 1);
		assert.equal(lines[0].summary.tag, 'iq');
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
