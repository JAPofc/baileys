import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    resolveFfmpegPath, requireFfmpegPath, setFfmpegPath,
    ffmpegInstallHint, _resetFfmpegCache,
} from '../lib/Utils/ffmpeg-path.js';

// The central ffmpeg resolver: override → ffmpeg-static →
// @ffmpeg-installer/ffmpeg → system PATH. CI sometimes has ffmpeg-static
// installed (devDependency-free, only when a test env added it) and
// sometimes only a system binary — the assertions below hold in both.

afterEach(() => {
    _resetFfmpegCache();
    delete process.env.FFMPEG_PATH;
});

describe('ffmpeg-path: resolution order', () => {
    it('explicit setFfmpegPath() wins over everything', async () => {
        setFfmpegPath('/custom/ffmpeg-bin');
        assert.equal(await resolveFfmpegPath(), '/custom/ffmpeg-bin');
        assert.equal(await requireFfmpegPath(), '/custom/ffmpeg-bin');
    });

    it('setFfmpegPath(null) clears the override', async () => {
        setFfmpegPath('/custom/ffmpeg-bin');
        setFfmpegPath(null);
        const resolved = await resolveFfmpegPath();
        assert.notEqual(resolved, '/custom/ffmpeg-bin');
    });

    it('FFMPEG_PATH env var is honored when the file exists', async () => {
        process.env.FFMPEG_PATH = process.execPath; // any existing file
        assert.equal(await resolveFfmpegPath(), process.execPath);
    });

    it('FFMPEG_PATH pointing nowhere is ignored (falls through)', async () => {
        process.env.FFMPEG_PATH = '/does/not/exist/ffmpeg';
        const resolved = await resolveFfmpegPath();
        assert.notEqual(resolved, '/does/not/exist/ffmpeg');
    });

    it('auto-detection returns a usable value or null, and caches', async () => {
        const first = await resolveFfmpegPath();
        assert.ok(first === null || typeof first === 'string');
        // second call must return the identical cached value
        assert.equal(await resolveFfmpegPath(), first);
    });
});

describe('ffmpeg-path: requireFfmpegPath error path', () => {
    it('throws the install hint when nothing is found', async () => {
        const resolved = await resolveFfmpegPath();
        if (resolved) {
            // this environment HAS ffmpeg — require must succeed instead
            assert.equal(await requireFfmpegPath(), resolved);
            return;
        }
        await assert.rejects(requireFfmpegPath(), /ffmpeg not found/);
    });

    it('install hint names a real installer for this platform', () => {
        const hint = ffmpegInstallHint();
        assert.match(hint, /ffmpeg not found/);
        assert.match(hint, /setFfmpegPath|FFMPEG_PATH/);
        // platform-specific guidance present (Termux/apt/brew/winget/npm)
        assert.match(hint, /pkg install|apt install|brew install|winget|ffmpeg-static/);
    });
});
