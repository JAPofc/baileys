// Batch BS repro — §2.129 health keys vs query keys, §2.130 bind()/cap,
// §2.131 retry-manager defaults, error codes and timers.
import { createSessionHealthMonitor } from '../lib/Utils/session-health.js';
import { MessageRetryManager } from '../lib/Utils/message-retry-manager.js';
import { WAMessageStubType } from '../lib/Types/index.js';

const mkEv = () => { const ls = new Set(); return { on: (_, f) => ls.add(f), off: (_, f) => ls.delete(f), emit: u => ls.forEach(f => f(u)) }; };

console.log('--- §2.129 a keyBy-resolved contact, queried by its raw jid ---');
const m = createSessionHealthMonitor({ badMacThreshold: 1, keyBy: () => jid => (jid.endsWith('@lid') ? '62811@s.whatsapp.net' : jid) });
const ev = mkEv();
m.bind({ ev });
ev.emit({ messages: [{ key: { remoteJid: '99999@lid' }, messageStubType: WAMessageStubType.CIPHERTEXT }] });
console.log('stored as      :', JSON.stringify(m.getUnhealthy()));
console.log('isHealthy(lid) :', m.isHealthy('99999@lid'), '(before the fix: true — the contact that had just died reported healthy)');
m.record('99999@lid');
console.log('tracked after record(lid) =', m.getStats().tracked, '(before the fix: 2 — one contact, two entries)');
m.reset('99999@lid');
console.log('tracked after reset(lid)  =', m.getStats().tracked, '(before the fix: 1 — reset missed it)');
m.unbind();

console.log('--- §2.130 destructured bind, and the cap during a burst ---');
const m2 = createSessionHealthMonitor();
const { bind } = m2;
bind({ ev: mkEv() });
try { bind({ ev: mkEv() }); console.log('rebinding destructured bind() -> ok (before: TypeError on this.unbind)'); }
catch (e) { console.log('rebinding destructured bind() ->', e.constructor.name + ':', e.message); }
const m3 = createSessionHealthMonitor({ badMacThreshold: 1, maxTracked: 10 });
for (let i = 0; i < 3000; i++) m3.record(`${i}@s.whatsapp.net`);
console.log('maxTracked=10, tracked after 3000 failing contacts =', m3.getStats().tracked, '(before the fix: 3000 — unhealthy entries were exempt)');

console.log('--- §2.131 retry manager ---');
const log = { debug() {}, warn() {}, info() {}, error() {} };
const r = new MessageRetryManager(log);
console.log('maxMsgRetryCount with no argument =', r.maxMsgRetryCount, '(before the fix: undefined)');
for (let i = 0; i < 50; i++) r.incrementRetryCount('msg1');
console.log('hasExceededMaxRetries after 50 retries =', r.hasExceededMaxRetries('msg1'), '(before the fix: false — unlimited retries)');
console.log("parseRetryErrorCode('4abc') =", r.parseRetryErrorCode('4abc'), "(before the fix: 4 — a MAC error, forcing a session recreation)");
console.log("parseRetryErrorCode('7')    =", r.parseRetryErrorCode('7'));
r.schedulePhoneRequest('m', () => { throw new Error('callback exploded') }, 5);
await new Promise(res => setTimeout(res, 40));
console.log('a throwing phone-request callback did not crash the process (before: uncaught exception)');
