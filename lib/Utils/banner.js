// Runtime startup banner — replaces the old `postinstall` banner (install scripts
// were removed for supply-chain hygiene; see CHANGELOG 2.3.1). Shown ONCE per
// process, on the first makeWASocket() call. The banner is a permanent part of
// this package and cannot be disabled or removed:
//   - interactive terminal (TTY): the full color banner with the info card
//   - non-TTY (CI, pm2, piped logs): a single plain-text signature line with no
//     ANSI codes, so structured/JSON log pipelines are not corrupted
//   - NO_COLOR is honored for COLOR only (per the no-color.org spec): the banner
//     still prints, just without ANSI styling
//
// JAP@Upgrade v4: true-color (24-bit) gradients with graceful 256-color
// fallback, OSC-8 clickable repo link, a live "what's new this release" line
// parsed from the CHANGELOG, two extra themes, and a pure `renderBanner()` that
// returns the lines (rendering is now decoupled from writing, so it is testable
// and embeddable). NO_COLOR now keeps the nicer boxed layout, just uncolored.
// JAP@Upgrade v5: colour is AUTOMATIC — a fresh random theme + tagline every run
// (pin with JAP_BANNER_THEME=<name>, or =daily for the old rotation), and
// FORCE_COLOR is honoured (force colour even off a TTY; =3 forces true-color)
// while NO_COLOR / FORCE_COLOR=0 still turn colour off.
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

