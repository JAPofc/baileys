/**
 * scripts/r-repro.mjs --- standalone reproduction for BUGREPORT 2.45 and 2.46.
 *
 * Replays the pre-fix expressions from lib/Socket/messages-send.js verbatim (they are
 * inlined here, not imported, so this keeps reproducing the original defects after the
 * fix landed). Run with: node scripts/r-repro.mjs
 */
import { jidDecode, jidEncode, jidNormalizedUser } from '../lib/WABinary/index.js';

console.log('=== A) media conn TTL (messages-send.js:49, 61-68) ===');
// exact parse + expiry expressions in refreshMediaConn()
const parse = (attrs) => ({ ttl: +attrs.ttl, maxLen: +(attrs.maxContentLengthBytes), fetchDate: new Date(Date.now() - 86400_000) });
const isExpired = (media) => new Date().getTime() - media.fetchDate.getTime() > media.ttl * 1000;
for (const attrs of [{ ttl: '300' }, { ttl: undefined }, { ttl: 'abc' }, {}]) {
  const m = parse(attrs);
  console.log(` attrs=${JSON.stringify(attrs).padEnd(18)} ttl=${String(m.ttl).padEnd(5)} -> expired after 24h? ${isExpired(m)}`);
}

console.log('\n=== B) getUSyncDevices duplicate users (messages-send.js:143-191) ===');
// exact loop: jids -> jidsWithUser -> per-entry cache push
const cache = { '628111': [{ user:'628111', server:'s.whatsapp.net', device:0 }, { user:'628111', server:'s.whatsapp.net', device:42 }] };
const run = (jids) => {
  const deviceResults = [];
  const jidsWithUser = jids.map(j => { const d=jidDecode(j); return { jid: jidNormalizedUser(j), user: d?.user }; });
  for (const { user } of jidsWithUser) {
    const devices = cache[user];
    if (devices) deviceResults.push(...devices.map(d => ({ ...d, jid: jidEncode(d.user, d.server, d.device) })));
  }
  return deviceResults;
};
// the self-chat path: getUSyncDevices([senderIdentity, jid]) where both are you
const out = run(['628111@s.whatsapp.net', '628111@s.whatsapp.net']);
console.log(' recipients:', out.map(d => d.jid));
console.log(' unique    :', [...new Set(out.map(d => d.jid))]);
console.log(' DUPLICATED?', out.length !== new Set(out.map(d=>d.jid)).size, `(${out.length} entries, ${new Set(out.map(d=>d.jid)).size} unique)`);
