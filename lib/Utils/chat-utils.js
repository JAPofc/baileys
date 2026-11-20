import { Boom } from '@hapi/boom';
import { proto } from '../../WAProto/index.js';
import { LabelAssociationType } from '../Types/LabelAssociation.js';
import { getBinaryNodeChild, getBinaryNodeChildren, isJidGroup, jidNormalizedUser } from '../WABinary/index.js';
import { aesDecrypt, aesEncrypt, hmacSign } from './crypto.js';
import { toNumber } from './generics.js';
import { LT_HASH_ANTI_TAMPERING } from './lt-hash.js';
import { downloadContentFromMessage } from './messages-media.js';
import { emitSyncActionResults, processContactAction } from './sync-action-utils.js';
// JAP@Fix (bug 36 follow-up): same top-level-await try/catch treatment as crypto.js and
// lt-hash.js — avoid crashing the whole library at import time if the whatsapp-rust-bridge
// native binary is missing on this platform (ARM musl/Alpine/Termux/some Pterodactyl nodes);
// only throw when app-state sync actually needs it. Kept synchronous (not async) because
// mutationKeys() is called synchronously throughout this file — making it async would be
// a breaking change for those call sites.
let expandAppStateKeys;
try {
    ({ expandAppStateKeys } = await import('whatsapp-rust-bridge'));
}
catch (err) {
    const message = '`whatsapp-rust-bridge` failed to load (no prebuilt binary for this platform/arch). ' +
        'App-state sync is unavailable here. Original error: ' + (err?.message || err);
    expandAppStateKeys = () => { throw new Error(message); };
}
const mutationKeys = (keydata) => {
    const keys = expandAppStateKeys(keydata);
    return {
        indexKey: keys.indexKey,
        valueEncryptionKey: keys.valueEncryptionKey,
        valueMacKey: keys.valueMacKey,
        snapshotMacKey: keys.snapshotMacKey,
        patchMacKey: keys.patchMacKey
    };
};
const generateMac = (operation, data, keyId, key) => {
    const opByte = operation === proto.SyncdMutation.SyncdOperation.SET ? 0x01 : 0x02;
    const keyIdBuffer = typeof keyId === 'string' ? Buffer.from(keyId, 'base64') : keyId;
    const keyData = new Uint8Array(1 + keyIdBuffer.length);
    keyData[0] = opByte;
    keyData.set(keyIdBuffer, 1);
    const last = new Uint8Array(8);
    last[7] = keyData.length;
    const total = new Uint8Array(keyData.length + data.length + last.length);
    total.set(keyData, 0);
    total.set(data, keyData.length);
    total.set(last, keyData.length + data.length);
    const hmac = hmacSign(total, key, 'sha512');
    return hmac.subarray(0, 32);
};
const to64BitNetworkOrder = (e) => {
    const buff = Buffer.alloc(8);
    buff.writeUint32BE(e, 4);
    return buff;
};
export const makeLtHashGenerator = ({ indexValueMap, hash }) => {
    indexValueMap = { ...indexValueMap };
    const addBuffs = [];
    const subBuffs = [];
    return {
        mix: ({ indexMac, valueMac, operation }) => {
            const indexMacBase64 = Buffer.from(indexMac).toString('base64');
            const prevOp = indexValueMap[indexMacBase64];
            if (operation === proto.SyncdMutation.SyncdOperation.REMOVE) {
                if (!prevOp) {
                    // WA Web does not throw here — it logs a warning and skips the subtract.
                    // The missing REMOVE will cause an LTHash mismatch, which is handled
                    // by the MAC validation layer (snapshot recovery or retry).
                    return;
                }
                // remove from index value mac, since this mutation is erased
                delete indexValueMap[indexMacBase64];
            }
            else {
                addBuffs.push(valueMac);
                // add this index into the history map
                indexValueMap[indexMacBase64] = { valueMac };
            }
            if (prevOp) {
                subBuffs.push(prevOp.valueMac);
            }
        },
        finish: () => {
            const result = LT_HASH_ANTI_TAMPERING.subtractThenAdd(hash, subBuffs, addBuffs);
            return {
                hash: Buffer.from(result),
                indexValueMap
            };
        }
    };
};
const generateSnapshotMac = (lthash, version, name, key) => {
    const total = Buffer.concat([lthash, to64BitNetworkOrder(version), Buffer.from(name, 'utf-8')]);
    return hmacSign(total, key, 'sha256');
};
const generatePatchMac = (snapshotMac, valueMacs, version, type, key) => {
    const total = Buffer.concat([snapshotMac, ...valueMacs, to64BitNetworkOrder(version), Buffer.from(type, 'utf-8')]);
    return hmacSign(total, key);
};
export const newLTHashState = () => ({ version: 0, hash: Buffer.alloc(128), indexValueMap: {} });
export const ensureLTHashStateVersion = (state) => {
    if (typeof state.version !== 'number' || isNaN(state.version)) {
        state.version = 0;
    }
    return state;
};
export const MAX_SYNC_ATTEMPTS = 2;
/**
 * Check if an error is a missing app state sync key.
 * WA Web treats these as "Blocked" (waits for key arrival), not fatal.
 * In Baileys we retry with a snapshot which may use a different key.
 */
