# Provenance

Tooling to recognise this project's code inside somebody else's package, even after every
identifier has been renamed, and to check whether the attribution the licence requires is
still attached.

It exists because the usual approach does not work. Searching a suspect package for our
name finds nothing the moment someone runs `s/japofc/theirbrand/g`, and comparing file
hashes finds nothing the moment someone reformats. Neither absence means the code is not
ours.

## What it fingerprints

Not the text — the *shape*. Each module is lexed into a token stream in which:

- every identifier becomes `$` (renaming buys nothing)
- every string becomes `"s"` and every number `0` (rebranding buys nothing)
- comments and whitespace are dropped (reformatting buys nothing)
- keywords, operators, punctuation and structure survive

Two files that differ only by a rename sweep and a reformat produce byte-identical token
streams. From that stream we keep two things: a SHA-256 of the whole stream, which matches a
straight copy, and a bounded minhash sketch of 9-token grams, which still matches after the
copy has been edited.

What it cannot see through: a genuine rewrite, a transpiler, or a minifier that reorders
code. Those are real work, and at that point the question stops being a copy question.

## Using it

```sh
# fingerprint our own modules (re-run after each release)
npm run provenance:manifest

# compare a third-party package against the manifest
npm run provenance:scan -- ./some-extracted-package
npm run provenance:scan -- ./some-extracted-package --json --all
```

Point the scanner at an *extracted tarball* (`npm pack <pkg>` then untar), not at a
`node_modules` folder, so you know exactly which version you looked at.

The report gives counts in three bands — structurally identical, copied with edits, possible
shared code — plus the attribution checks, plus the per-file matches. Files under 120 tokens
are never claimed: at that size, unrelated code collides on shape all the time.

The manifest contains no source, only token counts and hashes, so it is safe to publish or
attach to a dispute.

## Reading the result honestly

A high count is evidence, not a verdict. Before saying anything to anyone:

- **Open the matches.** The tool reports shape; you confirm meaning.
- **Check the shared ancestry.** Both packages are Baileys forks. Code we both inherited
  from upstream is upstream's, not ours — a match on a module we did not write proves
  nothing. The manifest covers our `lib/`, which includes inherited files.
- **Treat the weak band as noise** unless something else corroborates it.
- **The licence is the argument, not the similarity score.** This package is
  GPL-3.0-or-later. Redistribution with attribution and source is *allowed*; that is the
  point of the licence. The thing to look for is a derivative shipped without the licence,
  without the notice, or relicensed.

## Runtime behaviour

There is none worth the name. `verifyProvenance()` is a pure function: you hand it the text
of `NOTICE.md`, `LICENSE` and the parsed `package.json`, and it hands back a report.

It does not run on import. The library never calls it. It performs no network access, writes
no files, logs nothing, and never throws on a failed check — a failed check is data in the
returned object.

That is deliberate. A library that phones home, nags in the console, or degrades itself when
it dislikes its surroundings is a library nobody should install, and it would punish honest
users far more reliably than dishonest ones. Licence compliance is a question for a
maintainer running an audit, or for an honest redistributor wiring this into their own CI —
not something to enforce from inside somebody else's process.

```js
import { verifyProvenance } from '@japofc/baileys'
import { readFileSync } from 'fs'

const report = verifyProvenance({
  noticeText: readFileSync('NOTICE.md', 'utf8'),
  licenseText: readFileSync('LICENSE', 'utf8'),
  packageJson: JSON.parse(readFileSync('package.json', 'utf8'))
})

if (!report.ok) {
  for (const check of report.checks.filter(c => !c.ok)) {
    console.warn(check.detail)
  }
}
```

## API

| Export | Purpose |
| --- | --- |
| `PROVENANCE` | Frozen attribution facts: project, author, licence, repository, required markers |
| `tokenizeForFingerprint(source)` | The rename-resistant token stream |
| `fingerprintSource(source)` | `{ tokens, structural, sketch, significant }` |
| `sketchSimilarity(a, b)` | Estimated Jaccard similarity, `0..1` |
| `matchAgainstManifest(fp, manifest)` | Best match, or `null` below the weak threshold |
| `verifyProvenance(files)` | Attribution report; passive, never throws |
| `findAttributionTraces(text)` | The leftovers a rebrand misses |
| `BUILD_TAG`, `mintId(prefix)` | The tag, and the minter every feature uses for its ids |
| `MIN_SIGNIFICANT_TOKENS`, `GRAM_SIZE`, `SKETCH_SIZE` | Fingerprint parameters |
| `SIMILARITY_STRONG`, `SIMILARITY_WEAK` | Thresholds used by the scanner |

## Attribution traces: the leftovers a rebrand misses

A fork that wants to pass our code off as its own runs a find-and-replace on the obvious
name and ships. What survives is everything their search did not match — and that leftover
is better evidence than the brand string ever was, because nobody plants it on purpose and
nobody notices it on the way out. A real example from a fork of this package: they replaced
`JAP` throughout and left `J.AP` sitting in the notice file three times.

`findAttributionTraces(text)` looks for exactly that class of leftover, and the scanner
aggregates it across a package:

| Trace | Why it survives a rename |
| --- | --- |
| `J.AP` | A replace of `JAP` does not match it, and vice versa |
| `JAPofc`, `@japofc/` | The npm scope persists in imports, lockfiles and metadata |
| `JAP@Fix` / `JAP@Add` / `JAP@Note` | ~800 per-change comment tags across `lib/`; stripping comments removes them, and stripping comments is itself a signal |
| `JapBaileys`, `japRich`, `sendJapRich` | Exported symbols — renaming them breaks their users' code |
| `LVM-XXXXXX-`, `QRM-XXXXXX-` ids | Derived from the attribution constants at runtime, so they appear in logs and message history rather than in source |

That last row is the interesting one. `BUILD_TAG` is a hash of the project name, author and
repository, and `mintId(prefix)` stamps it into the ids every feature hands out — quorum
ids, live-message correlation ids, and anything added later, because features mint ids
through one helper instead of rolling their own. It is not a string anyone would think to
search for, it is not a comment, and it ends up in data the fork's own users keep.

None of this is hidden from the people running the code: the constants are plain source,
documented here, and nothing is injected into end users' messages or sent anywhere. A
watermark that spies on the user, or that smuggles marks into their content, would be a
worse thing to ship than the plagiarism it is meant to catch.

The layers, weakest to strongest:

1. **Brand strings** — trivially removed. Useful only because people are lazy.
2. **Traces** — alternate spellings, comment tags, exported symbols. Removed only
   deliberately, and each removal leaves its own evidence.
3. **Derived ids** — attribution compiled into runtime data.
4. **Structural fingerprints** — survive renaming entirely, because they do not look at
   names at all. This is the layer that actually proves anything.
