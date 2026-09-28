/**
 * Experimental protocol-capture helpers.
 *
 * A new WhatsApp feature cannot be implemented honestly until its wire shape is
 * known. This utility gives maintainers a safe way to capture unknown binary
 * nodes from a consenting test account, redact secrets, and replay the shape in
 * unit tests before a high-level API is added.
 *
 * ```js
 * import { createProtocolCapture } from '@japofc/baileys'
 * const cap = createProtocolCapture({ file: './wa-protocol.ndjson' })
 * cap.bind(sock)
 * // ...trigger the feature in an official client / paired session...
 * await cap.close()
 * ```
 */
import { createHash } from 'node:crypto';
import { mkdir, appendFile, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Boom } from '@hapi/boom';

const DEFAULT_REDACT_ATTR = /(?:token|auth|secret|key|mac|hash|signature|skey|enc|pair|code|noise|routing|credential|identity|registration|adv|lid-migration)/i;

const sha256Short = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16);

const isPlainObject = (v) => v && typeof v === 'object' && !Buffer.isBuffer(v) && !(v instanceof Uint8Array) && !Array.isArray(v);

/**
 * Redact a BinaryNode-like value for logs/fixtures. Buffers are replaced with
 * size + short hash by default; sensitive attrs become `[redacted]`.
 */
export const redactBinaryNode = (value, options = {}) => {
	const {
		redactAttrs = DEFAULT_REDACT_ATTR,
		includeBufferData = false,
		maxStringLength = 512,
		maxDepth = 24
	} = options;
	const walk = (v, depth, key = '') => {
		if (depth > maxDepth) return '[MaxDepth]';
		if (v === null || v === undefined || typeof v === 'number' || typeof v === 'boolean') return v;
		if (typeof v === 'bigint') return v.toString();
		if (typeof v === 'string') {
			if (redactAttrs && redactAttrs.test(key)) return '[redacted]';
			return v.length > maxStringLength ? `${v.slice(0, maxStringLength)}…(${v.length} chars)` : v;
		}
		if (Buffer.isBuffer(v) || v instanceof Uint8Array) {
			const b = Buffer.from(v);
			return includeBufferData
				? { type: 'Buffer', length: b.length, sha256: sha256Short(b), data: b.toString('base64') }
				: { type: 'Buffer', length: b.length, sha256: sha256Short(b) };
		}
		if (Array.isArray(v)) return v.map((item) => walk(item, depth + 1, key));
		if (isPlainObject(v)) {
			const out = {};
			for (const [k, val] of Object.entries(v)) out[k] = walk(val, depth + 1, k);
			return out;
		}
		return String(v);
	};
	return walk(value, 0);
};

export const summarizeBinaryNode = (node) => ({
	tag: node?.tag,
	id: node?.attrs?.id,
	type: node?.attrs?.type,
	xmlns: node?.attrs?.xmlns,
	to: node?.attrs?.to,
	from: node?.attrs?.from,
	childTags: Array.isArray(node?.content) ? node.content.map((c) => c?.tag).filter(Boolean) : []
});

/**
 * Create a protocol capture sink. It writes newline-delimited JSON so large
 * captures can be grep'd/diffed and committed as redacted fixtures.
 */

const inc = (map, key) => {
	const k = key || '(none)';
	map[k] = (map[k] || 0) + 1;
};

const topEntries = (map, limit = 20) => Object.entries(map)
	.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
	.slice(0, limit)
	.map(([name, count]) => ({ name, count }));

