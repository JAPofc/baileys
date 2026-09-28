import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pExecFile = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXAMPLES = join(ROOT, 'examples');

// Keeps examples/ from silently rotting: every script must parse and every
// name it imports from '../lib/index.js' must actually exist in the package.
describe('examples stay valid', () => {
    it('every example passes node --check', async () => {
        const files = (await readdir(EXAMPLES)).filter((f) => f.endsWith('.js'));
        assert.ok(files.length >= 3, 'examples should exist');
        for (const f of files) {
            await pExecFile(process.execPath, ['--check', join(EXAMPLES, f)]);
        }
    });

    it('every imported name resolves against the real package root', async () => {
        const lib = await import('../lib/index.js');
        const files = (await readdir(EXAMPLES)).filter((f) => f.endsWith('.js'));
        for (const f of files) {
            const src = await readFile(join(EXAMPLES, f), 'utf8');
            const m = src.match(/import\s+(?:(\w+)\s*,\s*)?\{([^}]+)\}\s*from\s*'\.\.\/lib\/index\.js'/s);
            assert.ok(m, `${f} must import from ../lib/index.js`);
            if (m[1]) {
                assert.equal(typeof lib.default, 'function', `${f}: default export (makeWASocket) missing`);
            }
            const names = m[2].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
            for (const name of names) {
                assert.ok(name in lib, `${f} imports '${name}' which the package root does not export`);
            }
        }
    });
});
