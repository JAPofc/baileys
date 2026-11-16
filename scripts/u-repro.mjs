/**
 * scripts/u-repro.mjs --- standalone reproduction for BUGREPORT 2.53, 2.54, 2.55 and 2.56.
 *
 * Every section drives the REAL store / USync code through a stub event emitter, so since
 * the fixes landed it prints the corrected behaviour (empty chat after a device-jid
 * delete, zero stray buckets, a repository that finds its own ids, and a batch that
 * survives one user's error node). Run with: node scripts/u-repro.mjs
 */
import { makeInMemoryStore, ObjectRepository } from '../lib/Store/index.js';
import { USyncQuery } from '../lib/WAUSync/index.js';
import { USyncDeviceProtocol } from '../lib/WAUSync/Protocols/index.js';
import P from 'pino';

const logger = P({ level: 'silent' });
const mkEv = () => { const h = {}; return { on:(e,f)=>{(h[e] ||= []).push(f)}, emit:(e,d)=>{(h[e]||[]).forEach(f=>f(d))} }; };

console.log('=== 1) messages.delete {all} uses the RAW jid ===');
{
  const store = makeInMemoryStore({ logger }); const ev = mkEv(); store.bind(ev);
  ev.emit('messages.upsert', { type:'notify', messages:[{ key:{ id:'M1', remoteJid:'628111:5@s.whatsapp.net' }, messageTimestamp:1 }] });
  console.log(' bucket keys after upsert:', Object.keys(store.messages));
  ev.emit('messages.delete', { jid: '628111:5@s.whatsapp.net', all: true });
  console.log(" delete {all, jid:'628111:5@s.whatsapp.net'} -> messages left:", store.messages['628111@s.whatsapp.net']?.array.length);
  ev.emit('messages.delete', { jid: '628111@s.whatsapp.net', all: true });
  console.log(' delete with the normalized jid    -> messages left:', store.messages['628111@s.whatsapp.net']?.array.length);
}

console.log('\n=== 2) messages.update creates a permanent empty bucket for unknown chats ===');
{
  const store = makeInMemoryStore({ logger }); const ev = mkEv(); store.bind(ev);
  console.log(' buckets before:', Object.keys(store.messages).length);
  for (let i = 0; i < 5; i++) ev.emit('messages.update', [{ key:{ id:'X'+i, remoteJid:`spam${i}@s.whatsapp.net` }, update:{ status:3 } }]);
  console.log(' buckets after 5 updates for unknown messages:', Object.keys(store.messages).length, Object.keys(store.messages));
  console.log(' all empty?', Object.values(store.messages).every(l => l.array.length === 0));
}

console.log('\n=== 3) ObjectRepository does not survive its own toJSON ===');
{
  const repo = new ObjectRepository({ L1: { id:'L1', name:'Work' }, L2: { id:'L2', name:'Family' } });
  const json = JSON.parse(JSON.stringify(repo));
  console.log(' toJSON ->', JSON.stringify(json));
  const restored = new ObjectRepository(json);
  console.log(" restored.findById('L1') ->", restored.findById('L1'));
  console.log(' restored keys ->', [...restored.entityMap.keys()]);
}

console.log('\n=== 4) USyncDeviceProtocol.parser ===');
{
  const p = new USyncDeviceProtocol();
  const node = { tag:'devices', attrs:{}, content:[{ tag:'device-list', attrs:{}, content:[
    { tag:'device', attrs:{ id:'0' } }, { tag:'device', attrs:{ id:'2', 'key-index':'7' } }, { tag:'device', attrs:{} } ] }] };
  console.log(' parsed devices:', JSON.stringify(p.parser(node)));
  const q = new USyncQuery().withDeviceProtocol();
  const iq = { tag:'iq', attrs:{type:'result'}, content:[{ tag:'usync', attrs:{}, content:[{ tag:'list', attrs:{}, content:[
    { tag:'user', attrs:{ jid:'1@s.whatsapp.net' }, content:[{ tag:'devices', attrs:{}, content:[{ tag:'device-list', attrs:{}, content:[{ tag:'device', attrs:{ id:'0' } }] }] }] },
    { tag:'user', attrs:{ jid:'2@s.whatsapp.net' }, content:[{ tag:'devices', attrs:{}, content:[{ tag:'error', attrs:{ code:'403' } }] }] },
    { tag:'user', attrs:{ jid:'3@s.whatsapp.net' }, content:[{ tag:'devices', attrs:{}, content:[{ tag:'device-list', attrs:{}, content:[{ tag:'device', attrs:{ id:'0' } }] }] }] } ] }] }] };
  try { console.log(' whole-query parse ->', JSON.stringify(q.parseUSyncQueryResult(iq))); }
  catch (e) { console.log(' whole-query parse THREW:', e.constructor.name + ':', e.message, '<- users 1 and 3 lost too'); }
}
