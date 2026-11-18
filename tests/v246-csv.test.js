// Tests for the v2.4.6 CSV writer/reader.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCSV, parseCSV } from '../lib/Utils/csv.js';

test('toCSV: array of objects with derived header', () => {
    const out = toCSV([{ name: 'Ana', xp: 900 }, { name: 'Budi', xp: 1200 }]);
    assert.equal(out, 'name,xp\r\nAna,900\r\nBudi,1200');
});

test('toCSV: quotes fields containing comma/quote/newline', () => {
    const out = toCSV([{ name: 'Budi, Jr', note: 'says "hi"' }]);
    assert.equal(out, 'name,note\r\n"Budi, Jr","says ""hi"""');
});

test('toCSV: newline inside a field is quoted', () => {
    const out = toCSV([{ a: 'line1\nline2' }]);
    assert.equal(out, 'a\r\n"line1\nline2"');
});

test('toCSV: explicit columns fix order and subset', () => {
    const out = toCSV([{ a: 1, b: 2, c: 3 }], { columns: ['c', 'a'] });
    assert.equal(out, 'c,a\r\n3,1');
});

test('toCSV: missing keys become empty fields', () => {
    const out = toCSV([{ a: 1 }, { b: 2 }]);
    assert.equal(out, 'a,b\r\n1,\r\n,2');
});

test('toCSV: header:false omits the header row', () => {
    const out = toCSV([{ a: 1, b: 2 }], { header: false });
    assert.equal(out, '1,2');
});

test('toCSV: array-of-arrays mode', () => {
    const out = toCSV([['a', 'b'], [1, 2]]);
    assert.equal(out, 'a,b\r\n1,2');
});

test('toCSV: array-of-arrays with prepended columns header', () => {
    const out = toCSV([[1, 2]], { columns: ['x', 'y'] });
    assert.equal(out, 'x,y\r\n1,2');
});

test('toCSV: custom delimiter and newline', () => {
    const out = toCSV([{ a: 1, b: 2 }], { delimiter: ';', newline: '\n' });
    assert.equal(out, 'a;b\n1;2');
});

test('toCSV: empty input', () => {
    assert.equal(toCSV([]), '');
    assert.equal(toCSV(null), '');
});

test('parseCSV: basic objects keyed by header', () => {
    assert.deepEqual(parseCSV('name,xp\nAna,900\nBudi,1200'), [
        { name: 'Ana', xp: '900' },
        { name: 'Budi', xp: '1200' }
    ]);
});

test('parseCSV: handles quoted fields with commas and doubled quotes', () => {
    const rows = parseCSV('name,note\n"Budi, Jr","says ""hi"""');
    assert.deepEqual(rows, [{ name: 'Budi, Jr', note: 'says "hi"' }]);
});

test('parseCSV: quoted field with embedded newline', () => {
    const rows = parseCSV('a\n"line1\nline2"');
    assert.deepEqual(rows, [{ a: 'line1\nline2' }]);
});

test('parseCSV: accepts CRLF line endings and ignores trailing newline', () => {
    assert.deepEqual(parseCSV('a,b\r\n1,2\r\n'), [{ a: '1', b: '2' }]);
});

test('parseCSV: headers:false returns arrays', () => {
    assert.deepEqual(parseCSV('a,b\n1,2', { headers: false }), [['a', 'b'], ['1', '2']]);
});

test('parseCSV: custom delimiter', () => {
    assert.deepEqual(parseCSV('a;b\n1;2', { delimiter: ';' }), [{ a: '1', b: '2' }]);
});

test('parseCSV: short rows fill missing columns with empty string', () => {
    assert.deepEqual(parseCSV('a,b,c\n1,2'), [{ a: '1', b: '2', c: '' }]);
});

test('parseCSV: empty input', () => {
    assert.deepEqual(parseCSV(''), []);
    assert.deepEqual(parseCSV('', { headers: false }), []);
});

test('roundtrip: toCSV → parseCSV preserves tricky values', () => {
    const data = [
        { name: 'Budi, Jr', note: 'a "quote"\nand newline', xp: '1200' },
        { name: 'Ana', note: 'plain', xp: '900' }
    ];
    const parsed = parseCSV(toCSV(data));
    assert.deepEqual(parsed, data);
});
