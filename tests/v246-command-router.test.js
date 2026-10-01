// Tests for the Framework CommandRouter — the batteries-included command
// dispatcher (prefixes, aliases, args/flags, cooldowns, permission gates, help).
// The dispatch core is clock-injectable and socket-free, so a plain mock ctx
// covers everything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CommandRouter, CommandOutcome, PermissionReason, createGroupAdminResolver } from '../lib/Framework/CommandRouter.js';

const mkctx = (text, over = {}) => {
    const c = { text, remoteJid: '123@s.whatsapp.net', replies: [], reply: async (m) => c.replies.push(m), ...over };
    return c;
};
const makeClock = (start = 1000) => {
    const state = { t: start };
    return { now: () => state.t, advance: (ms) => { state.t += ms; } };
};

test('dispatches a command and augments ctx with command/args/flags', async () => {
    const r = new CommandRouter({ prefixes: ['!', '/'] });
    r.command({ name: 'echo', handler: async (ctx) => ctx.reply(ctx.args.join('|')) });
    const ctx = mkctx('/echo a b c');
    const res = await r.handle(ctx);
    assert.equal(res.outcome, CommandOutcome.OK);
    assert.equal(res.executed, true);
    assert.equal(ctx.command, 'echo');
    assert.equal(ctx.prefix, '/');
    assert.deepEqual(ctx.args, ['a', 'b', 'c']);
    assert.equal(ctx.replies[0], 'a|b|c');
});

test('quoted arguments and --flags are parsed via args-parser', async () => {
    const r = new CommandRouter();
    r.command({ name: 'add', booleans: ['force'], alias: { f: 'force' }, handler: async (ctx) => ctx.reply(ctx) });
    const ctx = mkctx('!add "John Doe" 25 -f');
    await r.handle(ctx);
    assert.deepEqual(ctx.args, ['John Doe', '25']);
    assert.equal(ctx.flags.force, true);
});

test('empty text and non-prefixed text do not match', async () => {
    const r = new CommandRouter();
    r.command('ping', async (ctx) => ctx.reply('pong'));
    assert.equal((await r.handle(mkctx(''))).outcome, CommandOutcome.EMPTY);
    assert.equal((await r.handle(mkctx('   '))).outcome, CommandOutcome.EMPTY);
    assert.equal((await r.handle(mkctx('hello'))).outcome, CommandOutcome.NO_PREFIX);
    assert.equal((await r.handle(mkctx(undefined))).outcome, CommandOutcome.EMPTY);
});

test('unknown commands report UNKNOWN and fire onUnknown, without matching', async () => {
    let seen = null;
    const r = new CommandRouter({ onUnknown: (ctx, info) => { seen = info.command; } });
    const res = await r.handle(mkctx('!nope arg'));
    assert.equal(res.outcome, CommandOutcome.UNKNOWN);
    assert.equal(res.matched, false);
    assert.equal(seen, 'nope');
});

test('aliases resolve to the canonical command; duplicate registration throws', async () => {
    const r = new CommandRouter();
    r.command({ name: 'menu', aliases: ['help', 'h'], handler: async (ctx) => ctx.reply('menu') });
    const res = await r.handle(mkctx('!h'));
    assert.equal(res.command, 'menu');
    assert.equal(res.executed, true);
    assert.throws(() => r.command({ name: 'other', aliases: ['menu'], handler: () => {} }), /already registered/);
    assert.throws(() => r.command({ name: 'x' }), /handler/);
});

test('case-insensitive matching can be disabled', async () => {
    const ci = new CommandRouter();
    ci.command('Ping', async (ctx) => ctx.reply('a'));
    assert.equal((await ci.handle(mkctx('!PING'))).executed, true);

    const cs = new CommandRouter({ caseInsensitive: false });
    cs.command('Ping', async (ctx) => ctx.reply('a'));
    assert.equal((await cs.handle(mkctx('!ping'))).outcome, CommandOutcome.UNKNOWN);
    assert.equal((await cs.handle(mkctx('!Ping'))).executed, true);
});

