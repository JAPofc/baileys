export class LIDMappingStore {
    constructor(keys: any, logger: any, pnToLIDFunc: any);
    mappingCache: any;
    inflightLIDLookups: Map<any, any>;
    inflightPNLookups: Map<any, any>;
    keys: any;
    pnToLIDFunc: any;
    logger: any;
    /**
     * Persist LID↔PN pairs. Either field order is accepted — a pair supplied in reverse
     * (`{ lid: <phone number>, pn: <lid> }`) is normalized rather than stored inverted.
     */
    storeLIDPNMappings(pairs: Array<{ lid: string; pn: string }>): Promise<void>;
    /**
     * Drop a stored mapping (both directions + both cache entries), e.g. after a
     * `GROUP_PARTICIPANT_CHANGE_NUMBER` notification. Accepts a phone-number JID or a LID.
     * @returns Whether a mapping was found and removed.
     */
    removeMapping(jid: string): Promise<boolean>;
    getLIDForPN(pn: any): Promise<any>;
    getLIDsForPNs(pns: any): Promise<any>;
    _getLIDsForPNsImpl(pns: any): Promise<any[] | null>;
    getPNForLID(lid: any): Promise<any>;
    getPNsForLIDs(lids: any): Promise<any>;
    _getPNsForLIDsImpl(lids: any): Promise<any[] | null>;
    /**
     * Close the cache and release resources
     */
    close(): void;
}
