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
  sticker    Set WhatsApp sticker metadata (pack name/author) on a
             .webp file — pure JS, no native deps. Usage:
               sticker <in.webp> [out.webp] [--pack name]
                 [--author name] [--emoji 🔥]
  session    Inspect / repair / move an auth session. Usage:
               session analyze <folder>
               session repair <folder>
               session export <folder> [--out file]
               session import <string-or-file> <folder>
  version    Print the installed package version.
  help       Show this help.

Examples:
  npx @japofc/baileys doctor
  npx @japofc/baileys export dump.json --format csv --out chat.csv
  npx @japofc/baileys sticker in.webp out.webp --pack "My Pack" --author me
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
        case 'sticker': {
            const [input, ...stickerFlags] = rest;
            if (!input) {
                console.error('sticker: missing input file.\nUsage: sticker <in.webp> [out.webp] [--pack name] [--author name] [--emoji 🔥]');
                process.exitCode = 2;
                return;
            }
            const flagVal = (name) => {
                const i = stickerFlags.indexOf(name);
                return i !== -1 && stickerFlags[i + 1] !== undefined ? stickerFlags[i + 1] : undefined;
            };
            const output = stickerFlags[0] && !stickerFlags[0].startsWith('--') ? stickerFlags[0] : input;
            const { readFileSync, writeFileSync } = await import('fs');
            const { setStickerExif, readStickerExif, isWebP } = await import('./Utils/sticker-exif.js');
            let buffer;
            try {
                buffer = readFileSync(input);
            }
            catch (err) {
                console.error(`sticker: cannot read ${input}: ${err.message}`);
                process.exitCode = 2;
                return;
            }
            if (!isWebP(buffer)) {
                console.error('sticker: input is not a WebP file (convert it first, e.g. with ffmpeg)');
                process.exitCode = 2;
                return;
            }
            const emoji = flagVal('--emoji');
            const branded = setStickerExif(buffer, {
                packName: flagVal('--pack') || '',
                author: flagVal('--author') || '',
                ...(emoji ? { emojis: [emoji] } : {})
            });
            writeFileSync(output, branded);
            const meta = readStickerExif(branded);
            console.log(`✅ wrote ${output} (${branded.length} bytes)`);
            console.log(`   pack: ${meta['sticker-pack-name'] || '(none)'} | author: ${meta['sticker-pack-publisher'] || '(none)'} | emojis: ${(meta.emojis || []).join(' ')}`);
            return;
        }
        case 'session': {
            const [sub, ...sessionArgs] = rest;
            const tools = await import('./Utils/session-tools.js');
            if (sub === 'analyze') {
                const [folder] = sessionArgs;
                if (!folder) {
                    console.error('session analyze: missing folder');
                    process.exitCode = 2;
                    return;
                }
                const report = await tools.analyzeAuthState(folder);
                console.log(`📁 ${report.folder}`);
                console.log(`   registered: ${report.registered ? 'yes' : 'NO'}${report.me ? ` (${report.me})` : ''}`);
                console.log(`   files: ${report.totalFiles} (${(report.totalBytes / 1024).toFixed(1)} KB)`);
                for (const [type, count] of Object.entries(report.counts)) {
                    console.log(`   ${type}: ${count}`);
                }
                for (const c of report.corrupted) {
                    console.log(`   ⚠️ corrupted: ${c.file}`);
                }
                for (const issue of report.issues) {
                    console.log(`   ❌ ${issue}`);
                }
                if (report.ok) {
                    console.log('   ✅ session looks healthy');
                }
                process.exitCode = report.ok ? 0 : 1;
                return;
            }
            if (sub === 'repair') {
                const [folder] = sessionArgs;
                if (!folder) {
                    console.error('session repair: missing folder');
                    process.exitCode = 2;
                    return;
                }
                const { repaired, checked } = await tools.repairAuthFolder(folder);
                console.log(repaired.length
                    ? `🔧 quarantined ${repaired.length}/${checked} corrupted file(s): ${repaired.join(', ')}`
                    : `✅ all ${checked} files parse cleanly — nothing to repair`);
                return;
            }
            if (sub === 'export') {
                const [folder, ...flags] = sessionArgs;
                if (!folder) {
                    console.error('session export: missing folder');
                    process.exitCode = 2;
                    return;
                }
                const str = await tools.exportAuthToString(folder);
                const outIdx = flags.indexOf('--out');
                if (outIdx !== -1 && flags[outIdx + 1]) {
                    const { writeFileSync } = await import('fs');
                    writeFileSync(flags[outIdx + 1], str, { mode: 0o600 });
                    console.log(`✅ session exported to ${flags[outIdx + 1]} (${str.length} chars)`);
                }
                else {
                    console.log(str);
                    console.error('⚠️  this string IS your WhatsApp login — never share or commit it');
                }
                return;
            }
            if (sub === 'import') {
                const [source, folder] = sessionArgs;
                if (!source || !folder) {
                    console.error('session import: usage — session import <string-or-file> <folder>');
                    process.exitCode = 2;
                    return;
                }
                let str = source;
                if (!tools.isSessionExportString(str)) {
                    const { readFileSync } = await import('fs');
                    try {
                        str = readFileSync(source, 'utf-8').trim();
                    }
                    catch {
                        console.error('session import: not a session string and not a readable file');
                        process.exitCode = 2;
                        return;
                    }
                }
                const { files } = await tools.importAuthFromString(str, folder);
                console.log(`✅ restored ${files} file(s) into ${folder}`);
                return;
            }
            console.error('session: unknown subcommand. Use analyze | repair | export | import');
            process.exitCode = 2;
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
