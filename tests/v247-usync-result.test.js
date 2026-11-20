/**
 * tests/v247-usync-result.test.js — batch S (v2.4.7)
 *
 * Covers BUGREPORT §2.47–§2.49: the `onWhatsApp()` LID path that fed its jids to a helper
 * which rejects them, the `undefined` return that crashed callers, and the USync errors
 * that were parsed into nothing at all.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { USyncQuery, USyncUser } from '../lib/WAUSync/index.js';
import { extractUSyncErrors, hasUSyncQueryError } from '../lib/Utils/index.js';

const socketSource = async () => readFile(new URL('../lib/Socket/socket.js', import.meta.url), 'utf8');

const iq = (...usyncChildren) => ({
	tag: 'iq',
	attrs: { type: 'result' },
	content: [{ tag: 'usync', attrs: {}, content: usyncChildren }]
});
const list = (...users) => ({ tag: 'list', attrs: {}, content: users });
const user = (jid, ...content) => ({ tag: 'user', attrs: { jid }, content });

describe('§2.49 USync errors are no longer discarded', () => {
	it('reports a query-level error that used to parse into an empty list', () => {
		const node = iq(
			{ tag: 'result', attrs: {}, content: [{ tag: 'error', attrs: { code: '479', text: 'rate overlimit' } }] },
			list()
		);
		assert.deepEqual(extractUSyncErrors(node), [{ code: 479, text: 'rate overlimit' }]);
		const parsed = new USyncQuery().withContactProtocol().parseUSyncQueryResult(node);
		assert.deepEqual(parsed.list, [], 'the list really is empty…');
		assert.equal(parsed.errors.length, 1, '…but it is now distinguishable from a refused query');
		assert.equal(hasUSyncQueryError(parsed.errors), true);
	});

	it('reports per-user errors and attributes them to the right jid', () => {
		const node = iq(list(
			user('1@s.whatsapp.net', { tag: 'contact', attrs: { type: 'in' } }),
			user('2@s.whatsapp.net', { tag: 'error', attrs: { code: '403', text: 'forbidden' } })
		));
		assert.deepEqual(extractUSyncErrors(node), [{ jid: '2@s.whatsapp.net', code: 403, text: 'forbidden' }]);
		assert.equal(extractUSyncErrors(node)[0].protocol, undefined);
		assert.equal(hasUSyncQueryError(extractUSyncErrors(node)), false, 'a per-user error is not a query failure');
	});

	it('finds errors nested inside a protocol node', () => {
		const node = iq(list(user('1@s.whatsapp.net', {
			tag: 'devices',
			attrs: {},
			content: [{ tag: 'error', attrs: { code: '404' } }]
		})));
		assert.deepEqual(extractUSyncErrors(node), [{ jid: '1@s.whatsapp.net', protocol: 'devices', code: 404, text: undefined }]);
	});

	it('leaves code undefined rather than NaN when the server sends none or garbage', () => {
		const node = iq({ tag: 'result', attrs: {}, content: [
			{ tag: 'error', attrs: {} },
			{ tag: 'error', attrs: { code: 'nope', reason: 'mystery' } }
		] });
		assert.deepEqual(extractUSyncErrors(node), [
			{ code: undefined, text: undefined },
			{ code: undefined, text: 'mystery' }
		]);
	});

	it('returns an empty array for a clean or malformed IQ', () => {
		assert.deepEqual(extractUSyncErrors(iq(list(user('1@s.whatsapp.net')))), []);
		assert.deepEqual(extractUSyncErrors({ tag: 'iq', attrs: {}, content: [] }), []);
		assert.deepEqual(extractUSyncErrors(null), []);
		assert.deepEqual(extractUSyncErrors(undefined), []);
		assert.equal(hasUSyncQueryError([]), false);
		assert.equal(hasUSyncQueryError(null), false);
	});

	it('parseUSyncQueryResult always carries an errors array, and the TODOs are gone', async () => {
		const parsed = new USyncQuery().withContactProtocol().parseUSyncQueryResult(iq(list()));
		assert.deepEqual(parsed, { list: [], sideList: [], errors: [] });
		const source = await readFile(new URL('../lib/WAUSync/USyncQuery.js', import.meta.url), 'utf8');
		assert.doesNotMatch(source, /^\s*\/\/ TODO: implement errors etc\.\s*$/m);
		assert.doesNotMatch(source, /^\s*\/\/TODO: see if there are any errors in the result node\s*$/m);
	});

	it('still returns undefined for a non-result IQ, and parses list + sideList', () => {
		const query = new USyncQuery().withContactProtocol();
		assert.equal(query.parseUSyncQueryResult({ tag: 'iq', attrs: { type: 'error' } }), undefined);
		const node = iq(
			list(user('1@s.whatsapp.net', { tag: 'contact', attrs: { type: 'in' } })),
			{ tag: 'side_list', attrs: {}, content: [user('2@s.whatsapp.net', { tag: 'contact', attrs: { type: 'in' } })] }
		);
		const parsed = query.parseUSyncQueryResult(node);
		assert.deepEqual(parsed.list, [{ contact: true, id: '1@s.whatsapp.net' }]);
		assert.deepEqual(parsed.sideList, [{ contact: true, id: '2@s.whatsapp.net' }]);
	});
});

describe('§2.47 onWhatsApp() actually resolves LID arguments', () => {
	it('the old fallback target rejects exactly what it was handed (the regression)', async () => {
		const source = await socketSource();
		// pnFromLIDUSync resolves PN -> LID and skips LID input...
		const pnFromLID = source.slice(source.indexOf('const pnFromLIDUSync'));
		assert.match(pnFromLID, /logger\?\.warn\('LID user found in LID fetch call'\)/);
		// ...so onWhatsApp must not route its LIDs through it any more.
		const onWhatsApp = source.slice(source.indexOf('const onWhatsApp'), source.indexOf('const pnFromLIDUSync'));
		// non-comment lines only: the old call is quoted in the fix comment on purpose
		assert.doesNotMatch(onWhatsApp, /^(?!\s*\/\/).*pnFromLIDUSync\(lidUsers\)/m);
		assert.match(onWhatsApp, /lidMapping\?\.getPNForLID\(lid\)/);
	});

	it('demonstrates the old path returned [] without sending an IQ', async () => {
		const { isLidUser } = await import('../lib/WABinary/index.js');
		const oldPnFromLIDUSync = (jids) => {
			const query = new USyncQuery().withLIDProtocol().withContext('background');
			for (const jid of jids) {
				if (isLidUser(jid)) {
					continue;
				}
				query.withUser(new USyncUser().withId(jid));
			}
			return query.users.length === 0 ? [] : 'would-send-an-iq';
		};
		assert.deepEqual(oldPnFromLIDUSync(['99887766@lid', '11223344@lid']), []);
		assert.equal(oldPnFromLIDUSync(['628111@s.whatsapp.net']), 'would-send-an-iq');
	});

	it('the resolved LID is carried back onto the result entry', async () => {
		const onWhatsApp = (await socketSource()).slice(
			(await socketSource()).indexOf('const onWhatsApp'),
			(await socketSource()).indexOf('const pnFromLIDUSync')
		);
		assert.match(onWhatsApp, /lidByPhoneJid/);
		assert.match(onWhatsApp, /lid: lidByPhoneJid\.get\(id\)/);
	});
});

describe('§2.48 onWhatsApp() always resolves to an array', () => {
	it('an unparsable result no longer yields undefined', async () => {
		const source = await socketSource();
		const onWhatsApp = source.slice(source.indexOf('const onWhatsApp'), source.indexOf('const pnFromLIDUSync'));
		assert.match(onWhatsApp, /if \(!results\) \{[\s\S]*?return \[\];/);
		assert.doesNotMatch(onWhatsApp, /if \(results\) \{\s*\n\s*return results\.list/);
	});

	it('shows what the old shape did to a caller', () => {
		const oldReturn = ((results) => { if (results) { return []; } })(undefined);
		assert.equal(oldReturn, undefined);
		assert.throws(() => oldReturn.length, TypeError);
		const newReturn = ((results) => { if (!results) { return []; } return []; })(undefined);
		assert.deepEqual(newReturn, []);
	});
});

describe('USyncQuery.withUsers() (v2.4.7 upgrade)', () => {
	it('queues several users at once and ignores empty entries', () => {
		const a = new USyncUser().withPhone('+1');
		const b = new USyncUser().withPhone('+2');
		const query = new USyncQuery().withContactProtocol().withUsers(a, null, b, undefined);
		assert.deepEqual(query.users, [a, b]);
	});

	it('accepts an array and stays chainable alongside withUser()', () => {
		const users = [new USyncUser().withPhone('+1'), new USyncUser().withPhone('+2')];
		const query = new USyncQuery().withUsers(users).withUser(new USyncUser().withPhone('+3'));
		assert.equal(query.users.length, 3);
		assert.equal(query.withUsers(), query, 'returns this');
		assert.deepEqual(new USyncQuery().withUsers().users, []);
	});
});
