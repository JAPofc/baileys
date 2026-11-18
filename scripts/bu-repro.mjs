// Batch BR repro — §2.126 admin gates in DMs, §2.127 handle() must never throw,
// §2.128 the group-admin resolver cache must stay bounded.
import { CommandRouter, createGroupAdminResolver } from '../lib/Framework/CommandRouter.js';
const quiet = { error: () => {}, warn: () => {}, info: () => {}, debug: () => {}, trace: () => {}, child: () => quiet };

console.log('--- §2.126 an adminOnly command in a private chat ---');
let ran = 0;
const r = new CommandRouter({ prefixes: '!', isAdmin: async () => false, logger: quiet });
r.command({ name: 'kick', adminOnly: true, botAdmin: true, handler: async () => { ran++ } });
console.log('in a group ->', JSON.stringify(await r.handle({ text: '!kick @x', isGroup: true, sender: '1@s.whatsapp.net' })));
console.log('in a DM    ->', JSON.stringify(await r.handle({ text: '!kick @x', isGroup: false, sender: '1@s.whatsapp.net' })));
console.log('handler executions =', ran, '(before the fix: 1 — the gate was skipped entirely outside a group)');

console.log('--- §2.127 a throwing callback or permission resolver ---');
const r2 = new CommandRouter({ onUnknown: () => { throw new Error('boom from onUnknown') }, logger: quiet });
console.log('onUnknown throws ->', JSON.stringify(await r2.handle({ text: '!nope', sender: 'a@s.whatsapp.net' })), '(before: the error escaped handle())');
const r3 = new CommandRouter({ isAdmin: async () => { throw new Error('metadata fetch failed') }, logger: quiet });
r3.command({ name: 'x', adminOnly: true, handler: async () => { throw new Error('must not run') } });
console.log('isAdmin throws   ->', JSON.stringify(await r3.handle({ text: '!x', isGroup: true, sender: 'a@s.whatsapp.net' }), (k, v) => (k === 'error' ? String(v) : v)), '(before: the error escaped handle())');

console.log('--- §2.128 resolver cache growth over 5000 distinct groups ---');
const sock = { groupMetadata: async () => ({ participants: [] }) };
const resolver = createGroupAdminResolver(sock, { cacheMs: 600000, maxEntries: 500 });
for (let i = 0; i < 5000; i++) await resolver({ remoteJid: `${i}@g.us`, sender: 'a@s.whatsapp.net' });
console.log('cacheSize =', resolver.cacheSize, '(before the fix: 5000, and never released)');
