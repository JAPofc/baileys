import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    exportChatAsText, exportChatAsJSON, exportChatAsCSV, chatStatistics, classifyExportMessage
} from '../lib/index.js';

// fixed timestamps (UTC seconds) so assertions are deterministic in content;
// rendered stamps use local time so we assert via Date the same way the impl does
const T1 = 1757818320; // earliest
const T2 = 1757818380;
const T3 = 1757818440;

const textMsg = (id, ts, sender, text, fromMe = false, pushName) => ({
    key: { id, remoteJid: '123@g.us', fromMe, participant: sender },
    pushName,
    messageTimestamp: ts,
    message: { conversation: text }
});
const imageMsg = (id, ts, sender, caption) => ({
    key: { id, remoteJid: '123@g.us', fromMe: false, participant: sender },
    messageTimestamp: ts,
    message: { imageMessage: { caption, mimetype: 'image/jpeg' } }
});
const stamp = (ts) => {
    const d = new Date(ts * 1000);
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}, ${p(d.getHours())}.${p(d.getMinutes())}`;
};

describe('classifyExportMessage', () => {
    it('classifies core kinds incl. unwrapping view-once/ephemeral', () => {
        assert.equal(classifyExportMessage({ message: { conversation: 'hi' } }), 'text');
        assert.equal(classifyExportMessage({ message: { audioMessage: { ptt: true } } }), 'voice note');
        assert.equal(classifyExportMessage({ message: { audioMessage: { ptt: false } } }), 'audio');
        assert.equal(classifyExportMessage({ message: { videoMessage: { gifPlayback: true } } }), 'gif');
        assert.equal(classifyExportMessage({ message: { ephemeralMessage: { message: { stickerMessage: {} } } } }), 'sticker');
        assert.equal(classifyExportMessage({ message: { viewOnceMessageV2: { message: { imageMessage: {} } } } }), 'image');
        assert.equal(classifyExportMessage({ message: { protocolMessage: { type: 0 } } }), 'protocol');
        assert.equal(classifyExportMessage({}), 'other');
    });
});

describe('exportChatAsText', () => {
    it('renders official-style lines, sorted oldest-first, with media placeholder', () => {
        const messages = [
            imageMsg('B', T2, '62811@s.whatsapp.net', 'sunset!'),
            textMsg('A', T1, '62812@s.whatsapp.net', 'halo semua', false, 'J.AP')
        ];
        const out = exportChatAsText(messages, { header: '' });
        const lines = out.split('\n');
        assert.equal(lines.length, 2);
        assert.equal(lines[0], `${stamp(T1)} - J.AP: halo semua`);
        assert.equal(lines[1], `${stamp(T2)} - 62811: <Media omitted>`);
    });
    it('descriptive placeholders include kind and caption', () => {
        const out = exportChatAsText([imageMsg('A', T1, '62811@s.whatsapp.net', 'sunset!')], {
            header: '', mediaPlaceholders: 'descriptive'
        });
        assert.match(out, /<image: sunset!>/);
    });
    it('default header is the encryption notice; custom resolveName wins', () => {
        const out = exportChatAsText([textMsg('A', T1, '62812@s.whatsapp.net', 'hi')], {
            resolveName: (jid) => (jid.startsWith('62812') ? 'Boss' : null)
        });
        assert.match(out, /end-to-end encrypted/);
        assert.match(out, / - Boss: hi/);
    });
    it('multi-line text keeps continuation lines bare (official style)', () => {
        const out = exportChatAsText([textMsg('A', T1, '62812@s.whatsapp.net', 'line1\nline2')], { header: '' });
        const lines = out.split('\n');
        assert.equal(lines.length, 2);
        assert.match(lines[0], /: line1$/);
        assert.equal(lines[1], 'line2');
    });
    it('skips protocol messages and reactions by default; includeReactions opts in', () => {
        const reaction = {
            key: { id: 'R', remoteJid: '123@g.us', participant: '62811@s.whatsapp.net' },
            messageTimestamp: T3,
            message: { reactionMessage: { text: '👍', key: {} } }
        };
        const proto_ = {
            key: { id: 'P', remoteJid: '123@g.us' },
            messageTimestamp: T2,
            message: { protocolMessage: { type: 0 } }
        };
        const base = [textMsg('A', T1, '62812@s.whatsapp.net', 'hi'), proto_, reaction];
        assert.equal(exportChatAsText(base, { header: '' }).split('\n').length, 1);
        const withReactions = exportChatAsText(base, { header: '', includeReactions: true });
        assert.match(withReactions, /reacted 👍/);
    });
    it('rejects non-array input', () => {
        assert.throws(() => exportChatAsText('nope'), /must be an array/);
    });
});

describe('exportChatAsJSON / exportChatAsCSV', () => {
    it('JSON rows carry stable fields, sorted oldest-first', () => {
        const rows = exportChatAsJSON([
            imageMsg('B', T2, '62811@s.whatsapp.net', 'pic'),
            textMsg('A', T1, '62812@s.whatsapp.net', 'first', true, 'Me')
        ]);
        assert.equal(rows.length, 2);
        assert.deepEqual(rows[0], {
            id: 'A', timestamp: T1, fromMe: true, senderJid: '62812@s.whatsapp.net',
            senderName: 'Me', kind: 'text', text: 'first'
        });
        assert.equal(rows[1].kind, 'image');
        assert.equal(rows[1].text, 'pic'); // caption preserved in JSON export
    });
    it('CSV escapes quotes, commas and newlines per RFC 4180', () => {
        const csv = exportChatAsCSV([textMsg('A', T1, '62812@s.whatsapp.net', 'say "hi", ok\nnewline')]);
        const lines = csv.split('\n');
        assert.equal(lines[0], 'id,timestamp,fromMe,senderJid,senderName,kind,text');
        assert.match(csv, /"say ""hi"", ok\nnewline"/);
    });
});

describe('chatStatistics', () => {
    it('counts totals, senders, kinds, hour/weekday buckets and first/last', () => {
        const messages = [
            textMsg('A', T1, '62812@s.whatsapp.net', 'makan makan enak', false, 'J.AP'),
            textMsg('B', T2, '62812@s.whatsapp.net', 'makan lagi', false, 'J.AP'),
            imageMsg('C', T3, '62811@s.whatsapp.net', '')
        ];
        const stats = chatStatistics(messages);
        assert.equal(stats.total, 3);
        assert.equal(stats.bySender['J.AP'], 2);
        assert.equal(stats.bySender['62811'], 1);
        assert.equal(stats.byKind.text, 2);
        assert.equal(stats.byKind.image, 1);
        assert.equal(stats.firstTimestamp, T1);
        assert.equal(stats.lastTimestamp, T3);
        assert.equal(stats.byHour.reduce((a, b) => a + b, 0), 3);
        assert.equal(stats.byWeekday.reduce((a, b) => a + b, 0), 3);
        // 'makan' appears 3x and tops the list
        assert.equal(stats.topWords[0].word, 'makan');
        assert.equal(stats.topWords[0].count, 3);
    });
    it('strips URLs and @mentions from word counts; respects minWordLength/topWords', () => {
        const stats = chatStatistics([
            textMsg('A', T1, '62812@s.whatsapp.net', 'cek https://example.com/very-long @62811234567 ya ya kopi kopi kopi')
        ], { topWords: 2, minWordLength: 3 });
        assert.equal(stats.topWords.length, 2);
        assert.equal(stats.topWords[0].word, 'kopi');
        const words = stats.topWords.map((w) => w.word);
        assert.ok(!words.some((w) => w.includes('example') || w.includes('62811234567')), 'urls/mentions must be stripped');
        assert.ok(!words.includes('ya'), 'below minWordLength must be skipped');
    });
    it('ignores protocol messages entirely', () => {
        const stats = chatStatistics([
            { key: { id: 'P', remoteJid: 'x@g.us' }, messageTimestamp: T1, message: { protocolMessage: { type: 0 } } }
        ]);
        assert.equal(stats.total, 0);
        assert.equal(stats.firstTimestamp, null);
    });
    it('rejects non-array input', () => {
        assert.throws(() => chatStatistics(null), /must be an array/);
    });
});
