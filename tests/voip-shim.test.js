import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const bootstrapPath = path.join(root, 'lib/VoIP/worker-bootstrap.js');
const modulesPath = path.join(root, 'lib/assets/wasm/worker-modules.js');
const loaderPath = path.join(root, 'lib/assets/wasm/loader.js');

describe('VoIP Metro shim (worker-bootstrap __r)', () => {
    it('real bundle: exports land on module.exports and loaders resolve to functions', () => {
        // Run in a child process so the shim's globals (self, __d, __r) never leak here.
        const script = `
            import fs from 'node:fs'; import vm from 'node:vm';
            await import(${JSON.stringify(bootstrapPath)});
            const prelude = 'var __d = global.__d, __r = global.__r;\\n';
            for (const f of [${JSON.stringify(modulesPath)}, ${JSON.stringify(loaderPath)}])
                new vm.Script(prelude + fs.readFileSync(f, 'utf8'), { filename: f }).runInThisContext();
            const st = global.__r('WAWebVoipStatsTracker');
            if (typeof st.VoipStatsTracker !== 'function') throw new Error('VoipStatsTracker missing: ' + JSON.stringify(Object.keys(st)));
            new st.VoipStatsTracker(); // the exact call that spammed "is not a constructor"
            for (const name of ['WAWebVoipWebWasmLoader', 'WAWebVoipWebWasmLoader.worker']) {
                const m = global.__r(name);
                const resolved = m?.default ?? m?.exports ?? m;
                if (typeof resolved !== 'function') throw new Error(name + ' resolved to ' + typeof resolved);
            }
            const h = global.__r('WAWebVoipJsWorkerMessageHandler');
            if (typeof (h?.default ?? h)?.handleJsWorkerMessage !== 'function') throw new Error('handleJsWorkerMessage missing');
            console.log('OK');
        `;
        const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 60000 });
        assert.match(out, /OK/);
    });

    it('real worker boots to worker_ready with zero shim errors on stderr', async () => {
        const worker = new Worker(bootstrapPath, {
            stdout: true, stderr: true,
            workerData: {
                workerModulesCode: fs.readFileSync(modulesPath, 'utf8'),
                loaderCode: fs.readFileSync(loaderPath, 'utf8'),
                loaderModuleName: 'WAWebVoipWebWasmLoader',
                enableLogs: false,
            },
        });
        let stderrBuf = '';
        worker.stderr.on('data', (d) => { stderrBuf += d.toString(); });
        worker.stdout.on('data', () => { });
        try {
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('no worker_ready within 20s')), 20000);
                worker.on('message', (msg) => {
                    if (msg && msg.type === 'worker_ready') { clearTimeout(timer); resolve(); }
                });
                worker.on('error', (e) => { clearTimeout(timer); reject(e); });
            });
        } finally {
            await worker.terminate();
        }
        const bad = stderrBuf.split('\n').filter((l) =>
            /is not a constructor|resolveLoaderModule failed|loaderCode block failed|MessageHandler resolution failed/.test(l));
        assert.deepEqual(bad, []);
    });
});
