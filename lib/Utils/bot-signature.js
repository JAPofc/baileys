/**
 * lib/Utils/bot-signature.js — verification of Meta's bot message certificates.
 *
 * Messages from verified bots (Meta AI and friends) carry
 * `messageContextInfo.botMetadata.verificationMetadata.proofs[]`: a DER certificate chain
 * plus an Ed25519 signature over a canonical payload. This module parses that chain, builds
 * the payload the signature covers, and verifies it against a trust root — so a bot reply
 * can be *checked* instead of merely believed.
 *
 * Part of @japofc/baileys.
 */
import { Boom } from '@hapi/boom';
import { createHash, createPublicKey, verify as cryptoVerify } from 'crypto';

/** Signature parameters Meta uses for bot proofs. */
export const BOT_SIGNATURE_ALGO = 'ed25519';
export const BOT_SIGNATURE_LENGTH = 64;
export const BOT_SIGNATURE_PREFIX = 'WhatsAppBotMessage';
/** Proof `useCase` ids seen in the wild. */
export const BOT_SIGNATURE_USE_CASE = { UNKNOWN: 0, BOT_MESSAGE: 1, BOT_PROFILE: 2 };

const toBuffer = (value) => {
    if (value === undefined || value === null) {
        return null;
    }
    if (Buffer.isBuffer(value)) {
        return value;
    }
    if (value instanceof Uint8Array) {
        return Buffer.from(value);
    }
    if (typeof value === 'string') {
        return Buffer.from(value, 'base64');
    }
    if (Array.isArray(value)) {
        return Buffer.from(value);
    }
    return null;
};

/**
 * Is this a DER certificate chain we can actually parse?
 * Cheap structural check (SEQUENCE header + declared length), so a malformed or truncated
 * chain is rejected before any crypto runs.
 */
export const isParsableCertificateChain = (chain) => {
    const certs = (Array.isArray(chain) ? chain : [chain]).map(toBuffer);
    if (!certs.length || certs.some(cert => !cert)) {
        return false;
    }
    return certs.every(cert => {
        if (cert.length < 4 || cert[0] !== 0x30) {
            return false; // not a DER SEQUENCE
        }
        if (cert[1] < 0x80) {
            return cert.length >= cert[1] + 2;
        }
        const lengthBytes = cert[1] & 0x7f;
        if (lengthBytes === 0 || lengthBytes > 4 || cert.length < 2 + lengthBytes) {
            return false;
        }
        let declared = 0;
        for (let i = 0; i < lengthBytes; i++) {
            declared = (declared << 8) | cert[2 + i];
        }
        return cert.length >= declared + 2 + lengthBytes;
    });
};

/**
 * The exact bytes a bot proof signs:
 * `WhatsAppBotMessage || useCase || version || sha256(leaf certificate) || sha256(payload)`.
 *
 * Pass the message (or the rich response) as `payload`; objects are canonicalised with
 * sorted keys so the same message always produces the same bytes.
 */
export const constructSignaturePayload = ({ payload, certificateChain, useCase = BOT_SIGNATURE_USE_CASE.BOT_MESSAGE, version = 1 } = {}) => {
    const leaf = toBuffer(Array.isArray(certificateChain) ? certificateChain[0] : certificateChain);
    if (!leaf) {
        throw new Boom('constructSignaturePayload: a leaf certificate is required', { statusCode: 400 });
    }
    const canonical = (value) => {
        if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
            return Buffer.from(value).toString('base64');
        }
        if (Array.isArray(value)) {
            return value.map(canonical);
        }
        if (value && typeof value === 'object') {
            return Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])]));
        }
        return value;
    };
    const body = Buffer.isBuffer(payload) || payload instanceof Uint8Array
        ? Buffer.from(payload)
        : Buffer.from(JSON.stringify(canonical(payload ?? {})), 'utf8');
    const header = Buffer.alloc(2);
    header.writeUInt8(useCase & 0xff, 0);
    header.writeUInt8(version & 0xff, 1);
    return Buffer.concat([
        Buffer.from(BOT_SIGNATURE_PREFIX, 'utf8'),
        header,
        createHash('sha256').update(leaf).digest(),
        createHash('sha256').update(body).digest()
    ]);
};

/**
 * Load the trust root used to verify bot certificates.
 *
 * Pass a PEM/DER key or certificate (string, Buffer, or a `{ key }` object) — typically
 * pinned in your own config. Returns a `KeyObject`; throws with a clear message when the
 * material is unusable, so a bad root never silently turns into "unverified".
 */
