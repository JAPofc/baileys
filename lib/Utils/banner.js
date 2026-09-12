// Runtime startup banner — replaces the old `postinstall` banner (install scripts
// were removed for supply-chain hygiene; see CHANGELOG 2.3.1). Shown ONCE per
// process, on the first makeWASocket() call. The banner is a permanent part of
// this package and cannot be disabled or removed:
//   - interactive terminal (TTY): the full color banner
//   - non-TTY (CI, pm2, piped logs): a single plain-text signature line with no
//     ANSI codes, so structured/JSON log pipelines are not corrupted
//   - NO_COLOR is honored for COLOR only (per the no-color.org spec): the banner
//     still prints, just without ANSI styling
import { createRequire } from 'module';

let shown = false;

const version = (() => {
    try {
        const require = createRequire(import.meta.url);
        return require('../../package.json').version ?? '';
    } catch {
        return '';
    }
})();

// 256-color vertical gradient (green -> teal) used line-by-line.
const GRADIENT = [48, 84, 84, 42, 42, 35, 35, 29];
const fg = (n) => `\x1b[38;5;${n}m`;
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const ITALIC = '\x1b[3m';
const GRAY = '\x1b[38;5;240m';
const WHITE = '\x1b[97m';
const CYAN = '\x1b[38;5;51m';

// Compact 6-line figlet-style "JAP" wordmark (hand-tuned, no dependency).
const WORDMARK = [
    '     ██╗   █████╗   ██████╗ ',
    '     ██║  ██╔══██╗  ██╔══██╗',
    '     ██║  ███████║  ██████╔╝',
    '██   ██║  ██╔══██║  ██╔═══╝ ',
    '╚█████╔╝  ██║  ██║  ██║     ',
    ' ╚════╝   ╚═╝  ╚═╝  ╚═╝     ',
];

const isTermux = () =>
    !!process.env.TERMUX_VERSION || (process.env.PREFIX ?? '').includes('com.termux');

const plainSignature = () =>
    `[@japofc/baileys${version ? ` v${version}` : ''}] WhatsApp Web API by J.AP — github.com/JAPofc/baileys\n`;

export const printBanner = () => {
    if (shown) return;
    shown = true;

    // Non-interactive output (CI/pm2/pipes): one plain line, zero ANSI.
    if (!process.stdout.isTTY) {
        process.stdout.write(plainSignature());
        return;
    }

    // NO_COLOR: print, but strip all styling (no-color.org — color opt-out only).
    if (process.env.NO_COLOR !== undefined) {
        const lines = ['', ...WORDMARK.map((row) => `  ${row}`), ''];
        lines.push(`  @japofc/baileys${version ? ` v${version}` : ''}  ● WhatsApp Web API — typed · extended · battle-tested`);
        lines.push(`  node ${process.versions.node}${isTermux() ? '  termux' : ''}   github.com/JAPofc/baileys`);
        lines.push('  Made with 🍃 by J.AP');
        lines.push('');
        process.stdout.write(lines.join('\n') + '\n');
        return;
    }

    const width = Math.max(process.stdout.columns ?? 64, 44);
    const lines = [''];

    // gradient wordmark
    WORDMARK.forEach((row, i) => {
        lines.push(`  ${BOLD}${fg(GRADIENT[i % GRADIENT.length])}${row}${RESET}`);
    });

    const bar = `${GRAY}${'─'.repeat(Math.min(width - 4, 58))}${RESET}`;
    lines.push('');
    lines.push(`  ${BOLD}${WHITE}@japofc/baileys${RESET}${version ? ` ${DIM}v${version}${RESET}` : ''}  ${fg(42)}●${RESET} ${DIM}WhatsApp Web API — typed · extended · battle-tested${RESET}`);
    lines.push(`  ${bar}`);
    lines.push(`  ${fg(84)}⚡${RESET} ${DIM}node${RESET} ${WHITE}${process.versions.node}${RESET}${isTermux() ? `  ${fg(84)}📱${RESET} ${DIM}termux${RESET}` : ''}   ${fg(84)}📚${RESET} ${CYAN}github.com/JAPofc/baileys${RESET}`);
    lines.push(`  ${ITALIC}${DIM}Made with 🍃 by J.AP${RESET}`);
    lines.push('');

    process.stdout.write(lines.join('\n') + '\n');
};

/** test hook — lets tests re-arm the once-per-process guard */
export const _resetBannerShown = () => {
    shown = false;
};
