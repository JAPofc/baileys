// Batch BU — §2.133 wire timestamps, §2.134 batched picture/business usync protocols.
import { USyncStatusProtocol } from '../lib/WAUSync/Protocols/USyncStatusProtocol.js';
import { USyncDisappearingModeProtocol } from '../lib/WAUSync/Protocols/USyncDisappearingModeProtocol.js';
import { USyncQuery, USyncUser } from '../lib/index.js';

const show = v => (v === undefined ? 'undefined' : v instanceof Date ? (Number.isNaN(+v) ? 'Invalid Date' : v.toISOString()) : JSON.stringify(v));

console.log('--- §2.133 a status timestamp straight off the wire ---');
const status = new USyncStatusProtocol();
for (const attrs of [{ t: '1700000000' }, {}, { t: 'abc' }, { t: '' }, { t: '0' }]) {
    const out = status.parser({ tag: 'status', attrs, content: Buffer.from('hi') });
    console.log(`  attrs=${JSON.stringify(attrs)} -> setAt = ${show(out.setAt)}`);
}
console.log('  (before: {} -> 1970-01-01, "abc" -> Invalid Date whose .toISOString() throws)');

console.log('--- §2.133 disappearing mode ---');
const dm = new USyncDisappearingModeProtocol();
for (const attrs of [{ duration: '604800', t: '1700000000' }, { t: '1700000000' }, { duration: '604800' }]) {
    const out = dm.parser({ tag: 'disappearing_mode', attrs });
    console.log(`  attrs=${JSON.stringify(attrs)} -> duration=${show(out.duration)} setAt=${show(out.setAt)} (before: NaN / 1970)`);
}

console.log('--- §2.134 one usync query for pictures and business details ---');
const q = new USyncQuery().withPictureProtocol('image').withBusinessProtocol().withUsers(
    new USyncUser().withId('62811@s.whatsapp.net'),
    new USyncUser().withId('62822@s.whatsapp.net')
);
console.log('  query elements:', JSON.stringify(q.protocols.map(p => p.getQueryElement())));
const result = {
    tag: 'iq',
    attrs: { type: 'result' },
    content: [{
        tag: 'usync', attrs: {}, content: [{
            tag: 'list', attrs: {}, content: [
                {
                    tag: 'user', attrs: { jid: '62811@s.whatsapp.net' }, content: [
                        { tag: 'picture', attrs: { id: '172', type: 'image', url: 'https://pps.whatsapp.net/v/t61/1.jpg', direct_path: '/v/t61/1.jpg', hash: 'abc=' } },
                        { tag: 'business', attrs: {}, content: [
                            { tag: 'verified_name', attrs: { verified_level: 'high' }, content: Buffer.from('Toko Kopi') },
                            { tag: 'profile', attrs: { tag: 'v1', catalog_exists: 'true', cart_enabled: 'false' }, content: [
                                { tag: 'address', attrs: {}, content: Buffer.from('Jl. Sudirman 1, Jakarta') },
                                { tag: 'business_hours', attrs: { timezone: 'Asia/Jakarta' }, content: [
                                    { tag: 'business_hours_config', attrs: { day_of_week: 'mon', open_time: '0900', close_time: '1700', mode: 'specific_hours' } }
                                ] }
                            ] }
                        ] }
                    ]
                },
                { tag: 'user', attrs: { jid: '62822@s.whatsapp.net' }, content: [{ tag: 'picture', attrs: { error: 'not-authorized', code: '401' } }] }
            ]
        }]
    }]
};
console.log('  parsed:', JSON.stringify(q.parseUSyncQueryResult(result), null, 1));
