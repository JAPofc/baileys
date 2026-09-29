// Tests for the AI group helpers — EXPERIMENTAL & SERVER-GATED feature:
// the wire shapes (w:g2 IQ + @bot participant) are verified structurally
// here; end-to-end acceptance depends on Meta's per-account rollout flag.
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
	addAiBotToGroup,
	removeAiBotFromGroup,
	createAiGroup,
	aiBotJid,
	META_AI_BOT_USER
} from '../lib/index.js';

const makeSock = (captured, errCode) => ({
	query: async (node) => {
		captured.push(node);
		return {
			tag: 'iq',
			attrs: {},
			content: [{
				tag: node.content[0].tag,
				attrs: {},
				content: [{ tag: 'participant', attrs: { jid: aiBotJid(), ...(errCode ? { error: errCode } : {}) }, content: undefined }]
			}]
		};
	},
	groupCreate: async (subject, participants) => ({ id: '999@g.us', subject, participants })
});

test('aiBotJid and the Meta AI bot user constant', () => {
	assert.equal(META_AI_BOT_USER, '867051314767696');
	assert.equal(aiBotJid(), '867051314767696@bot');
	assert.equal(aiBotJid('123'), '123@bot');
});

test('addAiBotToGroup: exact w:g2 wire shape and status parsing', async () => {
	const captured = [];
	const result = await addAiBotToGroup(makeSock(captured), 'g@g.us');

	const iq = captured[0];
	assert.equal(iq.tag, 'iq');
	assert.equal(iq.attrs.xmlns, 'w:g2', 'standard group namespace — not a special API');
	assert.equal(iq.attrs.type, 'set');
	assert.equal(iq.attrs.to, 'g@g.us');
	assert.equal(iq.content[0].tag, 'add');
	assert.equal(iq.content[0].content[0].tag, 'participant');
	assert.equal(iq.content[0].content[0].attrs.jid, '867051314767696@bot');

	assert.deepEqual(result, [{ jid: '867051314767696@bot', status: '200' }]);
});

test('server-gated rejections surface as statuses, never throws', async () => {
	const rejected = await addAiBotToGroup(makeSock([], '403'), 'g@g.us');
	assert.equal(rejected[0].status, '403', 'no Meta AI rollout → error code, calmly reported');
});

test('removeAiBotFromGroup: remove tag + custom bot user', async () => {
	const captured = [];
	const result = await removeAiBotFromGroup(makeSock(captured), 'g@g.us', { botUser: '555' });
	assert.equal(captured[0].content[0].tag, 'remove');
	assert.equal(captured[0].content[0].content[0].attrs.jid, '555@bot');
	assert.equal(result[0].status, '200');
});

test('createAiGroup: normal groupCreate path, bot add is best-effort', async () => {
	const ok = await createAiGroup(makeSock([]), 'Belajar AI', ['a@s.whatsapp.net']);
	assert.equal(ok.group.id, '999@g.us');
	assert.equal(ok.bot.added, true);
	assert.equal(ok.bot.statuses[0].status, '200');

	const gated = await createAiGroup(makeSock([], '403'), 'X', []);
	assert.equal(gated.group.id, '999@g.us', 'group still created');
	assert.equal(gated.bot.added, false);
	assert.equal(gated.bot.statuses[0].status, '403');

	const throwing = { query: async () => { throw new Error('boom'); }, groupCreate: async () => ({ id: '1@g.us' }) };
	const failed = await createAiGroup(throwing, 'X', []);
	assert.equal(failed.group.id, '1@g.us', 'a throwing bot add never fails creation');
	assert.equal(failed.bot.added, false);
	assert.ok(failed.bot.error);

	const skipped = await createAiGroup(makeSock([]), 'X', [], { autoAddBot: false });
	assert.equal(skipped.bot.added, false);
	assert.ok(!('statuses' in skipped.bot));
});

test('guards, barrel exports and honest experimental labeling', async () => {
	await assert.rejects(() => addAiBotToGroup({}, 'g@g.us'), /sock\.query/);
	await assert.rejects(() => createAiGroup({}, 'x'), /groupCreate/);

	const utilsIndex = readFileSync(new URL('../lib/Utils/index.js', import.meta.url), 'utf8');
	const utilsDts = readFileSync(new URL('../lib/Utils/index.d.ts', import.meta.url), 'utf8');
	assert.ok(utilsIndex.includes('./ai-groups.js'));
	assert.ok(utilsDts.includes('./ai-groups'));

	const src = readFileSync(new URL('../lib/Utils/ai-groups.js', import.meta.url), 'utf8');
	assert.ok(src.includes('EXPERIMENTAL & SERVER-GATED'), 'limitation documented in the module');
	const dts = readFileSync(new URL('../lib/Utils/ai-groups.d.ts', import.meta.url), 'utf8');
	assert.ok(dts.includes('SERVER-GATED'), 'limitation documented in the types');
});
