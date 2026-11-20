// Tests for the v2.4.6 args-parser (tokenizeArgs / parseArgs / parseCommand).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenizeArgs, parseArgs, parseCommand } from '../lib/Utils/args-parser.js';

test('tokenizeArgs: quotes, escapes, whitespace', () => {
    assert.deepEqual(tokenizeArgs('add "John Doe" 25'), ['add', 'John Doe', '25']);
    assert.deepEqual(tokenizeArgs("say 'hello world' now"), ['say', 'hello world', 'now']);
    assert.deepEqual(tokenizeArgs('a  b   c'), ['a', 'b', 'c']);
    assert.deepEqual(tokenizeArgs('esc \\"quoted\\"'), ['esc', '"quoted"']);
    assert.deepEqual(tokenizeArgs('unterminated "open'), ['unterminated', 'open']);
    assert.deepEqual(tokenizeArgs(''), []);
    assert.deepEqual(tokenizeArgs('   '), []);
});

test('tokenizeArgs: an explicit empty quoted string is a token', () => {
    assert.deepEqual(tokenizeArgs('empty "" tok'), ['empty', '', 'tok']);
});

test('tokenizeArgs: backslash is literal inside single quotes', () => {
    assert.deepEqual(tokenizeArgs("path 'a\\b'"), ['path', 'a\\b']);
});

test('parseArgs: mixed flags, aliases and booleans', () => {
    assert.deepEqual(
        parseArgs('--to=all --pin -f "hi there"', { booleans: ['pin', 'force'], alias: { f: 'force' } }),
        { _: ['hi there'], to: 'all', pin: true, force: true }
    );
});

test('parseArgs: --key value consumes the next token when not boolean', () => {
    assert.deepEqual(parseArgs('--key value pos'), { _: ['pos'], key: 'value' });
});

test('parseArgs: a non-boolean short flag consumes its value', () => {
    assert.deepEqual(parseArgs('-n 5'), { _: [], n: '5' });
});

test('parseArgs: --no-x sets false', () => {
    assert.deepEqual(parseArgs('--no-cache build'), { _: ['build'], cache: false });
});

test('parseArgs: combined short booleans', () => {
    assert.deepEqual(parseArgs('-abc'), { _: [], a: true, b: true, c: true });
});

test('parseArgs: -k=value form', () => {
    assert.deepEqual(parseArgs('-x=1'), { _: [], x: '1' });
});

test('parseArgs: lone --flag is boolean true', () => {
    assert.deepEqual(parseArgs('--verbose'), { _: [], verbose: true });
});

test('parseArgs: -- stops flag parsing', () => {
    assert.deepEqual(parseArgs('cmd -- --not-a-flag x'), { _: ['cmd', '--not-a-flag', 'x'] });
});

test('parseArgs: repeated flags collect into an array', () => {
    assert.deepEqual(parseArgs('--tag a --tag b'), { _: [], tag: ['a', 'b'] });
});

test('parseArgs: negative numbers stay positional, not flags', () => {
    assert.deepEqual(parseArgs('move -5 -3.14'), { _: ['move', '-5', '-3.14'] });
});

test('parseArgs: defaults merged then overridden', () => {
    assert.deepEqual(
        parseArgs('--level=3', { defaults: { level: '1', mode: 'x' } }),
        { _: [], level: '3', mode: 'x' }
    );
});

test('parseArgs: accepts a pre-tokenized array', () => {
    assert.deepEqual(parseArgs(['--k', 'v', 'p']), { _: ['p'], k: 'v' });
});

test('parseCommand: prefix + command + args + raw argString', () => {
    assert.deepEqual(
        parseCommand('!kick @62812 --silent', { prefixes: ['!', '.'] }),
        { prefix: '!', command: 'kick', args: ['@62812', '--silent'], argString: '@62812 --silent' }
    );
});

test('parseCommand: default prefix, lowercased command', () => {
    assert.deepEqual(parseCommand('!PING'), { prefix: '!', command: 'ping', args: [], argString: '' });
});

test('parseCommand: preserves case when lowerCommand is false', () => {
    assert.equal(parseCommand('!Ping', { lowerCommand: false })?.command, 'Ping');
});

test('parseCommand: quoted args tokenized, argString keeps quotes', () => {
    assert.deepEqual(
        parseCommand('!say "multi word" tail'),
        { prefix: '!', command: 'say', args: ['multi word', 'tail'], argString: '"multi word" tail' }
    );
});

test('parseCommand: null when no prefix / blank', () => {
    assert.equal(parseCommand('no prefix'), null);
    assert.equal(parseCommand('   '), null);
    assert.equal(parseCommand('.ping', { prefixes: ['!'] }), null);
});
