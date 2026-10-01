/** One error reported by a USync IQ. `jid` is absent for query-level errors. */
export interface USyncError {
    /** Numeric `code` attribute, or `undefined` when the server sent none/garbage. */
    code?: number;
    /** `text`/`reason` attribute, when present. */
    text?: string;
    /** The user the error belongs to; absent when it applies to the whole query. */
    jid?: string;
    /** The protocol node the error came from (e.g. `'devices'`), when nested in one. */
    protocol?: string;
}

/**
 * Collect every error carried by a USync IQ — the query-level `<usync><result><error/>`
 * and the per-user ones under `<usync><list><user>`, including protocol-nested errors.
 * Returns an empty array when the query succeeded (BUGREPORT §2.49).
 */
export declare function extractUSyncErrors(resultNode: any): USyncError[];

/**
 * Whether any error applies to the whole query rather than a single user — i.e. an empty
 * result list means "the server refused", not "nobody matched".
 */
export declare function hasUSyncQueryError(errors: USyncError[] | null | undefined): boolean;
