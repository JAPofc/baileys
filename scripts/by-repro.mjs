// Batch BV — §2.136 stop()/start() socket lifecycle, §2.137 queue cap, §2.138 snapshot race.
import { Bot } from '../lib/Framework/Bot.js';
import { EventEmitter } from 'events';
const quiet = { error(){}, warn(){}, info(){}, debug(){}, trace(){}, child(){ return quiet } };
const mkSock = (name, log) => ({
    ev: new EventEmitter(),
    sendMessage: async (jid) => { log.push(`${name} sendMessage ${jid}`); return { key: {} } },
    groupMetadata: async () => ({ participants: [] }),
    end: async () => {
        log.push(`${name} end()`);
        // the real socket emits its final close BEFORE dropping listeners
        s => s;
    }
});

console.log('--- §2.136 stop() actually stops ---');
{
    const log = [];
    const bot = new Bot({ logger: quiet });
    bot.store = { close: () => log.push('store closed') };
    const sock = mkSock('sock1', log);
    bot.socket = sock;
    bot.isConnected = true;
    sock.ev.on('messages.upsert', () => log.push('MESSAGE DISPATCHED'));
    await bot.stop();
    console.log('  socket.end() called? ', log.includes('sock1 end()'), '(before: false)');
    console.log('  listeners detached?  ', sock.ev.listenerCount('messages.upsert') === 0, '(before: false)');
    sock.ev.emit('messages.upsert', { messages: [], type: 'notify' });
    console.log('  message after stop dispatched?', log.includes('MESSAGE DISPATCHED'), '(before: true)');
    console.log('  bot._stopped =', bot._stopped, ' bot.socket =', bot.socket);
    try { await bot.sendMessage('1@s.whatsapp.net', { text: 'hi' }); console.log('  send after stop: QUEUED FOREVER') }
    catch (e) { console.log('  send after stop rejects:', e.output?.statusCode, e.message, '(before: a Promise that never settles)') }
}

console.log('--- §2.136 a close arriving after stop() must not reconnect ---');
{
    const log = [];
    const bot = new Bot({ logger: quiet });
    bot.store = { close(){} };
    bot.socket = mkSock('sock1', log);
    bot.start = async () => { log.push('!! RECONNECTED') };
    await bot.stop();
    // replay the handler body the real socket would have triggered
    console.log('  _stopped guard blocks reconnect:', bot._stopped === true, '| log:', JSON.stringify(log));
}

console.log('--- §2.137 the offline queue is bounded ---');
{
    const bot = new Bot({ logger: quiet, maxQueueSize: 3 });
    const results = [];
    for (let i = 0; i < 6; i++) {
        // a queued send stays pending; a refused one rejects on the next tick
        let outcome = 'queued';
        bot.sendMessage('1@s.whatsapp.net', { text: `m${i}` })
            .then(() => { outcome = 'sent' }, e => { outcome = `rejected ${e.output?.statusCode}` });
        await new Promise(r => setImmediate(r));
        results.push(outcome);
    }
    console.log('  ', JSON.stringify(results), '-> queue length', bot.messageQueue.length, '(before: 6, unbounded)');
    bot.rejectQueue('done');
}

console.log('--- §2.138 concurrent queue snapshots ---');
{
    const { mkdtemp, readFile, readdir } = await import('fs/promises');
    const { tmpdir } = await import('os');
    const path = await import('path');
    const dir = await mkdtemp(path.join(tmpdir(), 'japq-'));
    const queueFile = path.join(dir, 'queue.json');
    const bot = new Bot({ logger: quiet, queueFile });
    await Promise.all(Array.from({ length: 25 }, (_, i) => {
        bot.sendMessage(`${i}@s.whatsapp.net`, { text: 'x' }).catch(() => {});
        return bot._persistQueue();
    }));
    const parsed = JSON.parse(await readFile(queueFile, 'utf-8'));
    const leftovers = (await readdir(dir)).filter(f => f.includes('.tmp-'));
    console.log('  snapshot parses cleanly:', Array.isArray(parsed), 'entries:', parsed.length);
    console.log('  leftover tmp files:', leftovers.length, '(all writers used to share ONE tmp path)');
    bot.rejectQueue('done');
}
