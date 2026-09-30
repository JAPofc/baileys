// Tests for the v2.4.6 pagination + text-table helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paginate, pageIndicator, pageCount } from '../lib/Utils/pagination.js';
import { textTable } from '../lib/Utils/text-table.js';

const nums = (n) => Array.from({ length: n }, (_, i) => i + 1);

test('paginate: middle page slice + metadata', () => {
    const p = paginate(nums(37), { page: 2, perPage: 10 });
    assert.deepEqual(p.items, [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    assert.equal(p.total, 37);
    assert.equal(p.pages, 4);
    assert.equal(p.hasPrev, true);
    assert.equal(p.hasNext, true);
    assert.equal(p.start, 11);
    assert.equal(p.end, 20);
    assert.equal(p.isEmpty, false);
});

test('paginate: last page partial', () => {
    const p = paginate(nums(37), { page: 4, perPage: 10 });
    assert.deepEqual(p.items, [31, 32, 33, 34, 35, 36, 37]);
    assert.equal(p.hasNext, false);
    assert.equal(p.start, 31);
    assert.equal(p.end, 37);
});

test('paginate: page clamps into range', () => {
    assert.equal(paginate(nums(37), { page: 99, perPage: 10 }).page, 4);
    assert.equal(paginate(nums(37), { page: 0, perPage: 10 }).page, 1);
    assert.equal(paginate(nums(37), { page: -5, perPage: 10 }).page, 1);
});

test('paginate: empty list → one empty page', () => {
    const p = paginate([], { page: 1, perPage: 10 });
    assert.deepEqual(p.items, []);
    assert.equal(p.pages, 1);
    assert.equal(p.page, 1);
    assert.equal(p.isEmpty, true);
    assert.equal(p.start, 0);
    assert.equal(p.end, 0);
    assert.equal(p.hasPrev, false);
    assert.equal(p.hasNext, false);
});

test('paginate: perPage floors to >= 1', () => {
    assert.equal(paginate(nums(5), { perPage: 0 }).perPage, 1);
});

test('pageIndicator: arrows appear only when a neighbor exists', () => {
    assert.equal(pageIndicator(1, 4), '1/4 ›');
    assert.equal(pageIndicator(2, 4), '‹ 2/4 ›');
    assert.equal(pageIndicator(4, 4), '‹ 4/4');
    assert.equal(pageIndicator(1, 1), '1/1');
});

test('pageCount', () => {
    assert.equal(pageCount(0, 10), 1);
    assert.equal(pageCount(37, 10), 4);
    assert.equal(pageCount(10, 10), 1);
    assert.equal(pageCount(11, 10), 2);
});

test('textTable: aligned columns with header + separator', () => {
    const out = textTable([['Ana', '1200'], ['Budi', '900']], { headers: ['Name', 'XP'], align: ['left', 'right'] });
    assert.equal(out, [
        'Name │   XP',
        '─────┼─────',
        'Ana  │ 1200',
        'Budi │  900'
    ].join('\n'));
});

test('textTable: no headers, left aligned', () => {
    const out = textTable([['a', 'bb'], ['ccc', 'd']]);
    assert.equal(out, 'a   │ bb\nccc │ d');
});

test('textTable: center alignment', () => {
    const out = textTable([['x']], { headers: ['abcd'], align: ['center'] });
    assert.equal(out.split('\n')[2], ' x'); // 'x' centered in width 4 → ' x  ' then trailing trimmed → ' x'
});

test('textTable: stringifies non-string cells and fills ragged rows', () => {
    const out = textTable([[1, 2, 3], [4]], { separator: ' ' });
    assert.equal(out, '1 2 3\n4');
});

test('textTable: fence wraps in code block; empty input', () => {
    assert.equal(textTable([['a']], { fence: true }), '```\na\n```');
    assert.equal(textTable([]), '');
    assert.equal(textTable([], { fence: true }), '```\n\n```');
});
