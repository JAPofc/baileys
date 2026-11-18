// Batch BQ repro — §2.123 negative lengths, §2.124 recursion depth, §2.125 __proto__ attrs.
// Every buffer below is a hand-built WhatsApp binary node (uncompressed, no 0x00 prefix).
import * as constants from '../lib/WABinary/constants.js';
import { decodeDecompressedBinaryNode, MAX_BINARY_NODE_DEPTH } from '../lib/WABinary/decode.js';
const T = constants.TAGS;

console.log('--- §2.123 a BINARY_32 length with the high bit set ---');
const neg = Buffer.from([T.LIST_8, 2, 1, T.BINARY_32, 0xff, 0xff, 0xff, 0xff, 0x41, 0x42]);
const ref = { index: 0 };
try {
    const out = decodeDecompressedBinaryNode(neg, constants, ref);
    console.log('decoded', JSON.stringify(out), '| cursor', ref.index, 'of', neg.length, '(before the fix: empty content and a cursor that moved BACKWARDS, 8 -> 7)');
} catch (e) {
    console.log('rejected:', e.message, '| cursor', ref.index, '(before the fix: silently returned empty content and rewound the cursor)');
}

console.log('--- §2.124 nested lists ---');
const deep = n => {
    const parts = [];
    for (let i = 0; i < n; i++) parts.push(T.LIST_8, 2, 1, T.LIST_8, 1);
    parts.push(T.LIST_8, 1, 1);
    return Buffer.from(parts);
};
for (const d of [100, 5000]) {
    try {
        decodeDecompressedBinaryNode(deep(d), constants);
        console.log(`depth ${d} => decoded`);
    } catch (e) {
        console.log(`depth ${d} => ${e.constructor.name}: ${e.message} (before the fix: RangeError, Maximum call stack size exceeded)`);
    }
}
console.log('MAX_BINARY_NODE_DEPTH =', MAX_BINARY_NODE_DEPTH);

console.log('--- §2.125 an attribute literally named __proto__ ---');
const protoAttr = Buffer.from([
    T.LIST_8, 3, 1,
    T.BINARY_8, 9, ...Buffer.from('__proto__'),
    T.BINARY_8, 3, ...Buffer.from('bad')
]);
const node = decodeDecompressedBinaryNode(protoAttr, constants);
console.log('attrs keys =', Object.keys(node.attrs), '| value =', node.attrs['__proto__'], '(before the fix: [] and undefined — the attribute was swallowed by the prototype setter)');
console.log('prototype intact =', Object.getPrototypeOf({}) === Object.prototype);
