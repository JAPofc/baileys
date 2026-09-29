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
