import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function walk(dir, out = []) {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory())
            await walk(p, out);
        else
            out.push(p);
    }
    return out;
}

// Guards the "Full .d.ts" claim: every shipped .js must have a matching,
// TypeScript-recognized .d.ts, with no underscore (*_d.ts) strays and no
// dangling sourceMappingURL comments pointing at .map files that don't ship.
describe('types parity: every .js ships a matching .d.ts', () => {
    it('no .js without a sibling .d.ts (lib/ + WAProto/)', async () => {
        const files = [...(await walk(join(ROOT, 'lib'))), ...(await walk(join(ROOT, 'WAProto')))];
        const missing = files
            .filter((f) => f.endsWith('.js'))
            .map((f) => f.slice(0, -3) + '.d.ts')
            .filter((d) => !files.includes(d))
            .map((d) => d.slice(ROOT.length + 1));
        assert.deepEqual(missing, []);
    });
    it('no *_d.ts strays (underscore suffix is invisible to TypeScript)', async () => {
        const files = [...(await walk(join(ROOT, 'lib'))), ...(await walk(join(ROOT, 'WAProto')))];
        assert.deepEqual(files.filter((f) => f.endsWith('_d.ts')), []);
    });
    it('no dangling sourceMappingURL (0 .map files ship)', async () => {
        const files = [...(await walk(join(ROOT, 'lib'))), ...(await walk(join(ROOT, 'WAProto')))];
        const maps = new Set(files.filter((f) => f.endsWith('.js.map')));
        const dangling = [];
        for (const f of files.filter((f) => f.endsWith('.js'))) {
            const src = await fs.readFile(f, 'utf8');
            const m = src.match(/sourceMappingURL=(\S+\.js\.map)/);
            if (m && ![...maps].some((x) => x.endsWith('/' + m[1]))) {
                dangling.push(f.slice(ROOT.length + 1));
            }
        }
        assert.deepEqual(dangling, []);
    });
});