test('ownerOnly is device-agnostic and exempts owners from cooldowns', async () => {
    const clock = makeClock();
    const r = new CommandRouter({ ownerJids: ['62811@s.whatsapp.net'], now: clock.now, cooldownMs: 10000 });
    r.command({ name: 'stop', ownerOnly: true, handler: async (ctx) => ctx.reply('bye') });
    // non-owner denied
    assert.equal((await r.handle(mkctx('!stop', { sender: '62899@s.whatsapp.net' }))).reason, PermissionReason.OWNER);
    // owner with a device suffix still matches, and can run repeatedly (no cooldown)
    assert.equal((await r.handle(mkctx('!stop', { sender: '62811:7@s.whatsapp.net' }))).executed, true);
    assert.equal((await r.handle(mkctx('!stop', { sender: '62811@s.whatsapp.net' }))).executed, true);
});

test('groupOnly / privateOnly gate on chat kind', async () => {
    const r = new CommandRouter();
    r.command({ name: 'kick', groupOnly: true, handler: async (ctx) => ctx.reply('k') });
    r.command({ name: 'pm', privateOnly: true, handler: async (ctx) => ctx.reply('p') });
    assert.equal((await r.handle(mkctx('!kick', { isGroup: false, sender: 'a@s' }))).reason, PermissionReason.GROUP);
    assert.equal((await r.handle(mkctx('!kick', { isGroup: true, sender: 'a@s' }))).executed, true);
    assert.equal((await r.handle(mkctx('!pm', { isGroup: true, sender: 'a@s' }))).reason, PermissionReason.PRIVATE);
    assert.equal((await r.handle(mkctx('!pm', { isGroup: false, sender: 'a@s' }))).executed, true);
});

test('adminOnly consults the isAdmin resolver (only inside groups)', async () => {
    const r = new CommandRouter({ isAdmin: async (ctx) => ctx.sender === 'admin@s' });
    r.command({ name: 'ban', adminOnly: true, handler: async (ctx) => ctx.reply('banned') });
    assert.equal((await r.handle(mkctx('!ban', { isGroup: true, sender: 'user@s' }))).reason, PermissionReason.ADMIN);
    assert.equal((await r.handle(mkctx('!ban', { isGroup: true, sender: 'admin@s' }))).executed, true);
    // outside a group the admin gate is skipped
    assert.equal((await r.handle(mkctx('!ban', { isGroup: false, sender: 'user@s' }))).executed, true);
});

test('a custom permission function can deny with reason "custom"', async () => {
    const r = new CommandRouter();
    r.command({ name: 'vip', permission: async (ctx) => ctx.sender === 'vip@s', handler: async (ctx) => ctx.reply('ok') });
    assert.equal((await r.handle(mkctx('!vip', { sender: 'x@s' }))).reason, PermissionReason.CUSTOM);
    assert.equal((await r.handle(mkctx('!vip', { sender: 'vip@s' }))).executed, true);
});

test('per-user cooldown blocks, reports remaining ms, and clears on expiry', async () => {
    const clock = makeClock();
    const r = new CommandRouter({ now: clock.now, cooldownMs: 5000 });
    r.command({ name: 'daily', handler: async (ctx) => ctx.reply('claimed') });
    assert.equal((await r.handle(mkctx('!daily', { sender: 'u@s' }))).executed, true);
    const blocked = await r.handle(mkctx('!daily', { sender: 'u@s' }));
    assert.equal(blocked.outcome, CommandOutcome.COOLDOWN);
    assert.equal(blocked.remainingMs, 5000);
    // a different user is independent
    assert.equal((await r.handle(mkctx('!daily', { sender: 'v@s' }))).executed, true);
    clock.advance(5000);
    assert.equal((await r.handle(mkctx('!daily', { sender: 'u@s' }))).executed, true);
});

test('resetCooldown and cooldownRemaining behave', async () => {
    const clock = makeClock();
    const r = new CommandRouter({ now: clock.now, cooldownMs: 8000 });
    r.command({ name: 'spin', handler: async () => {} });
    await r.handle(mkctx('!spin', { sender: 'u@s' }));
    assert.equal(r.cooldownRemaining('spin', 'u@s'), 8000);
    r.resetCooldown('spin', 'u@s');
    assert.equal(r.cooldownRemaining('spin', 'u@s'), 0);
});

