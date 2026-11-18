import { Bot } from '../lib/Framework/Bot.js';
import { EventEmitter } from 'events';
const quiet = { error(){}, warn(){}, info(){}, debug(){}, trace(){}, child(){ return quiet } };
const mkSock = (name, log) => ({
    ev: new EventEmitter(),
    sendMessage: async (jid) => { log.push(`${name} sendMessage ${jid}`); return { key: {} } },
    groupMetadata: async () => ({ participants: [] }),
    end: () => log.push(`${name} end()`)
});

console.log('--- A: stop() then a late close event ---');
{
    const log = [];
    const bot = new Bot({ logger: quiet });
    bot.store = { close: () => log.push('store closed') };
    bot.socket = mkSock('sock1', log);
    bot.isConnected = true;
    // emulate what #bindSocketEvents installed
    bot.start = async () => { log.push('!! start() called -> NEW SOCKET'); };
    const sock = bot.socket;
    sock.ev.on('connection.update', (u) => {
        const { connection, lastDisconnect } = u;
        if (connection === 'close') {
            bot.isConnected = false;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode === 401) { bot.rejectQueue('out') }
            else {
                bot.reconnectAttempts++;
                bot.reconnectTimer = setTimeout(() => { bot.reconnectTimer = null; bot.start() }, 5);
            }
        }
    });
    bot.stop();
    console.log('  after stop(): socket.end() called?', log.includes('sock1 end()'));
    console.log('  after stop(): listeners still attached?', sock.ev.listenerCount('connection.update'));
    sock.ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: 500 } } } });
    await new Promise(r => setTimeout(r, 30));
    console.log('  log:', JSON.stringify(log));
}

console.log('--- B: start() twice = two live sockets, both dispatching ---');
{
    const log = [];
    const bot = new Bot({ logger: quiet });
    const s1 = mkSock('sock1', log), s2 = mkSock('sock2', log);
    for (const s of [s1, s2]) {
        bot.socket = s;
        s.ev.on('messages.upsert', async () => { log.push(`${s === s1 ? 'sock1' : 'sock2'} dispatched`) });
    }
    s1.ev.emit('messages.upsert', { messages: [], type: 'notify' });
    s2.ev.emit('messages.upsert', { messages: [], type: 'notify' });
    await new Promise(r => setTimeout(r, 10));
    console.log('  orphaned socket still dispatching:', JSON.stringify(log));
}

console.log('--- C: queue growth during a long outage ---');
{
    const bot = new Bot({ logger: quiet });
    bot.isConnected = false;
    for (let i = 0; i < 100000; i++) bot.sendMessage('1@s.whatsapp.net', { text: 'x'.repeat(10) }).catch(() => {});
    console.log('  queued messages:', bot.messageQueue.length, '(no cap, each holds a never-settled Promise)');
    console.log('  heapUsed MB:', (process.memoryUsage().heapUsed / 1048576).toFixed(1));
    bot.rejectQueue('drop');
}

console.log('--- D: createRouter admin gate before start() ---');
{
    const bot = new Bot({ logger: quiet, ownerJids: ['1@s.whatsapp.net'] });
    const router = bot.createRouter();
    try {
        await router._isAdmin('123@g.us', '1@s.whatsapp.net');
        console.log('  resolver ok');
    } catch (e) { console.log('  resolver THREW:', e.constructor.name, '-', e.message) }
}
