/**
 * scripts/s-repro.mjs --- standalone reproduction for BUGREPORT 2.47, 2.48 and 2.49.
 *
 * Section A replays the pre-fix onWhatsApp()/pnFromLIDUSync() pairing verbatim (inlined,
 * not imported, so it keeps reproducing after the fix). Sections B and C call the real
 * USyncQuery; since 2.49 landed, C now also prints the errors it used to discard.
 * Run with: node scripts/s-repro.mjs
 */
import { USyncQuery, USyncUser } from '../lib/WAUSync/index.js';
import { isLidUser } from '../lib/WABinary/index.js';

console.log('=== A) onWhatsApp() LID fallback feeds jids that pnFromLIDUSync() rejects ===');
// verbatim loop body of pnFromLIDUSync (socket.js:266-278)
const pnFromLIDUSync = (jids) => {
  const q = new USyncQuery().withLIDProtocol().withContext('background');
  for (const jid of jids) {
    if (isLidUser(jid)) { console.log(`   [warn] LID user found in LID fetch call -> SKIPPED: ${jid}`); continue; }
    q.withUser(new USyncUser().withId(jid));
  }
  if (q.users.length === 0) { console.log('   users.length === 0 -> early return [] (no IQ sent)'); return []; }
  return 'would-query';
};
// onWhatsApp() collects exactly the LID jids and passes them in (socket.js:222-253)
const lidUsers = ['99887766@lid', '11223344@lid'];
console.log(' pnFromLIDUSync(lidUsers) =', JSON.stringify(pnFromLIDUSync(lidUsers)));
console.log(' => every LID arg to onWhatsApp() is silently dropped; the "fallback" never runs.');
console.log(' sanity, a PN goes through:', pnFromLIDUSync(['628111@s.whatsapp.net']));

console.log('\n=== B) parseUSyncQueryResult() returns undefined on a non-result IQ ===');
const q = new USyncQuery().withContactProtocol();
const ok = q.parseUSyncQueryResult({ tag: 'iq', attrs: { type: 'result' }, content: [] });
const bad = q.parseUSyncQueryResult({ tag: 'iq', attrs: { type: 'error' }, content: [] });
console.log(' type=result ->', JSON.stringify(ok));
console.log(' type=error  ->', String(bad));
// onWhatsApp(): `const results = await executeUSyncQuery(q); if (results) { return ... }`  <-- no else
const onWhatsAppReturn = bad ? [] : undefined;
console.log(' onWhatsApp() therefore returns:', String(onWhatsAppReturn));
try { console.log((onWhatsAppReturn).length); } catch (e) { console.log(' caller doing `(await onWhatsApp(x)).length` ->', e.constructor.name + ':', e.message); }

console.log('\n=== C) no error reporting at all (the 3 TODOs) ===');
const errNode = { tag: 'iq', attrs: { type: 'result' }, content: [ { tag: 'usync', attrs: {}, content: [
  { tag: 'result', attrs: {}, content: [ { tag: 'error', attrs: { code: '479', text: 'rate overlimit' } } ] },
  { tag: 'list', attrs: {}, content: [] } ] } ] };
console.log(' server returned a <result><error code="479">, parsed as:', JSON.stringify(q.parseUSyncQueryResult(errNode)));
