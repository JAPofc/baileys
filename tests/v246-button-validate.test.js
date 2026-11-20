// Tests for the Button builder's pre-flight validate()/assertValid()/
// introspection upgrade. Socket-free: the constructor only needs a truthy
// client, and validate() reads the accumulated buttons without sending.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Button } from '../lib/Builders/index.js';

const mk = () => new Button({}); // dummy client

test('a well-formed card validates clean and introspects', () => {
    const b = mk().addReply('Yes', 'yes').addReply('No', 'no').addUrl('Site', 'https://x.com');
    const v = b.validate();
    assert.equal(v.ok, true);
    assert.deepEqual(v.errors, []);
    assert.equal(b.countButtons(), 3);
    assert.deepEqual(b.getButtonNames(), ['quick_reply', 'quick_reply', 'cta_url']);
});

test('an empty card is an error', () => {
    const v = mk().validate();
    assert.equal(v.ok, false);
    assert.match(v.errors[0], /empty/);
});

test('duplicate quick_reply ids are rejected', () => {
    const v = mk().addReply('A', 'dup').addReply('B', 'dup').validate();
    assert.equal(v.ok, false);
    assert.ok(v.errors.some((e) => /duplicate quick_reply id "dup"/.test(e)));
});

test('missing/invalid params on raw addButton are caught', () => {
    assert.ok(mk().addButton('cta_url', { display_text: 'x', url: 'not a url' }).validate().errors.some((e) => /invalid url/.test(e)));
    assert.ok(mk().addButton('cta_url', { display_text: 'x' }).validate().errors.some((e) => /missing url/.test(e)));
    assert.ok(mk().addButton('cta_call', { display_text: 'Call' }).validate().errors.some((e) => /missing phone_number/.test(e)));
    assert.ok(mk().addButton('cta_copy', { display_text: 'Copy' }).validate().errors.some((e) => /missing copy_code/.test(e)));
    assert.ok(mk().addButton('quick_reply', { display_text: 'X' }).validate().errors.some((e) => /needs an id/.test(e)));
});

test('malformed buttonParamsJson is reported, not thrown', () => {
    const v = mk().addButton('quick_reply', '{bad json').validate();
    assert.equal(v.ok, false);
    assert.ok(v.errors.some((e) => /not valid JSON/.test(e)));
});

test('a single_select with valid rows passes; a raw one missing a row id fails', () => {
    const good = mk().addSelection('Pick').makeSection('S').makeRow('', 'Row A', 'desc', 'r1');
    assert.equal(good.validate().ok, true);
    // hand-built (raw) single_select with a row that has no id
    const raw = mk().addButton('single_select', { title: 'Pick', sections: [{ title: 'S', rows: [{ title: 'A' }] }] });
    const v = raw.validate();
    assert.equal(v.ok, false);
    assert.ok(v.errors.some((e) => /missing id/.test(e)));
});

test('more than one single_select is an error; mixing warns', () => {
    assert.ok(mk().addSelection('A').addSelection('B').validate().errors.some((e) => /only one single_select/.test(e)));
    const mixed = mk().addSelection('Pick').makeSection('S').makeRow('', 'R', '', 'r1');
    mixed.addReply('Also', 'x');
    const v = mixed.validate();
    assert.equal(v.ok, true);
    assert.ok(v.warnings.some((w) => /mixed native_flow/.test(w)));
});

test('more than ~10 buttons warns but still validates', () => {
    const b = mk();
    for (let i = 0; i < 11; i++) b.addReply('x' + i, 'id' + i);
    const v = b.validate();
    assert.equal(v.ok, true);
    assert.ok(v.warnings.some((w) => /at most/.test(w)));
});

test('assertValid throws on errors and is chainable when valid', () => {
    assert.throws(() => mk().addReply('A', 'dup').addReply('B', 'dup').assertValid(), /Button\.validate failed/);
    const b = mk().addReply('A', 'a');
    assert.equal(b.assertValid(), b);
});

test('a lone bloks widget (no buttons) is not flagged empty', () => {
    const b = mk();
    b._bloksWidget = { components: [] }; // simulate setBloksWidget() output
    assert.equal(b.validate().ok, true);
});
