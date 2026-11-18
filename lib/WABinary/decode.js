import { promisify } from 'util';
import { inflate } from 'zlib';
import * as constants from './constants.js';
import { jidEncode, WAJIDDomains } from './jid-utils.js';
const inflatePromise = promisify(inflate);
export const decompressingIfRequired = async (buffer) => {
    if (2 & buffer.readUInt8()) {
        buffer = await inflatePromise(buffer.slice(1));
    }
    else {
        // nodes with no compression have a 0x00 prefix, we remove that
        buffer = buffer.slice(1);
    }
    return buffer;
};
/**
 * JAP@Fix (§2.124): nested lists recurse once per level with no ceiling, so a malformed
 * or hostile frame -- five bytes buy one level -- overflowed the call stack with a
 * `RangeError` instead of a protocol error. Real WhatsApp nodes nest well under ten deep.
 */
export const MAX_BINARY_NODE_DEPTH = 512;
export const decodeDecompressedBinaryNode = (buffer, opts, indexRef = { index: 0 }) => {
    const { DOUBLE_BYTE_TOKENS, SINGLE_BYTE_TOKENS, TAGS } = opts;
    const depth = indexRef.depth || 0;
    if (depth > MAX_BINARY_NODE_DEPTH) {
        throw new Error(`binary node nested deeper than ${MAX_BINARY_NODE_DEPTH} levels`);
    }
    const checkEOS = (length) => {
        if (indexRef.index + length > buffer.length) {
            throw new Error('end of stream');
        }
    };
    const next = () => {
        const value = buffer[indexRef.index];
        indexRef.index += 1;
        return value;
    };
    const readByte = () => {
        checkEOS(1);
        return next();
    };
    const readBytes = (n) => {
        // JAP@Fix (§2.123): a negative or fractional length sailed through `checkEOS`
        // (index + (-1) is always < length), returned an empty slice and then moved the
        // cursor BACKWARDS -- every following sibling was decoded from the wrong offset.
        if (!Number.isInteger(n) || n < 0) {
            throw new Error('invalid length: ' + n);
        }
        checkEOS(n);
        const value = buffer.slice(indexRef.index, indexRef.index + n);
        indexRef.index += n;
        return value;
    };
    const readStringFromChars = (length) => {
        return readBytes(length).toString('utf-8');
    };
    const readInt = (n, littleEndian = false) => {
        checkEOS(n);
        // JAP@Fix (§2.123): `|=` forces a signed 32-bit result, so any BINARY_32 length
        // with the high bit set (0x80000000 and up -- trivially produced by a corrupt or
        // hostile frame) decoded as a NEGATIVE length. Accumulate unsigned instead.
        let val = 0;
        for (let i = 0; i < n; i++) {
            const shift = littleEndian ? i : n - 1 - i;
            val += next() * 2 ** (shift * 8);
        }
        return val;
    };
    const readInt20 = () => {
        checkEOS(3);
        return ((next() & 15) << 16) + (next() << 8) + next();
    };
    const unpackHex = (value) => {
        if (value >= 0 && value < 16) {
            return value < 10 ? '0'.charCodeAt(0) + value : 'A'.charCodeAt(0) + value - 10;
        }
        throw new Error('invalid hex: ' + value);
    };
    const unpackNibble = (value) => {
        if (value >= 0 && value <= 9) {
            return '0'.charCodeAt(0) + value;
        }
        switch (value) {
            case 10:
                return '-'.charCodeAt(0);
            case 11:
                return '.'.charCodeAt(0);
            case 15:
                return '\0'.charCodeAt(0);
            default:
                throw new Error('invalid nibble: ' + value);
        }
    };
    const unpackByte = (tag, value) => {
        if (tag === TAGS.NIBBLE_8) {
            return unpackNibble(value);
        }
        else if (tag === TAGS.HEX_8) {
            return unpackHex(value);
        }
        else {
            throw new Error('unknown tag: ' + tag);
        }
    };
    const readPacked8 = (tag) => {
        const startByte = readByte();
        let value = '';
        for (let i = 0; i < (startByte & 127); i++) {
            const curByte = readByte();
            value += String.fromCharCode(unpackByte(tag, (curByte & 0xf0) >> 4));
            value += String.fromCharCode(unpackByte(tag, curByte & 0x0f));
        }
        if (startByte >> 7 !== 0) {
            value = value.slice(0, -1);
        }
        return value;
    };
    const isListTag = (tag) => {
        return tag === TAGS.LIST_EMPTY || tag === TAGS.LIST_8 || tag === TAGS.LIST_16;
    };
    const readListSize = (tag) => {
        switch (tag) {
            case TAGS.LIST_EMPTY:
                return 0;
            case TAGS.LIST_8:
                return readByte();
            case TAGS.LIST_16:
                return readInt(2);
            default:
                throw new Error('invalid tag for list size: ' + tag);
        }
    };
    const readJidPair = () => {
        const i = readString(readByte());
        const j = readString(readByte());
        if (j) {
            return (i || '') + '@' + j;
        }
        throw new Error('invalid jid pair: ' + i + ', ' + j);
    };
    const readAdJid = () => {
        const rawDomainType = readByte();
        const domainType = Number(rawDomainType);
        const device = readByte();
        const user = readString(readByte());
        let server = 's.whatsapp.net'; // default whatsapp server
        if (domainType === WAJIDDomains.LID) {
            server = 'lid';
        }
        else if (domainType === WAJIDDomains.HOSTED) {
            server = 'hosted';
        }
        else if (domainType === WAJIDDomains.HOSTED_LID) {
            server = 'hosted.lid';
        }
        return jidEncode(user, server, device);
    };
    const readFbJid = () => {
        const user = readString(readByte());
        const device = readInt(2);
        const server = readString(readByte());
        return `${user}:${device}@${server}`;
    };
    const readInteropJid = () => {
        const user = readString(readByte());
        const device = readInt(2);
        const integrator = readInt(2);
        let server = 'interop';
        const beforeServer = indexRef.index;
        try {
            server = readString(readByte());
        }
        catch (err) {
            indexRef.index = beforeServer;
        }
        return `${integrator}-${user}:${device}@${server}`;
    };
    const readString = (tag) => {
        if (tag >= 1 && tag < SINGLE_BYTE_TOKENS.length) {
            return SINGLE_BYTE_TOKENS[tag] || '';
        }
        switch (tag) {
            case TAGS.DICTIONARY_0:
            case TAGS.DICTIONARY_1:
            case TAGS.DICTIONARY_2:
            case TAGS.DICTIONARY_3:
                return getTokenDouble(tag - TAGS.DICTIONARY_0, readByte());
            case TAGS.LIST_EMPTY:
                return '';
            case TAGS.BINARY_8:
                return readStringFromChars(readByte());
            case TAGS.BINARY_20:
                return readStringFromChars(readInt20());
            case TAGS.BINARY_32:
                return readStringFromChars(readInt(4));
            case TAGS.JID_PAIR:
                return readJidPair();
            case TAGS.FB_JID:
                return readFbJid();
            case TAGS.INTEROP_JID:
                return readInteropJid();
            case TAGS.AD_JID:
                return readAdJid();
            case TAGS.HEX_8:
            case TAGS.NIBBLE_8:
                return readPacked8(tag);
            default:
                throw new Error('invalid string with tag: ' + tag);
        }
    };
    const readList = (tag) => {
        const items = [];
        const size = readListSize(tag);
        indexRef.depth = depth + 1;
        try {
            for (let i = 0; i < size; i++) {
                items.push(decodeDecompressedBinaryNode(buffer, opts, indexRef));
            }
        }
        finally {
            indexRef.depth = depth;
        }
        return items;
    };
    const getTokenDouble = (index1, index2) => {
        const dict = DOUBLE_BYTE_TOKENS[index1];
        if (!dict) {
            throw new Error(`Invalid double token dict (${index1})`);
        }
        const value = dict[index2];
        if (typeof value === 'undefined') {
            throw new Error(`Invalid double token (${index2})`);
        }
        return value;
    };
    const listSize = readListSize(readByte());
    const header = readString(readByte());
    if (!listSize || !header.length) {
        throw new Error('invalid node');
    }
    const attrs = {};
    let data;
    if (listSize === 0 || !header) {
        throw new Error('invalid node');
    }
    // read the attributes in
    const attributesLength = (listSize - 1) >> 1;
    for (let i = 0; i < attributesLength; i++) {
        const key = readString(readByte());
        const value = readString(readByte());
        // JAP@Fix (§2.125): `attrs['__proto__'] = value` is swallowed by the object's
        // prototype setter -- the attribute vanished from the node entirely (and the same
        // assignment with an object value would have been a prototype-pollution sink).
        if (key === '__proto__') {
            Object.defineProperty(attrs, key, { value, writable: true, enumerable: true, configurable: true });
        }
        else {
            attrs[key] = value;
        }
    }
    if (listSize % 2 === 0) {
        const tag = readByte();
        if (isListTag(tag)) {
            data = readList(tag);
        }
        else {
            let decoded;
            switch (tag) {
                case TAGS.BINARY_8:
                    decoded = readBytes(readByte());
                    break;
                case TAGS.BINARY_20:
                    decoded = readBytes(readInt20());
                    break;
                case TAGS.BINARY_32:
                    decoded = readBytes(readInt(4));
                    break;
                default:
                    decoded = readString(tag);
                    break;
            }
            data = decoded;
        }
    }
    return {
        tag: header,
        attrs,
        content: data
    };
};
export const decodeBinaryNode = async (buff) => {
    const decompBuff = await decompressingIfRequired(buff);
    return decodeDecompressedBinaryNode(decompBuff, constants);
};