test('a throwing handler is caught, reported, and releases the cooldown', async () => {
    let captured = null;
    const clock = makeClock();
    const r = new CommandRouter({ now: clock.now, onError: (ctx, info) => { captured = info.error.message; } });
    r.command({ name: 'boom', cooldownMs: 1000, handler: async () => { throw new Error('kaboom'); } });
    const res = await r.handle(mkctx('!boom', { sender: 'u@s' }));
    assert.equal(res.outcome, CommandOutcome.ERROR);
    assert.equal(captured, 'kaboom');
    assert.equal(r.cooldownRemaining('boom', 'u@s'), 0);
});

test('disabled commands match but do not execute', async () => {
    const r = new CommandRouter();
    r.command({ name: 'wip', disabled: true, handler: async (ctx) => ctx.reply('x') });
    const res = await r.handle(mkctx('!wip'));
    assert.equal(res.outcome, CommandOutcome.DISABLED);
    assert.equal(res.matched, true);
    assert.equal(res.executed, false);
});

test('remove() unregisters a command by name or alias', async () => {
    const r = new CommandRouter();
    r.command({ name: 'temp', aliases: ['t'], handler: async () => {} });
    assert.equal(r.has('t'), true);
    assert.equal(r.remove('t'), true);
    assert.equal(r.has('temp'), false);
    assert.equal(r.remove('nope'), false);
});

test('help() groups by category and hides hidden commands; describe() details one', async () => {
    const r = new CommandRouter({ prefixes: ['!'] });
    r.command({ name: 'ping', description: 'pong', category: 'Fun', handler: async () => {} });
    r.command({ name: 'ban', usage: '<user>', category: 'Admin', adminOnly: true, cooldownMs: 3000, aliases: ['b'], handler: async () => {} });
    r.command({ name: 'secret', hidden: true, category: 'Admin', handler: async () => {} });
    const help = r.help();
    assert.match(help, /\*Fun\*/);
    assert.match(help, /• !ping — pong/);
    assert.match(help, /• !ban <user>/);
    assert.ok(!help.includes('secret'));
    assert.deepEqual(r.categories(), ['Fun', 'Admin']);
    const d = r.describe('b');
    assert.match(d, /\*!ban\*/);
    assert.match(d, /Aliases: !b/);
    assert.match(d, /Requires: group admin/);
    assert.equal(r.describe('nope'), null);
});

test('middleware() calls next only when nothing matched', async () => {
    const r = new CommandRouter();
    r.command('ping', async (ctx) => ctx.reply('pong'));
    const mw = r.middleware();
    let nexted = false;
    await mw(mkctx('plain'), async () => { nexted = true; });
    assert.equal(nexted, true);
    nexted = false;
    await mw(mkctx('!ping'), async () => { nexted = true; });
    assert.equal(nexted, false);
});

test('register() adds many; get()/list() reflect the registry', async () => {
    const r = new CommandRouter();
    r.register([
        { name: 'a', handler: async () => {} },
        { name: 'b', hidden: true, handler: async () => {} }
    ]);
    assert.equal(r.list().length, 1);
    assert.equal(r.list({ includeHidden: true }).length, 2);
    assert.equal(r.get('a').name, 'a');
});

test('createGroupAdminResolver reads admin status from group metadata (TTL-cached)', async () => {
    let calls = 0;
    const sock = {
        groupMetadata: async () => {
            calls++;
            return { participants: [
                { id: '62811@s.whatsapp.net', admin: 'superadmin' },
                { id: '62822@s.whatsapp.net', admin: null }
            ] };
        }
    };
    const resolver = createGroupAdminResolver(sock, { cacheMs: 60000 });
    assert.equal(await resolver({ remoteJid: 'g@g.us', sender: '62811:3@s.whatsapp.net' }), true);
    assert.equal(await resolver({ remoteJid: 'g@g.us', sender: '62822@s.whatsapp.net' }), false);
    assert.equal(calls, 1); // second lookup served from cache
    // a metadata failure is swallowed as "not admin"
    const bad = createGroupAdminResolver({ groupMetadata: async () => { throw new Error('offline'); } });
    assert.equal(await bad({ remoteJid: 'g@g.us', sender: 'x@s' }), false);
});
