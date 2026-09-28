import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { unlink } from 'node:fs/promises';
import { encryptedStream } from '../lib/index.js';

const responseWithBytes = (size) => new Response(
	Readable.toWeb(Readable.from([Buffer.alloc(size)])),
	{ status: 200, headers: { 'content-length': String(size) } }
);

test('encryptedStream remote maxContentLength accepts content below limit', async () => {
	const oldFetch = global.fetch;
	global.fetch = async () => responseWithBytes(60);
	try {
		const res = await encryptedStream(
			{ url: 'https://example.com/file.bin' },
			'document',
			{ opts: { maxContentLength: 100, checkDns: false } }
		);
		assert.equal(res.fileLength, 60);
		await unlink(res.encFilePath).catch(() => {});
	} finally {
		global.fetch = oldFetch;
	}
});

test('encryptedStream remote maxContentLength rejects content above limit', async () => {
	const oldFetch = global.fetch;
	global.fetch = async () => responseWithBytes(101);
	try {
		await assert.rejects(
			encryptedStream(
				{ url: 'https://example.com/file.bin' },
				'document',
				{ opts: { maxContentLength: 100, checkDns: false } }
			),
			/content length exceeded/
		);
	} finally {
		global.fetch = oldFetch;
	}
});
