import type { BinaryNode } from '../../WABinary/index.js';
import type { USyncUser } from '../USyncUser.js';

export interface USyncBusinessHoursConfig {
    dayOfWeek: string | null;
    openTime: string | null;
    closeTime: string | null;
    mode: string | null;
}

export interface USyncBusinessResult {
    verifiedName: string | null;
    verifiedLevel: string | null;
    profileTag: string | null;
    address: string | null;
    businessHours: { timezone: string | null; config: USyncBusinessHoursConfig[] } | null;
    catalogExists: boolean | null;
    cartEnabled: boolean | null;
    pnJid: string | null;
}

/** JAP (§2.134): business details for a whole batch of users in one usync query. */
export class USyncBusinessProtocol {
    constructor(profileVersion?: string | number);
    name: 'business';
    profileVersion: string;
    getQueryElement(): BinaryNode;
    getUserElement(user: USyncUser): BinaryNode | null;
    parser(node: BinaryNode): USyncBusinessResult | null;
}
