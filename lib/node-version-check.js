// Node version gate — previously enforced via a `preinstall` script, now checked at
// import time instead: install scripts are a supply-chain red flag (Socket.dev et al.
// penalize them, and many CIs run `npm ci --ignore-scripts` so the check silently
// vanished there anyway). A runtime check also catches `nvm use 16 && node bot.js`,
// which preinstall never could. This module MUST stay dependency-free and be the very
// first import in lib/index.js — ESM executes imports in order, so it runs before any
// module that might use Node 20+ syntax/APIs.
const major = Number(process.versions.node.split('.')[0]);
if (major < 20) {
    throw new Error(
        `@japofc/baileys requires Node.js 20+ — you are running Node.js ${process.versions.node}. ` +
        'Upgrade Node (e.g. nvm install 20, or pkg upgrade nodejs on Termux) and try again.'
    );
}
export {};
