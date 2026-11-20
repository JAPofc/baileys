# SSRF hardening: the guard, and what it could not promise

Baileys fetches URLs it did not choose — a link in an incoming message, a thumbnail on a
page, a media URL from a peer. That is the classic shape of SSRF: the attacker picks the
address, your server has the network position.

This document describes what the guard does, and — more usefully — what it could not
promise until `pinDns`.

## The guard

`assertSafeHttpUrl(url, opts)` rejects:

- anything that is not `http:` or `https:`
- hostnames that are private/loopback/link-local literals
- hostnames whose **DNS answers** include a private address (this is the part that matters;
  `evil.example.com` resolving to `169.254.169.254` is the usual attack)

| option | meaning |
|---|---|
| `allowPrivate: true` | turn the guard off. Use for a trusted intranet URL you control. |
| `allowHosts: ['media.lan']` | carve out **specific** hosts without disabling the guard for everything else. Prefer this. |
| `checkDns: false` | literal checks only, no resolution. Faster, much weaker. |

`getHttpStream()` and `resolveSafeRedirectUrl()` apply it to **every redirect hop**, not
just the first URL (§2.207, §2.211). `maxRedirects` defaults to 5.

## The gap: check and request resolve separately

Even with every hop checked, there was a window:

```
 we resolve   news.example.com -> 93.184.216.34   "public, fine"
 fetch resolves news.example.com -> 127.0.0.1     "..."
```

A DNS server controlled by the attacker, with a very short TTL, can answer differently the
second time. The guard inspected an address nobody then connected to. This is DNS
rebinding, and no amount of extra checking fixes it, because the checking and the
connecting are two different resolutions.

## The fix: connect to the address you validated

```js
import { createPinnedFetch, getHttpStream, getUrlInfo } from '@japofc/baileys'

// 1. directly
const doFetch = createPinnedFetch()
const res = await doFetch('https://news.example.com/article')

// 2. media downloads
const stream = await getHttpStream(url, { pinDns: true })

// 3. link previews
const info = await getUrlInfo(text, { fetchOpts: { pinDns: true } })
```

`createPinnedFetch()` resolves the host once, validates every answer, and then forces the
socket onto one of those exact addresses using the `lookup` hook of `node:http`/`node:https`.
The hostname is still used for the `Host` header and for TLS SNI, so virtual hosting and
certificate validation are unaffected — only the destination IP is fixed.

It returns a minimal `Response`: `status`, `ok`, `url`, `headers.get()`, `text()`,
`json()`, `arrayBuffer()`, and a `body` stream with `cancel()`. It **never follows a
redirect** — `redirect: 'manual'` is the only behaviour — because every hop has to go back
through the guard.

### Link previews specifically

`link-preview-js` does its own fetching with the global `fetch`. No option we pass it can
pin a connection, so `pinDns: true` on `getUrlInfo` does not configure the library — it
**replaces** it with `createPinnedLinkPreviewFetcher()`, which fetches the page over the
pinned client and reads the metadata itself.

That parser is deliberately small: OpenGraph, Twitter cards, `<title>`, and
`<meta name="description">`. `link-preview-js` handles more unusual pages. The trade is
stated plainly: previews are best-effort, a connection to your metadata service is not.

You can also supply your own: `getUrlInfo(text, { fetcher })` takes anything shaped like
`getLinkPreview`.

## Why it is not the default

1. It bypasses a custom `dispatcher` (proxies, connection pools) — pinning and a proxy are
   contradictory instructions about where the socket goes.
2. For previews it means weaker metadata parsing.
3. The existing guard already blocks the large majority of real attempts; rebinding needs
   attacker-controlled DNS with a short TTL.

Turn it on wherever you fetch URLs that came from strangers. Leave it off where you fetch
your own CDN through a proxy.

## Known limits, stated honestly

- `pinDns` is opt-in. A caller who never reads this page gets the pre-2.5.0 behaviour.
- A custom `dispatcher` or `fetchImpl` wins over pinning; we do not silently override what
  you passed.
- Pinning fixes *where the socket goes*, not *what comes back*. A public host that proxies
  to its own internal network is still a public host as far as we can tell.
- `allowHosts` disables the private-address check for that host at both resolution points,
  by design. Keep the list short.