// JAP@Upgrade v4: parse the latest CHANGELOG section once, so the banner can
// show a live "what's new" line (release date + added/fixed counts) that stays
// correct on every release without touching this file. Read as TEXT, best-effort.
const releaseInfo = (() => {
    try {
        const src = readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf-8');
        const start = src.indexOf('## [');
        if (start < 0) return null;
        const next = src.indexOf('\n## [', start + 4);
        const section = src.slice(start, next < 0 ? undefined : next);
        const header = section.match(/## \[([^\]]+)\]\s*-\s*([0-9-]+)/);
        const countUnder = (label) => {
            const h = section.indexOf(`### ${label}`);
            if (h < 0) return 0;
            const after = section.slice(h + label.length + 4);
            const end = after.indexOf('\n### ');
            const body = end < 0 ? after : after.slice(0, end);
            return (body.match(/^- /gm) || []).length;
        };
        return {
            version: header?.[1] || '',
            date: header?.[2] || '',
            added: countUnder('Added'),
            fixed: countUnder('Fixed')
        };
    } catch {
        return null;
    }
})();

// JAP@Upgrade v3/v4: gradient THEMES — rotates daily, or pin one via
// JAP_BANNER_THEME=leaf|ocean|sunset|violet|aurora|ember|random (customization
// only; the banner itself remains permanent). Each theme has a 256-color palette
// (universal fallback) and a parallel 24-bit RGB palette used when the terminal
// advertises true-color (COLORTERM=truecolor|24bit).
const THEMES = {
    leaf: [118, 84, 48, 43, 37, 30],
    ocean: [51, 45, 39, 38, 32, 26],
    sunset: [226, 220, 214, 208, 202, 196],
    violet: [183, 177, 141, 135, 99, 93],
    aurora: [121, 85, 49, 44, 75, 105],
    ember: [223, 215, 209, 203, 167, 131]
};
const THEMES_RGB = {
    leaf: [[190, 255, 120], [120, 230, 90], [80, 200, 80], [50, 170, 90], [40, 140, 90], [30, 110, 80]],
    ocean: [[120, 230, 255], [90, 200, 245], [70, 170, 235], [60, 140, 220], [55, 110, 200], [50, 90, 180]],
    sunset: [[255, 230, 120], [255, 200, 90], [255, 160, 70], [255, 120, 60], [240, 80, 50], [220, 50, 50]],
    violet: [[220, 180, 255], [195, 150, 250], [170, 120, 245], [150, 100, 235], [130, 80, 220], [110, 70, 200]],
    aurora: [[140, 255, 180], [110, 240, 210], [90, 220, 235], [120, 180, 240], [160, 140, 240], [190, 120, 235]],
    ember: [[255, 200, 120], [250, 160, 90], [240, 120, 70], [220, 90, 60], [180, 70, 60], [140, 60, 60]]
};

/** Public list of pinnable theme names (for `JAP_BANNER_THEME`). */
export const BANNER_THEMES = Object.keys(THEMES);

// JAP@Upgrade v5: colour is AUTOMATIC every run — the default now picks a FRESH
// random theme on each process start (so consecutive runs look different) instead
// of one fixed theme per day. Overrides via JAP_BANNER_THEME:
//   <name>  → pin that theme (leaf|ocean|sunset|violet|aurora|ember)
//   random  → explicit fresh theme each run (same as default)
//   daily   → the old deterministic once-per-day rotation
const themeName = (() => {
    const names = Object.keys(THEMES);
    const env = (process.env.JAP_BANNER_THEME || '').toLowerCase();
    if (env && env !== 'random' && env !== 'daily' && THEMES[env]) {
        return env; // pinned
    }
    if (env === 'daily') {
        const now = new Date();
        const start = new Date(now.getFullYear(), 0, 0);
        const dayOfYear = Math.floor((now - start) / 86_400_000);
        return names[dayOfYear % names.length];
    }
    // default (and explicit "random"): a different theme every run.
    return names[Math.floor(Math.random() * names.length)];
})();
const GRADIENT = THEMES[themeName];
const GRADIENT_RGB = THEMES_RGB[themeName];

// JAP@Upgrade v5: colour capability detection — read from the environment at
// CALL time (not module load) so a late `process.env.NO_COLOR = …` still counts.
//   NO_COLOR (any value)        → colour OFF (no-color.org opt-out; banner still prints)
//   FORCE_COLOR=0|false         → colour OFF
//   FORCE_COLOR=1|2|3|true      → colour ON even when not a TTY (CI/pm2 dashboards)
//   FORCE_COLOR=3               → force 24-bit true-color
// True-color otherwise comes from COLORTERM; else the 256-color palette is used.
const colorEnv = () => {
    const force = process.env.FORCE_COLOR;
    return {
        forceColorOn: force !== undefined && force !== '0' && force !== 'false',
        forceColorOff: process.env.NO_COLOR !== undefined || force === '0' || force === 'false',
        truecolor: /(^|;)(truecolor|24bit)($|;)/i.test(process.env.COLORTERM || '') || force === '3'
    };
};

const fg256 = (n) => `\x1b[38;5;${n}m`;
const fgRgb = ([r, g, b]) => `\x1b[38;2;${r};${g};${b}m`;
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const ITALIC = '\x1b[3m';
const GRAY = '\x1b[38;5;240m';
const WHITE = '\x1b[97m';
const CYAN = '\x1b[38;5;51m';
const GREEN = '\x1b[38;5;84m';

// OSC-8 hyperlink: renders as a clickable link in supporting terminals and as
// plain label text everywhere else (older terminals ignore the escape).
const osc8 = (url, label) => `\x1b]8;;${url}\x1b\\${label}\x1b]8;;\x1b\\`;

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

// JAP@Upgrade v5: fresh tagline each run (was once-per-day), matching the
// now-automatic per-run theme. Chosen once so both layouts agree within a run.
const taglineOfTheRun = TAGLINES[Math.floor(Math.random() * TAGLINES.length)];

const isTermux = () =>
    !!process.env.TERMUX_VERSION || (process.env.PREFIX ?? '').includes('com.termux');

const plainSignature = () =>
    `[@japofc/baileys${version ? ` v${version}` : ''}] WhatsApp Web API by J.AP — github.com/JAPofc/baileys\n`;

// Strip ANSI SGR color codes only (keeps OSC-8 links, box-drawing and emoji).
const stripSgr = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

// ANSI/OSC-aware visible WIDTH (for box padding): emoji (astral plane) render
// two cells wide in terminals; variation selectors render zero.
const visibleLength = (s) => {
    const stripped = s
        .replace(/\x1b\]8;;[^\x07\x1b]*(?:\x07|\x1b\\)/g, '') // OSC-8 link wrappers (label survives)
        .replace(/\x1b\[[0-9;]*m/g, '');                       // SGR color codes
    let width = 0;
    for (const ch of stripped) {
        const code = ch.codePointAt(0);
        if (code === 0xfe0f) continue;      // variation selector
        width += code > 0xffff ? 2 : 1;     // astral (emoji) ≈ 2 cells
    }
    return width;
};

/**
 * JAP@Upgrade v4: build the banner lines (pure — no I/O). Rendering is decoupled
 * from writing so it can be tested and embedded. Options default to the detected
 * environment; pass overrides for testing/embedding.
 *   { columns, color, truecolor, tty }
 */
export const renderBanner = (opts = {}) => {
    const { forceColorOn, forceColorOff, truecolor: envTruecolor } = colorEnv();
    const tty = opts.tty ?? (!!(process.stdout && process.stdout.isTTY) || forceColorOn);
    const color = opts.color ?? (!forceColorOff && (tty || forceColorOn));
    const truecolor = opts.truecolor ?? envTruecolor;
    const columns = opts.columns ?? (process.stdout && process.stdout.columns) ?? 80;

    const grad = (i) =>
        truecolor && GRADIENT_RGB ? fgRgb(GRADIENT_RGB[i % GRADIENT_RGB.length]) : fg256(GRADIENT[i % GRADIENT.length]);
    const link = (url, label) => (tty ? osc8(url, label) : label);
    const repo = link('https://github.com/JAPofc/baileys', 'github.com/JAPofc/baileys');

    const hour = new Date().getHours();
    const greeting = hour < 4 ? 'Good night' : hour < 11 ? 'Good morning' : hour < 15 ? 'Good afternoon' : hour < 19 ? 'Good evening' : 'Good night';
    const heapMb = (process.memoryUsage().heapUsed / 1048576).toFixed(0);
    const platformBits = [
        `node ${process.versions.node}`,
        isTermux() ? 'termux' : `${process.platform}/${process.arch}`,
        `heap ${heapMb}MB`,
        `pid ${process.pid}`
    ].join(' · ');

    let lines;

    // Adaptive layout — narrow terminals (< 56 cols, e.g. small Termux windows)
    // get a compact one-card banner instead of a wrapped/broken wide one.
    if (columns < 56) {
        lines = [
            '',
            `  ${BOLD}${grad(0)}🍃 J A P${RESET}  ${BOLD}${WHITE}@japofc/baileys${RESET}${version ? ` ${GREEN}v${version}${RESET}` : ''}`,
            `  ${DIM}WA ${waVersion || '?'} · node ${process.versions.node}${isTermux() ? ' · termux' : ''}${RESET}`,
            releaseInfo ? `  ${GREEN}✨${RESET} ${DIM}${releaseInfo.added} added · ${releaseInfo.fixed} fixed${releaseInfo.date ? ` · ${releaseInfo.date}` : ''}${RESET}` : null,
            `  ${ITALIC}${DIM}"${taglineOfTheRun}" — by J.AP${RESET}`,
            ''
        ].filter((l) => l !== null);
        return color ? lines : lines.map(stripSgr);
    }

    lines = [''];

    // gradient wordmark
    WORDMARK.forEach((row, i) => {
        lines.push(`  ${BOLD}${grad(i)}${row}${RESET}`);
    });
    lines.push('');

    // framed info card (ANSI/OSC-aware padding)
    const cardRows = [
        `${BOLD}${WHITE}@japofc/baileys${RESET}${version ? ` ${GREEN}v${version}${RESET}` : ''}   ${fg256(48)}●${RESET} ${DIM}typed · extended · battle-tested${RESET}`,
        `${DIM}WA Web${RESET} ${WHITE}${waVersion || '?'}${RESET}   ${DIM}${platformBits}${RESET}`,
        `${GREEN}⚡${RESET} ${DIM}anti-ban toolkit${RESET}   ${GREEN}🛡️${RESET} ${DIM}bug-shield${RESET}   ${GREEN}📚${RESET} ${CYAN}${repo}${RESET}`
    ];
    if (releaseInfo) {
        cardRows.push(`${GREEN}✨${RESET} ${DIM}this release${RESET}   ${WHITE}v${releaseInfo.version || version}${RESET} ${DIM}·${RESET} ${GREEN}${releaseInfo.added} added${RESET} ${DIM}·${RESET} ${CYAN}${releaseInfo.fixed} fixed${RESET}${releaseInfo.date ? ` ${DIM}· ${releaseInfo.date}${RESET}` : ''}`);
    }
    const inner = Math.max(...cardRows.map(visibleLength)) + 2;
    lines.push(`  ${GRAY}╭${'─'.repeat(inner)}╮${RESET}`);
    for (const row of cardRows) {
        const pad = ' '.repeat(Math.max(0, inner - visibleLength(row) - 2));
        lines.push(`  ${GRAY}│${RESET} ${row}${pad} ${GRAY}│${RESET}`);
    }
    lines.push(`  ${GRAY}╰${'─'.repeat(inner)}╯${RESET}`);

    lines.push(`   ${ITALIC}${DIM}${greeting}! "${taglineOfTheRun}"${RESET}  ${DIM}—${RESET} ${ITALIC}${DIM}Made with 🍃 by J.AP${RESET}`);
    lines.push('');

    return color ? lines : lines.map(stripSgr);
};

export const printBanner = () => {
    if (shown) return;
    shown = true;

    // Non-interactive output (CI/pm2/pipes): one plain line, zero ANSI — UNLESS
    // FORCE_COLOR asks for the full banner even off a TTY.
    const { forceColorOn } = colorEnv();
    if (!process.stdout.isTTY && !forceColorOn) {
        process.stdout.write(plainSignature());
        return;
    }

    process.stdout.write(renderBanner().join('\n') + '\n');
};

/** test hook — lets tests re-arm the once-per-process guard */
export const _resetBannerShown = () => {
    shown = false;
};