export const loadBotSignatureRoot = (material) => {
    if (!material) {
        throw new Boom('loadBotSignatureRoot: pass the trust root (PEM or DER public key)', { statusCode: 400 });
    }
    if (typeof material === 'object' && typeof material.export === 'function') {
        return material; // already a KeyObject
    }
    const key = material?.key ?? material;
    try {
        const buffer = toBuffer(key);
        const isPem = typeof key === 'string' && key.includes('-----BEGIN');
        return createPublicKey(isPem ? key : { key: buffer, format: 'der', type: 'spki' });
    }
    catch (err) {
        throw new Boom('loadBotSignatureRoot: that is not a usable public key (expected PEM or DER/SPKI)', {
            statusCode: 400,
            cause: err
        });
    }
};

/**
 * Verify the bot proof on a message.
 *
 * ```js
 * const root = loadBotSignatureRoot(process.env.BOT_TRUST_ROOT_PEM)
 * const result = verifyBotSignature(msg, { root })
 * // → { verified, reason, useCase, version, chainLength, signedAt }
 * ```
 *
 * Without a `root` it still parses and reports the proof (`verified: false`,
 * `reason: 'no trust root'`) — it never pretends an unchecked message is verified.
 */
export const verifyBotSignature = (message, { root, payload, proofIndex = 0 } = {}) => {
    const content = message?.message ?? message;
    const metadata = content?.messageContextInfo?.botMetadata
        ?? content?.botMetadata
        ?? message?.botMetadata;
    const proofs = metadata?.verificationMetadata?.proofs ?? metadata?.proofs;
    const base = { verified: false, reason: null, useCase: undefined, version: undefined, chainLength: 0 };
    if (!Array.isArray(proofs) || !proofs.length) {
        return { ...base, reason: 'no bot proof on this message' };
    }
    const proof = proofs[proofIndex];
    if (!proof) {
        return { ...base, reason: `no proof at index ${proofIndex}` };
    }
    const chain = (proof.certificateChain || []).map(toBuffer).filter(Boolean);
    const signature = toBuffer(proof.signature);
    const info = {
        useCase: proof.useCase,
        version: proof.version,
        chainLength: chain.length
    };
    if (!chain.length) {
        return { ...base, ...info, reason: 'empty certificate chain' };
    }
    if (!isParsableCertificateChain(chain)) {
        return { ...base, ...info, reason: 'unparsable certificate chain' };
    }
    if (!signature || signature.length !== BOT_SIGNATURE_LENGTH) {
        return { ...base, ...info, reason: `signature must be ${BOT_SIGNATURE_LENGTH} bytes` };
    }
    if (!root) {
        return { ...base, ...info, reason: 'no trust root' };
    }
    let key;
    try {
        key = loadBotSignatureRoot(root);
    }
    catch (err) {
        return { ...base, ...info, reason: `bad trust root: ${err.message}` };
    }
    const signed = constructSignaturePayload({
        payload: payload ?? content?.botInvokeMessage?.message ?? content,
        certificateChain: chain,
        useCase: proof.useCase ?? BOT_SIGNATURE_USE_CASE.BOT_MESSAGE,
        version: proof.version ?? 1
    });
    let verified = false;
    try {
        verified = cryptoVerify(null, signed, key, signature);
    }
    catch (err) {
        return { ...base, ...info, reason: `verification failed: ${err.message}` };
    }
    return { ...base, ...info, verified, reason: verified ? null : 'signature does not match' };
};

/**
 * Read a rich response only if its bot proof checks out.
 * Returns `{ verified, reason, rich }` — `rich` is `null` when verification fails, so a
 * caller cannot accidentally render an unverified card.
 */
export const readSignedRichResponse = (message, options = {}) => {
    const result = verifyBotSignature(message, options);
    const content = message?.message ?? message;
    const rich = content?.botInvokeMessage?.message?.richResponseMessage
        ?? content?.botForwardedMessage?.message?.richResponseMessage
        ?? content?.richResponseMessage
        ?? null;
    if (!rich) {
        return { ...result, verified: false, reason: result.reason ?? 'no rich response on this message', rich: null };
    }
    return { ...result, rich: result.verified ? rich : null };
};

/** `true`/`false` shorthand over {@link verifyBotSignature}. */
export const verifyRichResponseSignature = (message, options = {}) => verifyBotSignature(message, options).verified;
