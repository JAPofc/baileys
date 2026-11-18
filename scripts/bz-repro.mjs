// Batch BW — §2.139: the three usync protocols still missing after Batch BU.
import { USyncQuery, USyncUser, USYNC_FEATURES, USyncFeatureProtocol, USyncTextStatusProtocol, USyncSidelistProtocol } from '../lib/index.js';
const show = v => (v === undefined ? 'undefined' : v === null ? 'null' : v instanceof Date ? v.toISOString() : JSON.stringify(v));

console.log('--- feature flags: wire strings become booleans ---');
const feat = new USyncFeatureProtocol(['voip', 'encrypt_v2', 'bot_eligible']);
console.log('  query :', JSON.stringify(feat.getQueryElement()));
console.log('  parsed:', JSON.stringify(feat.parser({
    tag: 'feature', attrs: {}, content: [
        { tag: 'voip', attrs: { value: 'true' } },
        { tag: 'encrypt_v2', attrs: { value: 'false' } },
        { tag: 'bot_eligible', attrs: { value: '2' } },
        { tag: 'document', attrs: {} }
    ]
})));
console.log('  defaults to all', USYNC_FEATURES.length, 'known flags');

console.log('--- text status: no 1970, no Invalid Date (lesson from §2.133) ---');
const ts = new USyncTextStatusProtocol();
for (const attrs of [
    { text: 'Busy', last_update_time: '1700000000', ephemeral_duration_sec: '86400' },
    { text: 'Busy', last_update_time: '1700000000' },
    { text: 'Busy' },
    { text: 'Busy', ephemeral_duration_sec: '86400' },
    { text: 'Busy', last_update_time: 'xx' }
]) {
    const out = ts.parser({ tag: 'text_status', attrs, content: [{ tag: 'emoji', attrs: {}, content: Buffer.from('fire') }] });
    console.log(`  ${JSON.stringify(attrs)}`);
    console.log(`    -> setAt=${show(out.setAt)} expiresAt=${show(out.expiresAt)}`);
}
console.log('  (every fork this was cross-checked against returns 1970 when last_update_time is absent)');

console.log('--- sidelist ---');
const sl = new USyncSidelistProtocol();
console.log('  query        :', JSON.stringify(sl.getQueryElement()));
console.log('  without lid  :', JSON.stringify(new USyncSidelistProtocol(false).getQueryElement()));
console.log('  delete elem  :', JSON.stringify(sl.getUserElement({ sidelistDelete: true })));
console.log('  both spellings:', JSON.stringify(sl.parser({ tag: 'side_list', attrs: { type: 'add' } })));

console.log('--- all three in one query, alongside the §2.134 pair ---');
const q = new USyncQuery().withTextStatusProtocol().withFeatureProtocol(['voip']).withSidelistProtocol().withPictureProtocol()
    .withUsers(new USyncUser().withId('62811@s.whatsapp.net'));
console.log('  protocols:', q.protocols.map(p => p.name).join(', '));
const result = { tag: 'iq', attrs: { type: 'result' }, content: [{ tag: 'usync', attrs: {}, content: [{
    tag: 'list', attrs: {}, content: [{ tag: 'user', attrs: { jid: '62811@s.whatsapp.net' }, content: [
        { tag: 'text_status', attrs: { text: 'At work', last_update_time: '1700000000' } },
        { tag: 'feature', attrs: {}, content: [{ tag: 'voip', attrs: { value: 'true' } }] }
    ] }]
}] }] };
console.log(' ', JSON.stringify(q.parseUSyncQueryResult(result).list));
