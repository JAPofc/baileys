/**
 * scripts/t-repro.mjs --- standalone reproduction for BUGREPORT 2.50, 2.51 and 2.52.
 *
 * Sections A and B call the real makeOrderedDictionary, so since the fix landed they print
 * the corrected behaviour; section C replays the pre-fix store handler verbatim (inlined,
 * not imported) and still reproduces the duplicate member and the boolean admin rank.
 * Run with: node scripts/t-repro.mjs
 */
import { makeOrderedDictionary } from '../lib/Store/make-ordered-dictionary.js';
const waMessageID = (m) => m.key.id || '';

console.log('=== A) makeOrderedDictionary.fromJSON() never rebuilds the id index ===');
const d = makeOrderedDictionary(waMessageID);
const msgs = [{ key: { id: 'AAA' }, status: 2 }, { key: { id: 'BBB' }, status: 2 }];
d.fromJSON(JSON.parse(JSON.stringify(msgs)));
console.log(' array.length      =', d.array.length);
console.log(" get('AAA')        =", d.get('AAA'));
console.log(" updateAssign('AAA', {status:3}) =", d.updateAssign('AAA', { status: 3 }), '<- store logs "got update for non-existent message"');
d.upsert({ key: { id: 'AAA' }, status: 4 }, 'append');
console.log(' after upsert of the SAME id -> array.length =', d.array.length, '| ids:', d.array.map(m => m.key.id));

console.log('\n=== B) update() reports false even when it updated ===');
const d2 = makeOrderedDictionary(waMessageID);
d2.upsert({ key: { id: 'AAA' }, status: 2 }, 'append');
const r = d2.update({ key: { id: 'AAA' }, status: 5 });
console.log(' update() returned:', r, '| but the item really changed ->', JSON.stringify(d2.get('AAA')));
console.log(' update() for a missing id returned:', d2.update({ key: { id: 'ZZZ' } }), '<- indistinguishable');

console.log('\n=== C) group-participants.update "add"/"demote" (make-in-memory-store.js:280-300) ===');
const metadata = { id: 'g@g.us', participants: [{ id: '1@lid', admin: 'superadmin' }, { id: '2@lid', admin: null }] };
// verbatim 'add' branch
const participants = [{ id: '2@lid', admin: null }, { id: '3@lid', admin: null }];
metadata.participants.push(...participants.map(p => ({ id: p.id, phoneNumber: p.phoneNumber, admin: p.admin })));
console.log(' after re-adding an existing member:', metadata.participants.map(p => p.id), '<- 2@lid twice');
// verbatim promote/demote branch
for (const participant of metadata.participants) {
  for (const pd of [{ id: '1@lid' }]) {
    if (pd.id === participant.id || pd.phoneNumber === participant.phoneNumber) participant.admin = 'demote' === 'promote' && 'admin';
  }
}
console.log(' demoted superadmin ->', JSON.stringify(metadata.participants[0]), '<- admin is boolean false, not null');
