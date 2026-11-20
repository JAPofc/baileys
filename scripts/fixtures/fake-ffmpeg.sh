#!/bin/sh
# Stand-in for ffmpeg in the batch-AB repro: writes a fixed amount of f32le PCM to
# stdout as fast as it can, then exits 0 — exactly what real ffmpeg does when it
# finishes decoding a short file.
# BYTES env var controls how much; default 128000 (= 1 s of 16 kHz mono f32le).
exec node -e '
const total = Number(process.env.BYTES || 128000);
const buf = Buffer.alloc(total);
for (let i = 0; i < total; i += 4) buf.writeFloatLE(Math.sin(i / 400) * 0.25, i);
process.stdout.write(buf, () => process.exit(0));
'
