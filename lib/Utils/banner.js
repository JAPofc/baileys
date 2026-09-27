// Runtime startup banner — replaces the old `postinstall` banner (install scripts
// were removed for supply-chain hygiene; see CHANGELOG 2.3.1). Shown ONCE per
// process, on the first makeWASocket() call. The banner is a permanent part of
// this package and cannot be disabled or removed:
//   - interactive terminal (TTY): the full color banner with the info card
//   - non-TTY (CI, pm2, piped logs): a single plain-text signature line with no
//     ANSI codes, so structured/JSON log pipelines are not corrupted
//   - NO_COLOR is honored for COLOR only (per the no-color.org spec): the banner
//     still prints, just without ANSI styling
import { createRequire } from 'module';
import { readFileSync } from 'fs';

let shown = false;

const version = (() => {
    try {
        const require = createRequire(import.meta.url);
        return require('../../package.json').version ?? '';
    } catch {
        return '';
    }
})();

// Baked WA Web client version — read as TEXT (no import: keeps this module
// dependency-free and immune to circular-import surprises).
const waVersion = (() => {
    try {
        const src = readFileSync(new URL('../Defaults/index.js', import.meta.url), 'utf-8');
        const m = src.match(/const version = \[(\d+), (\d+), (\d+)\]/);
        return m ? `${m[1]}.${m[2]}.${m[3]}` : '';
    } catch {
        return '';
    }
})();

// Smooth 256-color leaf gradient (bright green -> deep teal), line by line.
const GRADIENT = [118, 84, 48, 43, 37, 30];
const fg = (n) => `\x1b[38;5;${n}m`;
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const ITALIC = '\x1b[3m';
const GRAY = '\x1b[38;5;240m';
const WHITE = '\x1b[97m';
const CYAN = '\x1b[38;5;51m';
const GREEN = '\x1b[38;5;84m';

// Compact 6-line figlet-style "JAP" wordmark (hand-tuned, no dependency).
const WORDMARK = [
    '     ██╗   █████╗   ██████╗ ',
    '     ██║  ██╔══██╗  ██╔══██╗',
    '     ██║  ███████║  ██████╔╝',
    '██   ██║  ██╔══██║  ██╔═══╝ ',
    '╚█████╔╝  ██║  ██║  ██║     ',
    ' ╚════╝   ╚═╝  ╚═╝  ╚═╝     ',
];

// One tagline per day (deterministic — same vibe all day, fresh tomorrow).
const TAGLINES = [
    'ship bots, not excuses.',
    'superset of every fork that matters.',
    'typed to the root, tested to the edge.',
    'your bot deserves better plumbing.',
    'from Termux to production.',
    'anti-ban, anti-crash, anti-boring.',
    'every feature proven, none imaginary.',
];

const taglineOfTheDay = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((now - start) / 86_400_000);
    return TAGLINES[dayOfYear % TAGLINES.length];
};

const isTermux = () =>
    !!process.env.TERMUX_VERSION || (process.env.PREFIX ?? '').includes('com.termux');

const plainSignature = () =>
    `[@japofc/baileys${version ? ` v${version}` : ''}] WhatsApp Web API by J.AP — github.com/JAPofc/baileys\n`;

// ANSI-aware visible WIDTH (for box padding): emoji (astral plane) render
// two cells wide in terminals; variation selectors render zero.
const visibleLength = (s) => {
    const stripped = s.replace(/\x1b\[[0-9;]*m/g, '');
    let width = 0;
    for (const ch of stripped) {
        const code = ch.codePointAt(0);
        if (code === 0xfe0f) continue;      // variation selector
        width += code > 0xffff ? 2 : 1;     // astral (emoji) ≈ 2 cells
    }
    return width;
};

export const printBanner = () => {
    if (shown) return;
    shown = true;

    // Non-interactive output (CI/pm2/pipes): one plain line, zero ANSI.
    if (!process.stdout.isTTY) {
        process.stdout.write(plainSignature());
        return;
    }

    const platformBits = [
        `node ${process.versions.node}`,
        isTermux() ? 'termux' : `${process.platform}/${process.arch}`,
        `pid ${process.pid}`
    ].join(' · ');

    // NO_COLOR: print, but strip all styling (no-color.org — color opt-out only).
    if (process.env.NO_COLOR !== undefined) {
        const lines = ['', ...WORDMARK.map((row) => `  ${row}`), ''];
        lines.push(`  @japofc/baileys${version ? ` v${version}` : ''} — WhatsApp Web API · typed · extended · battle-tested`);
        if (waVersion) {
            lines.push(`  WA Web ${waVersion} · ${platformBits}`);
        }
        lines.push(`  github.com/JAPofc/baileys`);
        lines.push(`  "${taglineOfTheDay()}" — Made with 🍃 by J.AP`);
        lines.push('');
        process.stdout.write(lines.join('\n') + '\n');
        return;
    }

    const lines = [''];

    // gradient wordmark
    WORDMARK.forEach((row, i) => {
        lines.push(`  ${BOLD}${fg(GRADIENT[i % GRADIENT.length])}${row}${RESET}`);
    });
    lines.push('');

    // framed info card (ANSI-aware padding)
    const cardRows = [
        `${BOLD}${WHITE}@japofc/baileys${RESET}${version ? ` ${GREEN}v${version}${RESET}` : ''}   ${fg(48)}●${RESET} ${DIM}typed · extended · battle-tested${RESET}`,
        `${DIM}WA Web${RESET} ${WHITE}${waVersion || '?'}${RESET}   ${DIM}${platformBits}${RESET}`,
        `${GREEN}⚡${RESET} ${DIM}anti-ban toolkit${RESET}   ${GREEN}🛡️${RESET} ${DIM}bug-shield${RESET}   ${GREEN}📚${RESET} ${CYAN}github.com/JAPofc/baileys${RESET}`
    ];
    const inner = Math.max(...cardRows.map(visibleLength)) + 2;
    lines.push(`  ${GRAY}╭${'─'.repeat(inner)}╮${RESET}`);
    for (const row of cardRows) {
        const pad = ' '.repeat(Math.max(0, inner - visibleLength(row) - 2));
        lines.push(`  ${GRAY}│${RESET} ${row}${pad} ${GRAY}│${RESET}`);
    }
    lines.push(`  ${GRAY}╰${'─'.repeat(inner)}╯${RESET}`);

    lines.push(`   ${ITALIC}${DIM}"${taglineOfTheDay()}"${RESET}  ${DIM}—${RESET} ${ITALIC}${DIM}Made with 🍃 by J.AP${RESET}`);
    lines.push('');

    process.stdout.write(lines.join('\n') + '\n');
};

/** test hook — lets tests re-arm the once-per-process guard */
export const _resetBannerShown = () => {
    shown = false;
};
