/**
 * Normalize + validate a phone number for requestPairingCode(): returns the
 * clean digits-only E.164 number, strips a leading "00" international call
 * prefix, and throws a descriptive TypeError for junk input, local-format
 * numbers (leading 0) and numbers over the 15-digit E.164 maximum.
 */
export function normalizePairingPhone(phoneNumber: string | number): string;
export function generateLoginNode(userJid: any, config: any): any;
export function generateRegistrationNode({ registrationId, signedPreKey, signedIdentityKey }: {
    registrationId: any;
    signedPreKey: any;
    signedIdentityKey: any;
}, config: any): any;
export function configureSuccessfulPairing(stanza: any, { advSecretKey, signedIdentityKey, signalIdentities }: {
    advSecretKey: any;
    signedIdentityKey: any;
    signalIdentities: any;
}): {
    creds: {
        account: any;
        me: {
            id: any;
            name: any;
            lid: any;
        };
        signalIdentities: any[];
        platform: any;
    };
    reply: {
        tag: string;
        attrs: {
            to: string;
            type: string;
            id: any;
        };
        content: {
            tag: string;
            attrs: {};
            content: {
                tag: string;
                attrs: {
                    'key-index': any;
                };
                content: any;
            }[];
        }[];
    };
};
export function encodeSignedDeviceIdentity(account: any, includeSignatureKey: any): any;
