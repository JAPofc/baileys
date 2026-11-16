export declare const DEFAULT_GROUP_ADDRESSING_MODE: 'lid';
/** Resolve a group's addressing mode from the metadata, falling back to the participant jids. */
export declare function resolveGroupAddressingMode(metadata: any): {
    mode: 'pn' | 'lid';
    source: 'metadata' | 'participants' | 'default';
    confident: boolean;
};
/** Is cached metadata usable for building a group stanza? */
export declare function isUsableGroupMetadata(metadata: any, opts?: { requireAddressingMode?: boolean }): {
    usable: boolean;
    reason: string | null;
};
