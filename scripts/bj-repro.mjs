// §2.105 repro -- extractVideoThumb()/videoToJpeg() silently return an EMPTY buffer for any
// video shorter than the seek point (default 1s). ffmpeg exits 0 with no frame written, we
// never check, and the caller embeds a 0-byte jpegThumbnail.
//
// Needs a real ffmpeg (FFMPEG_PATH / ffmpeg-static / PATH).
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { requireFfmpegPath } from '../lib/Utils/ffmpeg-path.js'
import { extractVideoThumb } from '../lib/Utils/messages-media.js'
import { videoToJpeg, generateThumbnail } from '../lib/index.js'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { Boom } from '@hapi/boom'

// the pre-fix implementation, straight out of git
const oldSrc = execFileSync('git', ['show', 'HEAD:lib/Utils/messages-media.js'], { encoding: 'utf8' })
const from = oldSrc.indexOf('export const extractVideoThumb')
const body = oldSrc.slice(from, oldSrc.indexOf('\n};', from) + 3).replace('export const', 'const')
const oldExtract = new Function('spawn', 'once', 'Boom', 'requireFfmpegPath',
	`${body.replace("const { requireFfmpegPath } = await import('./ffmpeg-path.js');", '')}\nreturn extractVideoThumb`
)(spawn, once, Boom, requireFfmpegPath)

const bin = await requireFfmpegPath()
const make = (seconds, out) =>
	execFileSync(bin, ['-y', '-f', 'lavfi', '-i', `testsrc=size=320x240:rate=10`, '-t', String(seconds), out], { stdio: 'ignore' })

make(0.8, '/tmp/short.mp4')   // a 0.8s clip — shorter than the default seek
make(3, '/tmp/long.mp4')

const show = async (label, file) => {
	const before = await oldExtract(file, '00:00:01', { width: 320, height: -1 }).catch(() => Buffer.alloc(0))
	const direct = await extractVideoThumb(file, '00:00:01', { width: 320, height: -1 }).catch(() => Buffer.alloc(0))
	const viaHelper = await videoToJpeg(readFileSync(file)).catch(e => e)
	const thumb = await generateThumbnail(file, 'video', {}).catch(e => e)
	const jpeg = b => (Buffer.isBuffer(b) && b.length > 2 && b[0] === 0xff && b[1] === 0xd8 ? 'valid JPEG' : `*** ${b?.length ?? 0} bytes, NOT a JPEG ***`)
	console.log(`${label.padEnd(12)} BEFORE: ${jpeg(before).padEnd(34)} AFTER: ${jpeg(direct).padEnd(12)} videoToJpeg: ${jpeg(viaHelper.length !== undefined ? viaHelper : Buffer.alloc(0))}`)
	const thumbBuf = thumb?.thumbnail ? Buffer.from(thumb.thumbnail, typeof thumb.thumbnail === 'string' ? 'base64' : undefined) : null
	console.log(`${''.padEnd(12)} generateThumbnail jpegThumbnail: ${thumbBuf ? jpeg(thumbBuf) : 'none'}  dims: ${JSON.stringify(thumb?.originalImageDimensions ?? null)}`)
}

await show('0.8s clip', '/tmp/short.mp4')
await show('3s clip', '/tmp/long.mp4')
