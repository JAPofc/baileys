/**
 * tests/v247-poll-a2ui.test.js — batch O (v2.4.7)
 *
 * Covers BUGREPORT §2.31–§2.36 (Poll wire shape / quiz aggregation / A2UI id + listCard)
 * plus the validation & inspection upgrades added to both builders.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { Poll, A2UI, MESSAGE_BUILDER_VERSION } from '../lib/Builders/index.js';
import { generateWAMessageContent, getAggregateVotesInPollMessage } from '../lib/Utils/messages.js';

const sock = () => ({ sendMessage: async (jid, content, options) => ({ jid, content, options }) });
const toWire = (payload) => generateWAMessageContent(payload, { upload: async () => ({}) });
const basePoll = () => new Poll(sock()).setName('Favourite colour?').addOptions(['red', 'green']);

describe('§2.31 quiz polls (pollCreationMessageV5) are visible to vote aggregation', () => {
	it('emits V5 for quiz mode', async () => {
		const wire = await toWire(basePoll().setQuiz('red').build());
		assert.ok(wire.pollCreationMessageV5, 'expected pollCreationMessageV5 for a quiz poll');
		assert.equal(wire.pollCreationMessageV5.pollType, 1);
		assert.equal(wire.pollCreationMessageV5.correctAnswer.optionName, 'red');
	});

	it('getAggregateVotesInPollMessage no longer returns an empty list for a quiz poll', async () => {
		const wire = await toWire(basePoll().setQuiz('red').build());
		const aggregate = getAggregateVotesInPollMessage({ message: wire, pollUpdates: [] }, 'me@s.whatsapp.net');
		assert.equal(aggregate.length, 2, 'quiz options must produce vote buckets (regression: was 0)');
		assert.deepEqual(aggregate.map((a) => a.name), ['red', 'green']);
	});

	it('still aggregates the non-quiz V3/V1 shapes', async () => {
		const single = await toWire(basePoll().build());
		assert.ok(single.pollCreationMessageV3);
		assert.equal(getAggregateVotesInPollMessage({ message: single, pollUpdates: [] }, 'me').length, 2);

		const multi = await toWire(basePoll().setMultiSelect().build());
		assert.ok(multi.pollCreationMessage);
		assert.equal(getAggregateVotesInPollMessage({ message: multi, pollUpdates: [] }, 'me').length, 2);
	});
});

describe('§2.32 quiz + announcement group no longer silently drops the quiz', () => {
	it('rejects the incompatible combination at build()', () => {
		const poll = basePoll().setQuiz('red').setAnnouncementGroup();
		assert.throws(() => poll.build(), /cannot be combined with setAnnouncementGroup/);
	});

	it('reports it through validate() too', () => {
		const problems = basePoll().setQuiz('red').setAnnouncementGroup().validate();
		assert.equal(problems.length, 1);
		assert.match(problems[0], /pollCreationMessageV2, which has no correctAnswer field/);
	});

	it('announcement group without a quiz still works and maps to V2', async () => {
		const wire = await toWire(basePoll().setAnnouncementGroup().build());
		assert.ok(wire.pollCreationMessageV2);
	});
});

describe('§2.33 setEndDate() rejects unparseable input instead of wiring endTime: NaN', () => {
	it('throws on garbage', () => {
		assert.throws(() => new Poll(sock()).setEndDate('not-a-date'), /could not parse/);
		assert.throws(() => new Poll(sock()).setEndDate(new Date('nope')), /could not parse/);
	});

	it('accepts Date, ISO string and epoch ms, and reaches the wire as a number', async () => {
		const iso = '2026-12-01T00:00:00.000Z';
		for (const input of [new Date(iso), iso, Date.parse(iso)]) {
			const wire = await toWire(basePoll().setEndDate(input).build());
			const endTime = wire.pollCreationMessageV3.endTime;
			assert.equal(Number.isNaN(endTime), false, 'endTime must never be NaN');
			assert.equal(endTime, Date.parse(iso));
		}
	});
});

describe('§2.34 duplicate poll options are rejected (votes are keyed by option text)', () => {
	it('throws on a duplicate option', () => {
		assert.throws(() => new Poll(sock()).setName('Q').addOptions(['x', 'x']), /duplicate option "x"/);
		assert.throws(() => new Poll(sock()).setName('Q').addOption('x').addOption('x'), /duplicate option "x"/);
	});

	it('every accepted option survives as its own vote bucket', async () => {
		const wire = await toWire(new Poll(sock()).setName('Q').addOptions(['x', 'y', 'z']).build());
		const aggregate = getAggregateVotesInPollMessage({ message: wire, pollUpdates: [] }, 'me');
		assert.equal(aggregate.length, 3, 'option count must match bucket count');
	});

	it('validate() also catches duplicates injected around the setter', () => {
		const poll = basePoll();
		poll._values.push('red');
		assert.match(poll.validate().join(' '), /options must be unique/);
	});
});

describe('§2.35 A2UI auto-generated ids skip ids already taken by the caller', () => {
	it('does not collide with a caller-supplied id that looks generated', () => {
		const ui = new A2UI();
		ui.text('a', { id: 'text_0' });
		const auto = ui.text('b');
		assert.notEqual(auto, 'text_0');
		assert.equal(ui.count(), 2);
	});

	it('never hands back the reserved root id', () => {
		const ui = new A2UI();
		for (let i = 0; i < 5; i++) assert.notEqual(ui.text(`t${i}`), 'root');
	});

	it('a genuine duplicate explicit id is still rejected', () => {
		const ui = new A2UI();
		ui.text('a', { id: 'dup' });
		assert.throws(() => ui.text('b', { id: 'dup' }), /already used/);
		assert.throws(() => ui.text('c', { id: 'root' }), /reserved/);
	});
});

describe('§2.36 A2UI listCard no longer shadows components or ignores build options', () => {
	it('honours the build()/sendA2UIWidget type instead of hardcoding im_a2ui', () => {
		const ui = new A2UI();
		ui.listCard({ title: 'Catalogue', items: [{ title: 'Item' }] });
		assert.equal(ui.build({ type: 'custom_type' }).type, 'custom_type');
		assert.equal(ui.build().type, 'im_a2ui');
	});

	it('refuses to mix listCard with the component tree instead of dropping it', () => {
		const ui = new A2UI();
		ui.root([ui.text('hi')]);
		assert.throws(() => ui.listCard({ title: 'T', items: [{ title: 'i' }] }), /cannot be combined/);
	});

	it('still produces a valid standalone list_card payload', () => {
		const ui = new A2UI();
		ui.listCard({ title: 'Catalogue', items: [{ title: 'Shoe', price: 'Rp10.000' }], fallbackText: 'fb' });
		const built = ui.build();
		const data = JSON.parse(built.data);
		assert.equal(data.type, 'list_card');
		assert.equal(data.title, 'Catalogue');
		assert.equal(data.items[0].trailing_label, 'Rp10.000');
		assert.equal(built.fallback, 'fb');
	});
});

describe('§2.37 A2UI component factories are typed as the ids they actually return', () => {
	it('every factory returns a string id, not the builder', () => {
		const ui = new A2UI();
		const label = ui.text('Go');
		assert.equal(typeof label, 'string');
		for (const id of [
			ui.image('https://x/i.png'),
			ui.video('https://x/v.mp4'),
			ui.checkbox('check'),
			ui.textField('field'),
			ui.button(label),
			ui.card(label),
			ui.raw('Custom', { foo: 1 }),
			ui.column([label]),
			ui.row([label]),
			ui.divider(),
			ui.slider({ max: 10 }),
			ui.switch('toggle'),
			ui.list([label]),
			ui.progressBar(50),
			ui.avatar('https://x/a.png'),
			ui.badge(label),
			ui.spacer(),
			ui.tabs([label]),
			ui.choicePicker('Pick', [{ label: 'A', value: 'a' }])
		]) {
			assert.equal(typeof id, 'string', 'factories must return an id string');
			assert.equal(ui.has(id), true);
		}
		assert.equal(typeof ui.modal(ui.button(ui.text('t')), ui.text('c')), 'string');
	});

	it('the documented id-passing pattern builds, while chaining a factory does not', () => {
		const ui = new A2UI();
		const label = ui.text('Go');
		const button = ui.button(label);
		ui.root([button]);
		assert.deepEqual(ui.validate(), []);
		assert.throws(() => ui.text('a').text('b'), TypeError);
	});

	it('config/terminal methods do still chain', () => {
		const ui = new A2UI();
		const id = ui.text('hi');
		assert.equal(ui.setVersion('v0.9').setCatalogId('https://x/c.json').root([id]).assertValid(), ui);
		assert.equal(ui.clear(), ui);
	});
});

describe('upgrade — Poll validation, limits and inspection', () => {
	it('exposes the WhatsApp limits as statics and enforces them', () => {
		assert.equal(Poll.MAX_OPTIONS, 12);
		assert.equal(Poll.MAX_NAME_LENGTH, 255);
		assert.equal(Poll.MAX_OPTION_LENGTH, 100);
		const twelve = Array.from({ length: 12 }, (_, i) => `o${i}`);
		assert.equal(new Poll(sock()).setName('Q').addOptions(twelve).countOptions(), 12);
		assert.throws(() => new Poll(sock()).setName('Q').addOptions([...twelve, 'o12']), /12-option limit/);
		assert.throws(() => new Poll(sock()).setName('x'.repeat(256)), /limited to 255 characters/);
		assert.throws(() => new Poll(sock()).setName('Q').addOption('x'.repeat(101)), /limited to 100 characters/);
	});

	it('validate() collects every problem without throwing', () => {
		const problems = new Poll(sock()).validate();
		assert.ok(problems.length >= 2);
		assert.match(problems.join(' '), /requires a name/);
		assert.match(problems.join(' '), /at least 2 options/);
		assert.deepEqual(basePoll().validate(), []);
	});

	it('assertValid() throws the first problem and is chainable when clean', () => {
		assert.throws(() => new Poll(sock()).assertValid(), /requires a name/);
		assert.equal(basePoll().assertValid().countOptions(), 2);
	});

	it('flags selectableCount above the option count (the socket would Boom at send time)', () => {
		assert.match(basePoll().setSelectable(5).validate().join(' '), /selectableCount must be <=/);
		assert.deepEqual(basePoll().setSelectable(2).validate(), []);
		assert.throws(() => basePoll().setSelectable(1.5), /non-negative integer/);
		assert.throws(() => basePoll().setSelectable(-1), /non-negative integer/);
	});

	it('setOptions() replaces atomically and rolls back on error', () => {
		const poll = basePoll();
		assert.throws(() => poll.setOptions(['c', 'c']), /duplicate option/);
		assert.deepEqual(poll.getOptions(), ['red', 'green'], 'state must be unchanged after a failed setOptions');
		assert.deepEqual(poll.setOptions(['a', 'b', 'c']).getOptions(), ['a', 'b', 'c']);
	});

	it('removeOption()/clearOptions() keep the quiz answer consistent', () => {
		const poll = basePoll().setQuiz('red');
		assert.deepEqual(poll.removeOption('red').getOptions(), ['green']);
		assert.equal(poll._correctAnswer, undefined, 'removing the correct answer must clear the quiz');
		assert.equal(basePoll().setQuiz('red').clearOptions().countOptions(), 0);
	});

	it('getOptions() returns a copy, not the internal array', () => {
		const poll = basePoll();
		poll.getOptions().push('injected');
		assert.equal(poll.countOptions(), 2);
		poll.build().poll.values.push('injected');
		assert.equal(poll.countOptions(), 2);
	});

	it('setMessageSecret() pins a 32-byte secret and validates length', () => {
		const secret = new Uint8Array(32).fill(7);
		const built = basePoll().setMessageSecret(secret).build();
		assert.equal(built.poll.messageSecret, secret);
		assert.throws(() => basePoll().setMessageSecret(new Uint8Array(8)), /32-byte/);
		assert.throws(() => basePoll().setMessageSecret('nope'), /32-byte/);
		assert.equal(basePoll().build().poll.messageSecret, undefined);
	});

	it('toJSON() mirrors build() and send() routes through sendMessage()', async () => {
		assert.deepEqual(basePoll().toJSON(), basePoll().build());
		const sent = await basePoll().send('123@g.us', { ephemeralExpiration: 60 });
		assert.equal(sent.jid, '123@g.us');
		assert.deepEqual(sent.content.poll.values, ['red', 'green']);
		assert.deepEqual(sent.options, { ephemeralExpiration: 60 });
	});
});

describe('upgrade — A2UI validation, inspection and overrides', () => {
	it('exposes has/get/ids/count/remove/clear', () => {
		const ui = new A2UI();
		const id = ui.text('hello');
		assert.equal(ui.has(id), true);
		assert.equal(ui.get(id).text, 'hello');
		assert.equal(ui.get('nope'), undefined);
		assert.deepEqual(ui.ids(), [id]);
		assert.equal(ui.count(), 1);
		assert.equal(ui.remove(id), true);
		assert.equal(ui.remove(id), false);
		assert.equal(ui.clear().count(), 0);
	});

	it('get() returns a copy so callers cannot mutate the registry', () => {
		const ui = new A2UI();
		const id = ui.text('hello');
		ui.get(id).text = 'tampered';
		assert.equal(ui.get(id).text, 'hello');
	});

	it('findOrphans() reports components nothing references', () => {
		const ui = new A2UI();
		const used = ui.text('used');
		const orphan = ui.text('orphan');
		ui.root([used]);
		assert.deepEqual(ui.findOrphans(), [orphan]);
		assert.match(ui.validate().join(' '), /never referenced by root\(\)/);
		ui.remove(orphan);
		assert.deepEqual(ui.validate(), []);
	});

	it('counts nested references (child/children/trigger/content) as used', () => {
		const ui = new A2UI();
		const label = ui.text('Go');
		const button = ui.button(label);
		const body = ui.text('Body');
		const modal = ui.modal(button, body);
		const col = ui.column([modal]);
		ui.root([col]);
		assert.deepEqual(ui.findOrphans(), []);
		assert.deepEqual(ui.validate(), []);
	});

	it('validate() surfaces broken refs and the missing-root case without throwing', () => {
		const missingRoot = new A2UI();
		missingRoot.text('a');
		assert.match(missingRoot.validate().join(' '), /Call root\(\[\.\.\.ids\]\) before build\(\)/);

		const badRef = new A2UI();
		badRef.button('ghost', { id: 'b' });
		badRef.root(['b']);
		assert.match(badRef.validate().join(' '), /references unknown id "ghost"/);
		assert.throws(() => badRef.assertValid(), /references unknown id "ghost"/);
		assert.throws(() => badRef.build(), /references unknown id "ghost"/);
	});

	it('build({ validate: false }) skips the orphan check but keeps the payload shape', () => {
		const ui = new A2UI();
		const used = ui.text('used');
		ui.text('orphan');
		ui.root([used]);
		assert.throws(() => ui.build(), /never referenced/);
		const built = ui.build({ validate: false });
		assert.equal(JSON.parse(built.data).createSurface.components.length, 3);
	});

	it('setVersion()/setCatalogId() land in the serialised payload', () => {
		const ui = new A2UI();
		const id = ui.text('hi');
		ui.setVersion('v1.0').setCatalogId('https://example.test/catalog.json').root([id]);
		const data = JSON.parse(ui.build().data);
		assert.equal(data.version, 'v1.0');
		assert.equal(data.createSurface.catalogId, 'https://example.test/catalog.json');
		assert.equal(data.createSurface.components[0].id, 'root');
	});

	it('unwrapped build() still emits a bare components array', () => {
		const ui = new A2UI();
		const id = ui.text('hi');
		ui.root([id]);
		const data = JSON.parse(ui.build({ wrapped: false }).data);
		assert.equal(data.createSurface, undefined);
		assert.equal(data.components.length, 2);
	});
});

describe('builder version stamp', () => {
	it('bumped for batch O', () => {
		assert.equal(MESSAGE_BUILDER_VERSION, '4.11');
	});
});
