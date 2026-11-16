// Tests for browser-utils (Browsers presets + getPlatformId) — was uncovered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Browsers, getPlatformId } from '../lib/Utils/browser-utils.js';
import { proto } from '../WAProto/index.js';

test('Browsers presets return [os, browser, version] tuples', () => {
    assert.deepEqual(Browsers.ubuntu('Chrome'), ['Ubuntu', 'Chrome', '22.04.4']);
    assert.deepEqual(Browsers.macOS('Safari'), ['Mac OS', 'Safari', '14.4.1']);
    assert.deepEqual(Browsers.baileys('Edge'), ['Baileys', 'Edge', '6.5.0']);
    assert.deepEqual(Browsers.windows('Firefox'), ['Windows', 'Firefox', '10.0.22631']);
});

test('Browsers.appropriate uses a known OS name and the given browser', () => {
    const t = Browsers.appropriate('Chrome');
    assert.equal(t.length, 3);
    assert.equal(t[1], 'Chrome');
    assert.equal(typeof t[0], 'string');
    assert.ok(t[0].length > 0);
});

test('getPlatformId maps known browser names to the proto enum (as string)', () => {
    assert.equal(getPlatformId('chrome'), String(proto.DeviceProps.PlatformType.CHROME));
    assert.equal(getPlatformId('desktop'), String(proto.DeviceProps.PlatformType.DESKTOP));
    assert.equal(getPlatformId('safari'), String(proto.DeviceProps.PlatformType.SAFARI));
});

test('getPlatformId is case-insensitive', () => {
    assert.equal(getPlatformId('Chrome'), getPlatformId('chrome'));
    assert.equal(getPlatformId('FIREFOX'), getPlatformId('firefox'));
});

test('getPlatformId falls back to "1" (chrome) for unmapped names', () => {
    // by design (matches upstream): unmapped browsers default to chrome id "1"
    assert.equal(getPlatformId('bogus'), '1');
    assert.equal(getPlatformId('nope'), '1');
});
