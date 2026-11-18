/**
 * scripts/x-repro.mjs --- standalone reproduction for BUGREPORT 2.61.
 *
 * Section A replays the pre-fix sharp branch verbatim (inlined, not imported) next to the
 * real extractImageThumb(), so the difference stays visible after the fix. Section B shows
 * the backend disagreement that made the bug library-dependent.
 * Run with: node scripts/x-repro.mjs
 */
import sharp from 'sharp';
import { extractImageThumb } from '../lib/Utils/messages-media.js';

// a 400x200 landscape bitmap tagged orientation:6 — i.e. a portrait photo straight out of
// a phone camera: every viewer displays it as 200x400
const src = await sharp({ create: { width: 400, height: 200, channels: 3, background: { r: 200, g: 30, b: 30 } } })
	.jpeg().withMetadata({ orientation: 6 }).toBuffer();

const stored = await sharp(src).metadata();
const displayed = await sharp(await sharp(src).rotate().jpeg().toBuffer()).metadata();
console.log('=== A) extractImageThumb() and the EXIF Orientation tag ===');
console.log(` stored bitmap   : ${stored.width}x${stored.height}, EXIF orientation=${stored.orientation}`);
console.log(` as displayed    : ${displayed.width}x${displayed.height}  <- what the user sees`);

// the pre-fix sharp branch, verbatim
const oldImg = sharp(src);
const oldMeta = await oldImg.metadata();
const oldBuf = await oldImg.resize(32).jpeg({ quality: 50 }).toBuffer();
const oldThumb = await sharp(oldBuf).metadata();
console.log(` BEFORE -> original: {width:${oldMeta.width},height:${oldMeta.height}}, thumbnail ${oldThumb.width}x${oldThumb.height} (sideways)`);

const now = await extractImageThumb(src, 32);
const nowThumb = await sharp(now.buffer).metadata();
console.log(` AFTER  -> original: {width:${now.original.width},height:${now.original.height}}, thumbnail ${nowThumb.width}x${nowThumb.height} (upright)`);
console.log(' => those dimensions go straight onto the wire as imageMessage.width/height.');

console.log('\n=== B) the two optional backends disagreed ===');
const { Jimp } = await import('jimp');
const viaJimp = await Jimp.read(src);
console.log(` jimp reads it as : ${viaJimp.width}x${viaJimp.height}  (auto-rotates)`);
console.log(` sharp reads it as: ${stored.width}x${stored.height}  (does not)`);
console.log(' => before the fix the same photo produced a different message depending on which library was installed.');
