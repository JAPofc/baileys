import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { proto } from '../WAProto/index.js';

const collectTypes = (ns, prefix, out) => {
    for (const [name, T] of Object.entries(ns)) {
        if (!T || typeof T !== 'function') continue;
        if (typeof T.encode === 'function' && typeof T.decode === 'function' && typeof T.fromObject === 'function') {
            out.push([`${prefix}${name}`, T]);
        }
    }
    return out;
};

const ALL = [
    ...collectTypes(proto, 'proto.', []),
    ...collectTypes(proto.Message, 'proto.Message.', []),
];

describe(`protocol regression (${ALL.length} message types)`, () => {
    it('every type roundtrips empty without throwing', () => {
        assert.ok(ALL.length > 150, `expected 150+ types, got ${ALL.length}`);
        const failures = [];
        for (const [name, T] of ALL) {
            try {
                const m = T.fromObject({});
                const bytes = T.encode(m).finish();
                const back = T.decode(bytes.length ? bytes : new Uint8Array(0));
                const obj = T.toObject(back);
                assert.equal(typeof obj, 'object', `${name}: toObject`);
            } catch (err) {
                failures.push(`${name}: ${err.message}`);
            }
        }
        assert.deepEqual(failures, []);
    });

    it('MediaKeyDomain enum + fields intact on all 5 media types', () => {
        assert.deepEqual({ ...proto.Message.MediaKeyDomain },
            { UNSET: 0, E2EE_CHAT: 1, STATUS: 2, CAPI: 3, BOT: 4 });
        for (const X of ['AudioMessage', 'DocumentMessage', 'ImageMessage', 'StickerMessage', 'VideoMessage']) {
            const T = proto.Message[X];
            const d = T.decode(T.encode(T.fromObject({ mediaKeyDomain: 1 })).finish());
            assert.equal(d.mediaKeyDomain, 1, X);
        }
    });
});
