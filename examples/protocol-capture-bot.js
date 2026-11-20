/**
 * Protocol capture bot — records redacted WhatsApp BinaryNode traffic so new
 * native features can be implemented from real wire data instead of guesses.
 *
 * Run:
 *   node examples/protocol-capture-bot.js
 *
 * Optional env:
 *   CAPTURE_FILE=./captures/my-feature.ndjson
 *   CAPTURE_TAG=iq                  # only record a top-level tag
 *   CAPTURE_CHILD=history           # only record frames containing a child tag
 *   CAPTURE_DIRECTION=send|recv      # only one direction
 *
 * Never share auth folders, QR strings, or unredacted captures. The default
 * capture redacts sensitive attrs and replaces buffers with length+hash only.
 */
import makeWASocket, {
    DisconnectReason,
    bindProtocolCapture,
    fetchLatestBaileysVersion,
    useMultiFileAuthState
} from '../lib/index.js';

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const file = process.env.CAPTURE_FILE || `./captures/wa-protocol-${stamp}.ndjson`;
const onlyTag = process.env.CAPTURE_TAG;
const onlyChild = process.env.CAPTURE_CHILD;
const onlyDirection = process.env.CAPTURE_DIRECTION;

const hasChild = (node, tag) => {
    if (!tag) return true;
    const stack = Array.isArray(node?.content) ? [...node.content] : [];
    while (stack.length) {
        const item = stack.pop();
        if (item?.tag === tag) return true;
        if (Array.isArray(item?.content)) stack.push(...item.content);
    }
    return false;
};

const filter = (direction, node) => {
    if (onlyDirection && direction !== onlyDirection) return false;
    if (onlyTag && node?.tag !== onlyTag) return false;
    if (onlyChild && !hasChild(node, onlyChild)) return false;
    return true;
};

const start = async () => {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_protocol_capture');
    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({ version, auth: state, printQRInTerminal: true });
    sock.ev.on('creds.update', saveCreds);

    const capture = bindProtocolCapture(sock, { file, filter });
    console.log('Protocol capture writing redacted NDJSON to:', file);
    console.log('Trigger the target feature from an official client/test account, then press Ctrl+C.');

    const shutdown = async () => {
        console.log('\nclosing capture...');
        await capture.close();
        await sock.end?.();
        console.log('done:', file);
        process.exit(0);
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);

    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
        if (qr) console.log('scan QR from WhatsApp linked devices');
        if (connection) console.log('connection:', connection);
        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) {
                console.log('connection closed; restart this script if you still need to capture');
            } else {
                console.log('logged out — delete ./auth_protocol_capture and re-run');
            }
        }
    });
};

start().catch((err) => {
    console.error(err);
    process.exit(1);
});
