#!/usr/bin/env node
// Tiny CLI: `npx @japofc/baileys <command>` — diagnostics without writing code.
// Deliberately dependency-free and side-effect-light: importing heavy socket
// code only happens for commands that need it.

const [, , cmd, ...rest] = process.argv;

const HELP = `
@japofc/baileys CLI

Usage:  npx @japofc/baileys <command>

Commands:
  doctor     Check your environment: Node version, optional deps,
             ffmpeg detection, image backend, warnings.
  version    Print the installed package version.
  help       Show this help.

Examples:
  npx @japofc/baileys doctor
  npx @japofc/baileys version
`;

const run = async () => {
    switch (cmd) {
        case 'doctor': {
            const { printEnvironmentReport } = await import('./Utils/doctor.js');
            const env = await printEnvironmentReport();
            process.exitCode = env.ok ? 0 : 1; // scriptable: non-zero on warnings
            return;
        }
        case 'version':
        case '--version':
        case '-v': {
            const { createRequire } = await import('module');
            const require = createRequire(import.meta.url);
            console.log(require('../package.json').version);
            return;
        }
        case 'help':
        case '--help':
        case '-h':
        case undefined: {
            console.log(HELP);
            return;
        }
        default: {
            console.error(`Unknown command: ${cmd}\n${HELP}`);
            process.exitCode = 2;
        }
    }
    void rest;
};

// Only execute when run directly (node lib/cli.js / the npm bin shim) — never
// on a plain `import`, which would print help output as an import side effect.
import { realpathSync } from 'fs';
import { fileURLToPath } from 'url';

const isDirectRun = (() => {
    try {
        const entry = process.argv[1] ? realpathSync(process.argv[1]) : '';
        return entry === realpathSync(fileURLToPath(import.meta.url));
    } catch {
        return false;
    }
})();

if (isDirectRun) {
    run().catch((err) => {
        console.error('CLI error:', err?.message ?? err);
        process.exitCode = 1;
    });
}
