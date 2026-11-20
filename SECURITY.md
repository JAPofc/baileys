# Security Policy

## Supported versions

Only the latest published version of `@japofc/baileys` receives fixes.

| Version | Supported |
| --- | --- |
| latest (npm `latest` tag) | ✅ |
| older releases | ❌ — upgrade first |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Use GitHub's private reporting instead: **[Report a vulnerability](https://github.com/JAPofc/baileys/security/advisories/new)** (repo → Security → Advisories → New draft). You'll get a response as soon as possible, typically within a few days; this is a solo-maintained project.

In scope, for example:
- credential/session leakage (auth state, encrypted-auth helpers in `lib/Utils/auth-secure.js`)
- crypto misuse (Signal/Noise handling, media encryption)
- injection through message payloads processed by this library
- unsafe output produced for other programs — e.g. a chat export that a spreadsheet
  interprets as a formula, or a bundle check that misses a remote script reference
- a guard, validator or redactor that can be walked past (a check reporting "clean" for
  something it should have caught is treated as a vulnerability here, not a cosmetic bug)
- supply-chain issues in the published npm package

Out of scope:
- WhatsApp banning accounts (server-side policy, not a vulnerability)
- bugs requiring a malicious local environment
- the `AIza…` string in `lib/WABinary/constants.js` — that is WhatsApp's own
  binary-protocol token dictionary, byte-identical in upstream Baileys, not a
  leaked credential

## Disclosure

Fixes ship as a patch release with a `CHANGELOG.md` entry. Credit is given
unless you prefer otherwise.

## Known advisories we are not acting on

`npm audit` reports two **moderate** findings against `minimatch`, reached only through
`typedoc`. `typedoc` is a devDependency: it builds documentation and is never installed or
executed by anyone depending on this package, so the advisory is not reachable from your
application. The available fix downgrades `typedoc` across a major version, and
`npm audit fix --force` has broken this repo before.

`npm run release:check` therefore runs `npm audit --audit-level=high`: a known, documented,
unreachable moderate must not be able to block a security release.

This is recorded here so the finding does not get rediscovered and "fixed" by force every
few months. If `minimatch` ever enters the runtime dependency tree, that is a different
question and should be treated as one.

## DNS rebinding and `pinDns`

The URL guard resolves a hostname and rejects private answers, but Node's `fetch` then
resolves it again — an attacker-controlled DNS server with a short TTL can answer
differently the second time. From v2.5.0, `pinDns: true` (on `getHttpStream`,
`resolveSafeRedirectUrl`, or `getUrlInfo`'s `fetchOpts`) connects to the exact address that
was validated. It is opt-in; see `docs/ssrf-hardening.md` for why, and for what it still
does not promise.
