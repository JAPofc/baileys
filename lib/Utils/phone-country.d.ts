/** Detect a country from a phone number or JID by dial code. */
export interface CountryInfo { dialCode: string; iso2: string; name: string; }
export declare const detectCountry: (input?: string) => CountryInfo | null;
export declare const dialCodeOf: (input?: string) => string | null;
export declare const flagEmoji: (iso2?: string) => string;
export declare const countryFlagOf: (input?: string) => string;