/** Analyze NDJSON produced by createProtocolCapture()/bindProtocolCapture(). */
export const analyzeProtocolCaptureText = (text, { sampleLimit = 20, topLimit = 20 } = {}) => {
	const totals = { frames: 0, send: 0, recv: 0, parseErrors: 0 };
	const byTag = {};
	const byXmlns = {};
	const byType = {};
	const byChildTag = {};
	const byDirectionTag = {};
	const samples = [];
	const errors = [];

	for (const [idx, rawLine] of String(text || '').split(/\r?\n/).entries()) {
		const line = rawLine.trim();
		if (!line) continue;
		let row;
		try {
			row = JSON.parse(line);
		} catch (err) {
			totals.parseErrors++;
			if (errors.length < 10) errors.push({ line: idx + 1, error: err.message });
			continue;
		}
		const direction = row.direction === 'send' ? 'send' : row.direction === 'recv' ? 'recv' : 'unknown';
		const summary = row.summary || summarizeBinaryNode(row.node);
		totals.frames++;
		if (direction === 'send') totals.send++;
		if (direction === 'recv') totals.recv++;
		inc(byTag, summary.tag);
		inc(byXmlns, summary.xmlns);
		inc(byType, summary.type);
		inc(byDirectionTag, `${direction}:${summary.tag || '(none)'}`);
		for (const child of summary.childTags || []) inc(byChildTag, child);
		if (samples.length < sampleLimit) {
			samples.push({ line: idx + 1, direction, summary });
		}
	}

	return {
		totals,
		top: {
			tags: topEntries(byTag, topLimit),
			xmlns: topEntries(byXmlns, topLimit),
			types: topEntries(byType, topLimit),
			childTags: topEntries(byChildTag, topLimit),
			directionTags: topEntries(byDirectionTag, topLimit)
		},
		samples,
		errors
	};
};

export const analyzeProtocolCaptureFile = async (file, options) => analyzeProtocolCaptureText(await readFile(file, 'utf8'), options);

/** Produce a compact markdown report that is easier to paste in issues/PRs. */
export const protocolCaptureReport = (analysis) => {
	const section = (title, rows) => [
		`### ${title}`,
		'| name | count |',
		'|---|---:|',
		...(rows?.length ? rows.map((r) => `| \`${String(r.name).replace(/`/g, '\\`')}\` | ${r.count} |`) : ['| _(none)_ | 0 |'])
	].join('\n');
	return [
		'# Protocol capture analysis',
		'',
		`Frames: **${analysis.totals.frames}** (send ${analysis.totals.send}, recv ${analysis.totals.recv}, parse errors ${analysis.totals.parseErrors})`,
		'',
		section('Top tags', analysis.top.tags),
		'',
		section('Top xmlns', analysis.top.xmlns),
		'',
		section('Top child tags', analysis.top.childTags),
		'',
		'### Samples',
		...(analysis.samples || []).map((s) => `- line ${s.line}: ${s.direction} ${s.summary.tag || ''} ${s.summary.type || ''} children=${(s.summary.childTags || []).join(',')}`)
	].join('\n');
};

export const createProtocolCapture = ({ file, redact = true, includeBufferData = false, filter, clock = () => new Date().toISOString() } = {}) => {
	if (!file || typeof file !== 'string') {
		throw new Boom('createProtocolCapture needs { file }', { statusCode: 400 });
	}
	let queue = Promise.resolve();
	let closed = false;
	const unbinders = new Set();

	const record = (direction, node, meta = {}) => {
		if (closed) return queue;
		if (filter && !filter(direction, node, meta)) return queue;
		const payload = {
			ts: clock(),
			direction,
			summary: summarizeBinaryNode(node),
			node: redact ? redactBinaryNode(node, { includeBufferData }) : node,
			...meta
		};
		queue = queue.then(async () => {
			await mkdir(dirname(file), { recursive: true });
			await appendFile(file, JSON.stringify(payload) + '\n', { encoding: 'utf8', mode: 0o600 });
		});
		return queue;
	};

	const bind = (sock) => {
		const ws = sock?.ws;
		if (!ws || typeof ws.on !== 'function') {
			throw new Boom('protocol capture bind(sock) needs a Baileys socket with ws EventEmitter', { statusCode: 400 });
		}
		const onRecv = (node) => {
			if (!(node instanceof Uint8Array)) void record('recv', node);
		};
		const onSend = (node) => {
			if (!(node instanceof Uint8Array)) void record('send', node);
		};
		ws.on('frame', onRecv);
		ws.on('frame:send', onSend);
		const unbind = () => {
			ws.off?.('frame', onRecv);
			ws.off?.('frame:send', onSend);
			unbinders.delete(unbind);
		};
		unbinders.add(unbind);
		return unbind;
	};

	return {
		record,
		bind,
		async flush() { await queue; },
		async close() {
			closed = true;
			for (const unbind of [...unbinders]) unbind();
			await queue;
		}
	};
};

export const bindProtocolCapture = (sock, options) => {
	const capture = createProtocolCapture(options);
	capture.bind(sock);
	return capture;
};
