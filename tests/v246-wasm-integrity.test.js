// Tests for the WASM pinned-manifest verifier + a real integrity check of the
// bundled VoIP assets against lib/assets/wasm/integrity.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPinnedManifest } from '../scripts/fetch-wasm-resources.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const wasmDir = resolve(here, '../lib/assets/wasm');
const manifest = JSON.parse(readFileSync(resolve(wasmDir, 'integrity.json'), 'utf8'));

test('bundled VoIP WASM assets match their pinned integrity manifest', () => {
    const downloads = {};
    for (const name of Object.keys(manifest.files)) {
        downloads[name] = readFileSync(resolve(wasmDir, name));
    }
    const report = verifyPinnedManifest(manifest, downloads);
    assert.equal(report.ok, true, JSON.stringify(report.files, null, 2));
    for (const f of report.files) {
        assert.equal(f.ok, true, `${f.name} should match its pin (${f.reason})`);
        assert.equal(f.actual.sha256, f.expected.sha256);
        assert.equal(f.actual.size, f.expected.size);
    }
});

test('verifyPinnedManifest flags a sha256 mismatch (tamper detection)', () => {
    const tampered = { files: { 'a.bin': { sha256: 'deadbeef', size: 3 } } };
    const report = verifyPinnedManifest(tampered, { 'a.bin': Buffer.from([1, 2, 3]) });
    assert.equal(report.ok, false);
    assert.equal(report.files[0].ok, false);
    assert.equal(report.files[0].reason, 'sha256-mismatch');
});

test('verifyPinnedManifest flags a size mismatch even when sha is not pinned', () => {
    const m = { files: { 'a.bin': { size: 99 } } };
    const report = verifyPinnedManifest(m, { 'a.bin': Buffer.from([1, 2, 3]) });
    assert.equal(report.files[0].ok, false);
    assert.equal(report.files[0].reason, 'size-mismatch');
});

test('verifyPinnedManifest reports a missing download', () => {
    const m = { files: { 'a.bin': { sha256: 'x', size: 1 }, 'b.bin': { sha256: 'y', size: 1 } } };
    const report = verifyPinnedManifest(m, { 'a.bin': Buffer.from([0]) });
    const b = report.files.find((f) => f.name === 'b.bin');
    assert.equal(b.ok, false);
    assert.equal(b.reason, 'missing');
    assert.equal(report.ok, false);
});

test('empty manifest is not considered ok', () => {
    assert.equal(verifyPinnedManifest({ files: {} }, {}).ok, false);
    assert.equal(verifyPinnedManifest({}, {}).ok, false);
});