export const isMissingKeyError = (error) => {
    return error?.data?.isMissingKey === true;
};
/**
 * Determines if an app state sync error is unrecoverable.
 * TypeError indicates a WASM crash; otherwise we give up after MAX_SYNC_ATTEMPTS.
 * Missing keys are NOT checked here — they are handled separately as "Blocked".
 */
export const isAppStateSyncIrrecoverable = (error, attempts) => {
    return attempts >= MAX_SYNC_ATTEMPTS || error?.name === 'TypeError';
};
export const encodeSyncdPatch = async ({ type, index, syncAction, apiVersion, operation }, myAppStateKeyId, state, getAppStateSyncKey) => {
    const key = !!myAppStateKeyId ? await getAppStateSyncKey(myAppStateKeyId) : undefined;
    if (!key) {
        throw new Boom(`myAppStateKey ("${myAppStateKeyId}") not present`, { data: { isMissingKey: true } });
    }
    const encKeyId = Buffer.from(myAppStateKeyId, 'base64');
    state = { ...state, indexValueMap: { ...state.indexValueMap } };
    const indexBuffer = Buffer.from(JSON.stringify(index));
    const dataProto = proto.SyncActionData.fromObject({
        index: indexBuffer,
        value: syncAction,
        padding: new Uint8Array(0),
        version: apiVersion
    });
    const encoded = proto.SyncActionData.encode(dataProto).finish();
    const keyValue = mutationKeys(key.keyData);
    const encValue = aesEncrypt(encoded, keyValue.valueEncryptionKey);
    const valueMac = generateMac(operation, encValue, encKeyId, keyValue.valueMacKey);
    const indexMac = hmacSign(indexBuffer, keyValue.indexKey);
    // update LT hash
    const generator = makeLtHashGenerator(state);
    generator.mix({ indexMac, valueMac, operation });
    Object.assign(state, generator.finish());
    state.version += 1;
    const snapshotMac = generateSnapshotMac(state.hash, state.version, type, keyValue.snapshotMacKey);
    const patch = {
        patchMac: generatePatchMac(snapshotMac, [valueMac], state.version, type, keyValue.patchMacKey),
        snapshotMac: snapshotMac,
        keyId: { id: encKeyId },
        mutations: [
            {
                operation: operation,
                record: {
                    index: {
                        blob: indexMac
                    },
                    value: {
                        blob: Buffer.concat([encValue, valueMac])
                    },
                    keyId: { id: encKeyId }
                }
            }
        ]
    };
    const base64Index = indexMac.toString('base64');
    state.indexValueMap[base64Index] = { valueMac };
    return { patch, state };
};
export const decodeSyncdMutations = async (msgMutations, initialState, getAppStateSyncKey, onMutation, validateMacs) => {
    const ltGenerator = makeLtHashGenerator(initialState);
    const derivedKeyCache = new Map();
    // indexKey used to HMAC sign record.index.blob
    // valueEncryptionKey used to AES-256-CBC encrypt record.value.blob[0:-32]
    // the remaining record.value.blob[0:-32] is the mac, it the HMAC sign of key.keyId + decoded proto data + length of bytes in keyId
    for (const msgMutation of msgMutations) {
        // if it's a syncdmutation, get the operation property
        // otherwise, if it's only a record -- it'll be a SET mutation
        const operation = 'operation' in msgMutation ? msgMutation.operation : proto.SyncdMutation.SyncdOperation.SET;
        const record = 'record' in msgMutation && !!msgMutation.record ? msgMutation.record : msgMutation;
        let key;
        try {
            key = await getKey(record.keyId.id);
        }
        catch (err) {
            // Missing-key errors must propagate so the orchestrator can park the
            // collection (Blocked) and retry when APP_STATE_SYNC_KEY_SHARE arrives.
            // Other errors → individual record corruption, skip and keep going.
            if (isMissingKeyError(err))
                throw err;
            continue;
        }
        const content = record.value.blob;
        const encContent = content.subarray(0, -32);
        const ogValueMac = content.subarray(-32);
        if (validateMacs) {
            const contentHmac = generateMac(operation, encContent, record.keyId.id, key.valueMacKey);
            if (Buffer.compare(contentHmac, ogValueMac) !== 0) {
                // HMAC verification failed — skip this record
                continue;
            }
        }
        let result;
        try {
            result = aesDecrypt(encContent, key.valueEncryptionKey);
        }
        catch {
            // decrypt failed — skip this record instead of aborting
            continue;
        }
        const syncAction = proto.SyncActionData.decode(result);
        if (validateMacs) {
            const hmac = hmacSign(syncAction.index, key.indexKey);
            if (Buffer.compare(hmac, record.index.blob) !== 0) {
                throw new Boom('HMAC index verification failed');
            }
        }
        // NOTE (§2.144): do NOT turn this into a skip-and-continue. It reads like an
        // inconsistency next to the decrypt/MAC skips above, but those are safe only because
        // a skipped record leaves the LT hash short, and the mismatch check downstream turns
        // that into an incomplete sync. With `validateMacs: false` there is no such net, so
        // throwing here is the only thing stopping a patch with a lost mutation from being
        // marked applied and advancing the saved version -- the §2.75 data-loss bug.
        // The throw is load-bearing; it is wrapped only to say where it came from.
        const indexStr = Buffer.from(syncAction.index).toString();
        let index;
        try {
            index = JSON.parse(indexStr);
        }
        catch (err) {
            throw new Boom('app-state mutation has an unparseable index', {
                data: { reason: 'bad-index', err: err?.message }
            });
        }
        onMutation({ syncAction, index });
        ltGenerator.mix({
            indexMac: record.index.blob,
            valueMac: ogValueMac,
            operation: operation
        });
    }
    return ltGenerator.finish();
    async function getKey(keyId) {
        const base64Key = Buffer.from(keyId).toString('base64');
        const cached = derivedKeyCache.get(base64Key);
        if (cached) {
            return cached;
        }
        const keyEnc = await getAppStateSyncKey(base64Key);
        if (!keyEnc) {
            throw new Boom(`failed to find key "${base64Key}" to decode mutation`, {
                data: { isMissingKey: true, msgMutations }
            });
        }
        const keys = mutationKeys(keyEnc.keyData);
        derivedKeyCache.set(base64Key, keys);
        return keys;
    }
};
export const decodeSyncdPatch = async (msg, name, initialState, getAppStateSyncKey, onMutation, validateMacs) => {
    if (validateMacs) {
        const base64Key = Buffer.from(msg.keyId.id).toString('base64');
        const mainKeyObj = await getAppStateSyncKey(base64Key);
        if (!mainKeyObj) {
            throw new Boom(`failed to find key "${base64Key}" to decode patch`, { data: { isMissingKey: true, msg } });
        }
        const mainKey = mutationKeys(mainKeyObj.keyData);
        const mutationmacs = msg.mutations.map(mutation => mutation.record.value.blob.slice(-32));
        const patchMac = generatePatchMac(msg.snapshotMac, mutationmacs, toNumber(msg.version.version), name, mainKey.patchMacKey);
        if (Buffer.compare(patchMac, msg.patchMac) !== 0) {
            throw new Boom('Invalid patch mac');
        }
    }
    const result = await decodeSyncdMutations(msg.mutations, initialState, getAppStateSyncKey, onMutation, validateMacs);
    return result;
};
export const extractSyncdPatches = async (result, options) => {
    const syncNode = getBinaryNodeChild(result, 'sync');
    const collectionNodes = getBinaryNodeChildren(syncNode, 'collection');
    const final = {};
    await Promise.all(collectionNodes.map(async (collectionNode) => {
        const patchesNode = getBinaryNodeChild(collectionNode, 'patches');
        const patches = getBinaryNodeChildren(patchesNode || collectionNode, 'patch');
        const snapshotNode = getBinaryNodeChild(collectionNode, 'snapshot');
        const syncds = [];
        const name = collectionNode.attrs.name;
        const hasMorePatches = collectionNode.attrs.has_more_patches === 'true';
        let snapshot = undefined;
        if (snapshotNode && !!snapshotNode.content) {
            if (!Buffer.isBuffer(snapshotNode)) {
                snapshotNode.content = Buffer.from(Object.values(snapshotNode.content));
            }
            const blobRef = proto.ExternalBlobReference.decode(snapshotNode.content);
            const data = await downloadExternalBlob(blobRef, options);
            snapshot = proto.SyncdSnapshot.decode(data);
        }
        // JAP@Fix (§2.78): every version-less patch in a batch used to be stamped with the
        // SAME number (collection version + 1), so applying N patches only advanced our
        // bookkeeping by one -- the next resync then re-requested patches we had already
        // applied. A missing/garbage `version` attribute also produced NaN, which protobuf
        // serialises as null and poisons the stored state version. Versions are now handed
        // out consecutively, and a collection with no usable version leaves the patch
        // version untouched instead of writing NaN into it.
        const collectionVersion = Number(collectionNode.attrs.version);
        let lastVersion = Number.isFinite(collectionVersion) ? collectionVersion : undefined;
        for (let { content } of patches) {
            if (content) {
                if (!Buffer.isBuffer(content)) {
                    content = Buffer.from(Object.values(content));
                }
                const syncd = proto.SyncdPatch.decode(content);
                const ownVersion = syncd.version?.version !== undefined && syncd.version?.version !== null
                    ? toNumber(syncd.version.version)
                    : undefined;
                if (ownVersion !== undefined && Number.isFinite(ownVersion)) {
                    lastVersion = ownVersion;
                }
                else if (lastVersion !== undefined) {
                    lastVersion += 1;
                    syncd.version = { version: lastVersion };
                }
                else {
                    options?.logger?.warn({ collection: name, version: collectionNode.attrs.version }, 'patch has no version and the collection did not advertise one');
                }
                syncds.push(syncd);
            }
        }
        final[name] = { patches: syncds, hasMorePatches, snapshot };
    }));
    return final;
};
export const downloadExternalBlob = async (blob, options) => {
    const stream = await downloadContentFromMessage(blob, 'md-app-state', { options });
    const bufferArray = [];
    for await (const chunk of stream) {
        bufferArray.push(chunk);
    }
    return Buffer.concat(bufferArray);
};
export const downloadExternalPatch = async (blob, options) => {
    const buffer = await downloadExternalBlob(blob, options);
    const syncData = proto.SyncdMutations.decode(buffer);
    return syncData;
};
export const decodeSyncdSnapshot = async (name, snapshot, getAppStateSyncKey, minimumVersionNumber, validateMacs = true, logger) => {
    const newState = newLTHashState();
    newState.version = toNumber(snapshot.version.version);
    const mutationMap = {};
    const areMutationsRequired = typeof minimumVersionNumber === 'undefined' || newState.version > minimumVersionNumber;
    const { hash, indexValueMap } = await decodeSyncdMutations(snapshot.records, newState, getAppStateSyncKey, areMutationsRequired
        ? mutation => {
            const index = mutation.syncAction.index?.toString();
            mutationMap[index] = mutation;
        }
        : () => { }, validateMacs);
    newState.hash = hash;
    newState.indexValueMap = indexValueMap;
    if (validateMacs) {
        const base64Key = Buffer.from(snapshot.keyId.id).toString('base64');
        const keyEnc = await getAppStateSyncKey(base64Key);
        if (!keyEnc) {
            throw new Boom(`failed to find key "${base64Key}" to decode mutation`, { data: { isMissingKey: true } });
        }
        const result = mutationKeys(keyEnc.keyData);
        const computedSnapshotMac = generateSnapshotMac(newState.hash, newState.version, name, result.snapshotMacKey);
        if (Buffer.compare(snapshot.mac, computedSnapshotMac) !== 0) {
            // LTHash verification may fail when decodeSyncdMutations skipped undecryptable
            // records (poisoned server-side snapshot); the aggregate client hash diverges
            // from the server-computed mac. Fall through with a warning so the session stays
            // alive with partial state, symmetric to how decodePatches handles its own
            // LTHash mismatch a few lines below.
            logger?.warn({ name, version: newState.version }, 'LTHash verification failed on snapshot, continuing with partial state');
        }
    }
    return {
        state: newState,
        mutationMap
    };
};
export const decodePatches = async (name, syncds, initial, getAppStateSyncKey, options, minimumVersionNumber, logger, validateMacs = true) => {
    const newState = {
        ...initial,
        indexValueMap: { ...initial.indexValueMap }
    };
    const mutationMap = {};
    /**
     * JAP@Fix (§2.75): a patch that cannot be applied must NOT advance the stored
     * version. The old loop assigned `newState.version = patchVersion` (and then the
     * decoded hash/indexValueMap) *before* the patch was known to be good, so a patch
     * that was skipped on a decode error — or that failed its own LTHash check — still
     * left its version and a diverged hash in the state we persist. The collection then
     * resumed from a version whose mutations were never delivered, so they were lost for
     * good, and the poisoned hash made every later sync fail the same check.
     * Nothing is committed now until the patch has decoded *and* verified.
     */
    let incomplete = null;
    for (const syncd of syncds) {
        const { version, keyId, snapshotMac } = syncd;
        if (syncd.externalMutations) {
            logger?.trace({ name, version }, 'downloading external patch');
            const ref = await downloadExternalPatch(syncd.externalMutations, options);
            logger?.debug({ name, version, mutations: ref.mutations.length }, 'downloaded external patch');
            syncd.mutations?.push(...ref.mutations);
        }
        const patchVersion = toNumber(version.version);
        const shouldMutate = typeof minimumVersionNumber === 'undefined' || patchVersion > minimumVersionNumber;
        // the patch applies on top of the last *committed* state, never on top of a
        // half-applied one
        const workingState = {
            version: patchVersion,
            hash: newState.hash,
            indexValueMap: newState.indexValueMap
        };
        // JAP@Fix (§2.75): mutations are held here until the patch verifies, so a
        // corrupt patch can no longer hand the app changes it then rolls back.
        const pending = {};
        let decodeResult;
        try {
            decodeResult = await decodeSyncdPatch(syncd, name, workingState, getAppStateSyncKey, shouldMutate
                ? mutation => {
                    const index = mutation.syncAction.index?.toString();
                    pending[index] = mutation;
                }
                : () => { }, validateMacs);
        }
        catch (err) {
            if (isMissingKeyError(err))
                throw err;
            logger?.warn({ name, version: patchVersion, error: err.message }, 'failed to decode patch, stopping before it so it can be re-fetched');
            incomplete = { version: patchVersion, reason: 'decode-failed', error: err.message };
            break;
        }
        if (validateMacs) {
            const base64Key = Buffer.from(keyId.id).toString('base64');
            const keyEnc = await getAppStateSyncKey(base64Key);
            if (!keyEnc) {
                throw new Boom(`failed to find key "${base64Key}" to decode mutation`, { data: { isMissingKey: true } });
            }
            const result = mutationKeys(keyEnc.keyData);
            const computedSnapshotMac = generateSnapshotMac(decodeResult.hash, patchVersion, name, result.snapshotMacKey);
            if (Buffer.compare(snapshotMac, computedSnapshotMac) !== 0) {
                logger?.warn({ name, version: patchVersion }, 'LTHash verification failed, keeping last good state');
                incomplete = { version: patchVersion, reason: 'lthash-mismatch' };
                break;
            }
        }
        // the patch is good -- commit it
        newState.version = patchVersion;
        newState.hash = decodeResult.hash;
        newState.indexValueMap = decodeResult.indexValueMap;
        Object.assign(mutationMap, pending);
        // clear memory used up by the mutations
        syncd.mutations = [];
    }
    /**
     * `incomplete` is non-null when at least one patch could not be applied. The caller
     * must not treat the collection as synced: the state returned here is the last good
     * one, so re-requesting from `state.version` (or forcing a snapshot) recovers the
     * missing mutations instead of silently dropping them.
     */
    return { state: newState, mutationMap, incomplete, synced: !incomplete };
};
export const chatModificationToAppPatch = (mod, jid) => {
    const OP = proto.SyncdMutation.SyncdOperation;
    const getMessageRange = (lastMessages) => {
        let messageRange;
        if (Array.isArray(lastMessages)) {
            // JAP@Fix (§2.78): the newest message was taken positionally (`[length - 1]`),
            // which quietly assumed the caller sorted oldest-first. Stores hand chats back
            // newest-first, and that stamped clear/delete/archive with the OLDEST timestamp
            // in the list -- the action then applied to the wrong window of the chat. Pick
            // the actual maximum instead, and emit the list in the ascending order the
            // wire format expects.
            const lastMsg = lastMessages.reduce((latest, m) => !latest || toNumber(m?.messageTimestamp) > toNumber(latest.messageTimestamp) ? m : latest, undefined);
            messageRange = {
                lastMessageTimestamp: lastMsg?.messageTimestamp,
                messages: lastMessages?.length
                    ? [...lastMessages]
                        .sort((a, b) => toNumber(a?.messageTimestamp) - toNumber(b?.messageTimestamp))
                        .map(m => {
                        if (!m.key?.id || !m.key?.remoteJid) {
                            throw new Boom('Incomplete key', { statusCode: 400, data: m });
                        }
                        if (isJidGroup(m.key.remoteJid) && !m.key.fromMe && !m.key.participant) {
                            throw new Boom('Expected not from me message to have participant', { statusCode: 400, data: m });
                        }
                        if (!m.messageTimestamp || !toNumber(m.messageTimestamp)) {
                            throw new Boom('Missing timestamp in last message list', { statusCode: 400, data: m });
                        }
                        if (m.key.participant) {
                            m.key.participant = jidNormalizedUser(m.key.participant);
                        }
                        return m;
                    })
                    : undefined
            };
        }
        else {
            messageRange = lastMessages;
        }
        return messageRange;
    };
    let patch;
    if ('mute' in mod) {
        patch = {
            syncAction: {
                muteAction: {
                    muted: !!mod.mute,
                    muteEndTimestamp: mod.mute || undefined
                }
            },
            index: ['mute', jid],
            type: 'regular_high',
            apiVersion: 2,
            operation: OP.SET
        };
    }
    else if ('archive' in mod) {
        patch = {
            syncAction: {
                archiveChatAction: {
                    archived: !!mod.archive,
                    messageRange: getMessageRange(mod.lastMessages)
                }
            },
            index: ['archive', jid],
            type: 'regular_low',
            apiVersion: 3,
            operation: OP.SET
        };
    }
    else if ('markRead' in mod) {
        patch = {
            syncAction: {
                markChatAsReadAction: {
                    read: mod.markRead,
                    messageRange: getMessageRange(mod.lastMessages)
                }
            },
            index: ['markChatAsRead', jid],
            type: 'regular_low',
            apiVersion: 3,
            operation: OP.SET
        };
    }
    else if ('deleteForMe' in mod) {
        const { timestamp, key, deleteMedia } = mod.deleteForMe;
        patch = {
            syncAction: {
                deleteMessageForMeAction: {
                    deleteMedia,
                    messageTimestamp: timestamp
                }
            },
            index: ['deleteMessageForMe', jid, key.id, key.fromMe ? '1' : '0', '0'],
            type: 'regular_high',
            apiVersion: 3,
            operation: OP.SET
        };
    }
    else if ('clear' in mod) {
        patch = {
            syncAction: {
                clearChatAction: {
                    messageRange: getMessageRange(mod.lastMessages)
                }
            },
            index: ['clearChat', jid, '1' /*the option here is 0 when keep starred messages is enabled*/, '0'],
            type: 'regular_high',
            apiVersion: 6,
            operation: OP.SET
        };
    }
    else if ('pin' in mod) {
        patch = {
            syncAction: {
                pinAction: {
                    pinned: !!mod.pin
                }
            },
            index: ['pin_v1', jid],
            type: 'regular_low',
            apiVersion: 5,
            operation: OP.SET
        };
    }
    else if ('contact' in mod) {
        patch = {
            syncAction: {
                contactAction: mod.contact || {}
            },
            index: ['contact', jid],
            type: 'critical_unblock_low',
            apiVersion: 2,
            operation: mod.contact ? OP.SET : OP.REMOVE
        };
    }
    else if ('disableLinkPreviews' in mod) {
        patch = {
            syncAction: {
                privacySettingDisableLinkPreviewsAction: mod.disableLinkPreviews || {}
            },
            index: ['setting_disableLinkPreviews'],
            type: 'regular',
            apiVersion: 8,
            operation: OP.SET
        };
    }
    else if ('star' in mod) {
        const key = mod.star.messages[0];
        patch = {
            syncAction: {
                starAction: {
                    starred: !!mod.star.star
                }
            },
            index: ['star', jid, key.id, key.fromMe ? '1' : '0', '0'],
            type: 'regular_low',
            apiVersion: 2,
            operation: OP.SET
        };
    }
    else if ('delete' in mod) {
        patch = {
            syncAction: {
                deleteChatAction: {
                    messageRange: getMessageRange(mod.lastMessages)
                }
            },
            index: ['deleteChat', jid, '1'],
            type: 'regular_high',
            apiVersion: 6,
            operation: OP.SET
        };
    }
    else if ('pushNameSetting' in mod) {
        patch = {
            syncAction: {
                pushNameSetting: {
                    name: mod.pushNameSetting
                }
            },
            index: ['setting_pushName'],
            type: 'critical_block',
            apiVersion: 1,
            operation: OP.SET
        };
    }
    else if ('quickReply' in mod) {
        patch = {
            syncAction: {
                quickReplyAction: {
                    count: 0,
                    deleted: mod.quickReply.deleted || false,
                    keywords: [],
                    message: mod.quickReply.message || '',
                    shortcut: mod.quickReply.shortcut || ''
                }
            },
            index: ['quick_reply', mod.quickReply.timestamp || String(Math.floor(Date.now() / 1000))],
            type: 'regular',
            apiVersion: 2,
            operation: OP.SET
        };
    }
    else if ('addLabel' in mod) {
        patch = {
            syncAction: {
                labelEditAction: {
                    name: mod.addLabel.name,
                    color: mod.addLabel.color,
                    predefinedId: mod.addLabel.predefinedId,
                    deleted: mod.addLabel.deleted
                }
            },
            index: ['label_edit', mod.addLabel.id],
            type: 'regular',
            apiVersion: 3,
            operation: OP.SET
        };
    }
    else if ('addChatLabel' in mod) {
        patch = {
            syncAction: {
                labelAssociationAction: {
                    labeled: true
                }
            },
            index: [LabelAssociationType.Chat, mod.addChatLabel.labelId, jid],
            type: 'regular',
            apiVersion: 3,
            operation: OP.SET
        };
    }
    else if ('removeChatLabel' in mod) {
        patch = {
            syncAction: {
                labelAssociationAction: {
                    labeled: false
                }
            },
            index: [LabelAssociationType.Chat, mod.removeChatLabel.labelId, jid],
            type: 'regular',
            apiVersion: 3,
            operation: OP.SET
        };
    }
    else if ('addMessageLabel' in mod) {
        patch = {
            syncAction: {
                labelAssociationAction: {
                    labeled: true
                }
            },
            index: [LabelAssociationType.Message, mod.addMessageLabel.labelId, jid, mod.addMessageLabel.messageId, '0', '0'],
            type: 'regular',
            apiVersion: 3,
            operation: OP.SET
        };
    }
    else if ('removeMessageLabel' in mod) {
        patch = {
            syncAction: {
                labelAssociationAction: {
                    labeled: false
                }
            },
            index: [
                LabelAssociationType.Message,
                mod.removeMessageLabel.labelId,
                jid,
                mod.removeMessageLabel.messageId,
                '0',
                '0'
            ],
            type: 'regular',
            apiVersion: 3,
            operation: OP.SET
        };
    }
    else {
        throw new Boom('not supported');
    }
    patch.syncAction.timestamp = Date.now();
    return patch;
};
export const processSyncAction = (syncAction, ev, me, initialSyncOpts, logger) => {
    const isInitialSync = !!initialSyncOpts;
    const accountSettings = initialSyncOpts?.accountSettings;
    logger?.trace({ syncAction, initialSync: !!initialSyncOpts }, 'processing sync action');
    const { syncAction: { value: action }, index: [type, id, msgId, fromMe] } = syncAction;
    if (action?.muteAction) {
        ev.emit('chats.update', [
            {
                id,
                muteEndTime: action.muteAction?.muted ? toNumber(action.muteAction.muteEndTimestamp) : null,
                conditional: getChatUpdateConditional(id, undefined)
            }
        ]);
    }
    else if (action?.archiveChatAction || type === 'archive' || type === 'unarchive') {
        // okay so we've to do some annoying computation here
        // when we're initially syncing the app state
        // there are a few cases we need to handle
        // 1. if the account unarchiveChats setting is true
        //   a. if the chat is archived, and no further messages have been received -- simple, keep archived
        //   b. if the chat was archived, and the user received messages from the other person afterwards
        //		then the chat should be marked unarchved --
        //		we compare the timestamp of latest message from the other person to determine this
        // 2. if the account unarchiveChats setting is false -- then it doesn't matter,
        //	it'll always take an app state action to mark in unarchived -- which we'll get anyway
        const archiveAction = action?.archiveChatAction;
        const isArchived = archiveAction ? archiveAction.archived : type === 'archive';
        // // basically we don't need to fire an "archive" update if the chat is being marked unarchvied
        // // this only applies for the initial sync
        // if(isInitialSync && !isArchived) {
        // 	isArchived = false
        // }
        const msgRange = !accountSettings?.unarchiveChats ? undefined : archiveAction?.messageRange;
        // logger?.debug({ chat: id, syncAction }, 'message range archive')
        ev.emit('chats.update', [
            {
                id,
                archived: isArchived,
                conditional: getChatUpdateConditional(id, msgRange)
            }
        ]);
    }
    else if (action?.markChatAsReadAction) {
        const markReadAction = action.markChatAsReadAction;
        // basically we don't need to fire an "read" update if the chat is being marked as read
        // because the chat is read by default
        // this only applies for the initial sync
        const isNullUpdate = isInitialSync && markReadAction.read;
        ev.emit('chats.update', [
            {
                id,
                unreadCount: isNullUpdate ? null : !!markReadAction?.read ? 0 : -1,
                conditional: getChatUpdateConditional(id, markReadAction?.messageRange)
            }
        ]);
    }
    else if (action?.deleteMessageForMeAction || type === 'deleteMessageForMe') {
        ev.emit('messages.delete', {
            keys: [
                {
                    remoteJid: id,
                    id: msgId,
                    fromMe: fromMe === '1'
                }
            ]
        });
    }
    else if (action?.contactAction) {
        const results = processContactAction(action.contactAction, id, logger);
        emitSyncActionResults(ev, results);
    }
    else if (action?.pushNameSetting) {
        const name = action?.pushNameSetting?.name;
        if (name && me?.name !== name) {
            ev.emit('creds.update', { me: { ...me, name } });
        }
    }
    else if (action?.pinAction) {
        ev.emit('chats.update', [
            {
                id,
                pinned: action.pinAction?.pinned ? toNumber(action.timestamp) : null,
                conditional: getChatUpdateConditional(id, undefined)
            }
        ]);
    }
    else if (action?.unarchiveChatsSetting) {
        const unarchiveChats = !!action.unarchiveChatsSetting.unarchiveChats;
        ev.emit('creds.update', { accountSettings: { unarchiveChats } });
        logger?.info(`archive setting updated => '${action.unarchiveChatsSetting.unarchiveChats}'`);
        if (accountSettings) {
            accountSettings.unarchiveChats = unarchiveChats;
        }
    }
    else if (action?.starAction || type === 'star') {
        let starred = action?.starAction?.starred;
        if (typeof starred !== 'boolean') {
            starred = syncAction.index[syncAction.index.length - 1] === '1';
        }
        ev.emit('messages.update', [
            {
                key: { remoteJid: id, id: msgId, fromMe: fromMe === '1' },
                update: { starred }
            }
        ]);
    }
    else if (action?.clearChatAction || type === 'clearChat') {
        // JAP@Fix (§2.103): we *build* clearChat patches (chatModificationToAppPatch, 'clear')
        // but never processed an incoming one -- clearing a chat on the phone left every
        // message of that chat in the bot's store, and the action fell through to
        // 'unprocessable update'.
        ev.emit('messages.delete', { jid: id, all: true });
    }
    else if (action?.deleteChatAction || type === 'deleteChat') {
        if (!isInitialSync) {
            ev.emit('chats.delete', [id]);
        }
    }
    else if (action?.labelEditAction) {
        const { name, color, deleted, predefinedId } = action.labelEditAction;
        ev.emit('labels.edit', {
            id: id,
            name: name,
            color: color,
            deleted: deleted,
            predefinedId: predefinedId ? String(predefinedId) : undefined
        });
    }
    else if (action?.labelAssociationAction) {
        ev.emit('labels.association', {
            type: action.labelAssociationAction.labeled ? 'add' : 'remove',
            association: type === LabelAssociationType.Chat
                ? {
                    type: LabelAssociationType.Chat,
                    chatId: syncAction.index[2],
                    labelId: syncAction.index[1]
                }
                : {
                    type: LabelAssociationType.Message,
                    chatId: syncAction.index[2],
                    messageId: syncAction.index[3],
                    labelId: syncAction.index[1]
                }
        });
    }
    else if (action?.localeSetting?.locale) {
        ev.emit('settings.update', { setting: 'locale', value: action.localeSetting.locale });
    }
    else if (action?.timeFormatAction) {
        ev.emit('settings.update', { setting: 'timeFormat', value: action.timeFormatAction });
    }
    else if (action?.pnForLidChatAction) {
        if (action.pnForLidChatAction.pnJid) {
            ev.emit('lid-mapping.update', { lid: id, pn: action.pnForLidChatAction.pnJid });
        }
    }
    else if (action?.privacySettingRelayAllCalls) {
        ev.emit('settings.update', {
            setting: 'privacySettingRelayAllCalls',
            value: action.privacySettingRelayAllCalls
        });
    }
    else if (action?.statusPrivacy) {
        ev.emit('settings.update', { setting: 'statusPrivacy', value: action.statusPrivacy });
    }
    else if (action?.lockChatAction) {
        ev.emit('chats.lock', { id: id, locked: !!action.lockChatAction.locked });
    }
    else if (action?.privacySettingDisableLinkPreviewsAction) {
        ev.emit('settings.update', {
            setting: 'disableLinkPreviews',
            value: action.privacySettingDisableLinkPreviewsAction
        });
    }
    else if (action?.notificationActivitySettingAction?.notificationActivitySetting) {
        ev.emit('settings.update', {
            setting: 'notificationActivitySetting',
            value: action.notificationActivitySettingAction.notificationActivitySetting
        });
    }
    else if (action?.lidContactAction) {
        ev.emit('contacts.upsert', [
            {
                id: id,
                name: action.lidContactAction.fullName ||
                    action.lidContactAction.firstName ||
                    action.lidContactAction.username ||
                    undefined,
                username: action.lidContactAction.username || undefined,
                lid: id,
                phoneNumber: undefined
            }
        ]);
    }
    else if (action?.privacySettingChannelsPersonalisedRecommendationAction) {
        ev.emit('settings.update', {
            setting: 'channelsPersonalisedRecommendation',
            value: action.privacySettingChannelsPersonalisedRecommendationAction
        });
    }
    else {
        // JAP@Add (§2.103): SyncActionValue carries ~88 action fields and this function
        // handles the couple of dozen that map onto a Baileys event; the rest used to vanish
        // into a debug line. They are re-emitted as 'app-state.action' now, so an app can
        // react to quick replies, stickers, chat assignment, call logs, notes, favourites …
        // without us having to invent an event per field. Existing events are unchanged.
        const actionName = action && typeof action === 'object'
            ? Object.keys(action).find(key => key !== 'timestamp' && action[key] !== null && action[key] !== undefined)
            : undefined;
        if (actionName) {
            ev.emit('app-state.action', {
                name: actionName,
                type,
                id,
                index: syncAction.index,
                action: action[actionName],
                timestamp: action.timestamp ? toNumber(action.timestamp) : undefined
            });
        }
        logger?.debug({ syncAction, id }, 'unprocessable update');
    }
    function getChatUpdateConditional(id, msgRange) {
        return isInitialSync
            ? data => {
                const chat = data.historySets.chats[id] || data.chatUpserts[id];
                if (chat) {
                    return msgRange ? isValidPatchBasedOnMessageRange(chat, msgRange) : true;
                }
            }
            : undefined;
    }
    function isValidPatchBasedOnMessageRange(chat, msgRange) {
        const lastMsgTimestamp = Number(msgRange?.lastMessageTimestamp || msgRange?.lastSystemMessageTimestamp || 0);
        const chatLastMsgTimestamp = Number(chat?.lastMessageRecvTimestamp || 0);
        return lastMsgTimestamp >= chatLastMsgTimestamp;
    }
};
