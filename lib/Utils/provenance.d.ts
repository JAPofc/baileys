export const PROVENANCE: Readonly<{
	project: string
	author: string
	license: string
	repository: string
	markers: readonly string[]
}>

/** Short stable tag derived from the attribution constants; minted into feature ids. */
export const BUILD_TAG: string

/**
 * Mint a tagged id: `PREFIX-<BUILD_TAG>-<random>`. Prefixes shorter than three characters
 * fall back to `JAP`, so every minted id stays detectable by `findAttributionTraces`.
 */
export function mintId(prefix: string, entropyBytes?: number): string

export const MIN_SIGNIFICANT_TOKENS: number
export const SKETCH_SIZE: number
export const GRAM_SIZE: number
export const SIMILARITY_STRONG: number
export const SIMILARITY_WEAK: number

export type SourceFingerprint = {
	tokens: number
	structural: string
	sketch: number[]
	significant: boolean
}

export type ProvenanceManifest = {
	project?: string
	version?: string
	modules: Array<{ path: string; tokens: number; structural: string; sketch: number[] }>
}

export type ManifestMatch = {
	path: string
	similarity: number
	identical: boolean
	verdict: string
}

export type ProvenanceReport = {
	ok: boolean
	checks: Array<{ name: string; ok: boolean; detail: string }>
}

/**
 * Lex JavaScript into a rename-resistant token stream: identifiers become `$`, string and
 * number literals are normalised, comments and whitespace are dropped.
 */
export function tokenizeForFingerprint(source: string): string[]

/** Exact structural hash plus a bounded minhash sketch of token-grams. */
export function fingerprintSource(source: string): SourceFingerprint

/** Estimated Jaccard similarity of two sketches, 0..1. */
export function sketchSimilarity(a: number[], b: number[]): number

/** Best match for a foreign module against our manifest, or null below the weak threshold. */
export function matchAgainstManifest(
	candidate: Pick<SourceFingerprint, 'tokens' | 'structural' | 'sketch'>,
	manifest: ProvenanceManifest
): ManifestMatch | null


export const ATTRIBUTION_TRACES: ReadonlyArray<{ name: string; pattern: RegExp; note: string }>

/**
 * Find the attribution leftovers a find-and-replace rebrand misses: alternate spellings,
 * comment tags, exported symbol names, and ids derived from the attribution constants.
 */
export function findAttributionTraces(
	text: string
): Array<{ name: string; count: number; note: string; samples: string[] }>

/**
 * Report whether required attribution is still attached. Passive: never throws on a failed
 * check, never logs, never touches the network.
 */
export function verifyProvenance(files?: {
	noticeText?: string
	licenseText?: string
	packageJson?: { license?: string } & Record<string, unknown>
}): ProvenanceReport
