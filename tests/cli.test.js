import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../lib/cli.js', import.meta.url));

const run = (...args) =>
    spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', timeout: 30_000 });

describe('cli: npx @japofc/baileys', () => {
    it('version prints the package version', () => {
        const r = run('version');
        assert.equal(r.status, 0);
        assert.match(r.stdout.trim(), /^\d+\.\d+\.\d+/);
    });

    it('help (and no args) prints usage and exits 0', () => {
        for (const args of [['help'], []]) {
            const r = run(...args);
            assert.equal(r.status, 0);
            assert.match(r.stdout, /Usage:/);
            assert.match(r.stdout, /doctor/);
        }
    });

    it('doctor prints the environment report; exit 0/1 mirrors env.ok', () => {
        const r = run('doctor');
        assert.match(r.stdout, /environment check/);
        assert.match(r.stdout, /optional packages:/);
        assert.ok(r.status === 0 || r.status === 1);
    });

    it('unknown command exits 2 with an error', () => {
        const r = run('nonsense');
        assert.equal(r.status, 2);
        assert.match(r.stderr, /Unknown command: nonsense/);
    });
});
