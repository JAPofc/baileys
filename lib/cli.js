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
  export     Convert a JSON file of WAMessage objects into a chat
             transcript. Usage:
               export <messages.json> [--format text|json|csv]
                 [--out file] [--descriptive] [--reactions]
  version    Print the installed package version.
  help       Show this help.

Examples:
  npx @japofc/baileys doctor
  npx @japofc/baileys export dump.json --format csv --out chat.csv
`;

const run = async () => {
    switch (cmd) {
        case 'doctor': {
            const { printEnvironmentReport } = await import('./Utils/doctor.js');
            const env = await printEnvironmentReport();
            process.exitCode = env.ok ? 0 : 1; // scriptable: non-zero on warnings
            return;
        }
        case 'export': {
            const [file, ...flags] = rest;
            if (!file) {
                console.error('export: missing input file.\nUsage: export <messages.json> [--format text|json|csv] [--out file] [--descriptive] [--reactions]');
                process.exitCode = 2;
                return;
            }
            const { readFileSync, writeFileSync } = await import('fs');
            let messages;
            try {
                const parsed = JSON.parse(readFileSync(file, 'utf-8'));
                // accept a bare array, { messages: [...] }, or a store-like map of arrays
                messages = Array.isArray(parsed)
                    ? parsed
                    : Array.isArray(parsed?.messages)
                        ? parsed.messages
                        : Object.values(parsed).find(Array.isArray);
                if (!Array.isArray(messages)) {
                    throw new Error('no message array found in file');
                }
            } catch (err) {
                console.error(`export: cannot read ${file}: ${err.message}`);
                process.exitCode = 1;
                return;
            }
            const flagValue = (name) => {
                const i = flags.indexOf(name);
                return i !== -1 ? flags[i + 1] : undefined;
            };
            const format = flagValue('--format') ?? 'text';
            const outFile = flagValue('--out');
            const { exportChatAsText, exportChatAsJSON, exportChatAsCSV } = await import('./Utils/chat-export.js');
            let output;
            if (format === 'json') {
                output = JSON.stringify(exportChatAsJSON(messages), null, 2);
            } else if (format === 'csv') {
                output = exportChatAsCSV(messages);
            } else if (format === 'text') {
                output = exportChatAsText(messages, {
                    mediaPlaceholders: flags.includes('--descriptive') ? 'descriptive' : 'omitted',
                    includeReactions: flags.includes('--reactions')
                });
            } else {
                console.error(`export: unknown format '${format}' (use text|json|csv)`);
                process.exitCode = 2;
                return;
            }
            if (outFile) {
                writeFileSync(outFile, output);
                console.log(`Wrote ${messages.length} message(s) to ${outFile} (${format})`);
            } else {
                console.log(output);
            }
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
