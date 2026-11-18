// §2.98 repro -- a profile picture comes out differently depending on which optional image
// library happens to be installed, and two of the three branches are simply wrong.
//
//   sharp branch   : .resize(w, h)            → 'cover' = centre crop        ✔
//   jimp branch    : .crop({ x: 0, y: 0, … }) → crops from the TOP-LEFT      ✘
//   @napi-rs branch: .resize(w, h, 0)         → plain resize = DISTORTS it   ✘
//
// A landscape photo therefore keeps its subject with sharp installed, loses the right-hand
// side with jimp, and gets squashed with @napi-rs/image — same code, same input.
import sharp from 'sharp'
import { Jimp } from 'jimp'

// 600x300: left third red, middle third white, right third blue.
// A correct 300x300 centre crop is ALL WHITE. A top-left crop is half red.
const W = 600, H = 300
const raw = Buffer.alloc(W * H * 3)
for (let y = 0; y < H; y++) {
	for (let x = 0; x < W; x++) {
		const i = (y * W + x) * 3
		const band = x < 200 ? [255, 0, 0] : x < 400 ? [255, 255, 255] : [0, 0, 255]
		raw[i] = band[0]; raw[i + 1] = band[1]; raw[i + 2] = band[2]
	}
}
const source = await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer()

const describe = async (buffer, label) => {
	const { data, info } = await sharp(buffer).resize(3, 1, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true })
	const px = []
	for (let i = 0; i < 3; i++) {
		const [r, g, b] = [data[i * info.channels], data[i * info.channels + 1], data[i * info.channels + 2]]
		px.push(r > 200 && g < 80 && b < 80 ? 'RED' : b > 200 && r < 80 ? 'BLUE' : r > 200 && g > 200 && b > 200 ? 'WHITE' : `rgb(${r},${g},${b})`)
	}
	const meta = await sharp(buffer).metadata()
	console.log(`  ${label.padEnd(34)} ${meta.width}x${meta.height}  bands: ${px.join(' | ')}`)
}

console.log('source: 600x300, left=RED middle=WHITE right=BLUE')
console.log('a correct square profile picture is a CENTRE crop → all WHITE\n')

await describe(await sharp(source).resize(300, 300).jpeg().toBuffer(), 'sharp (cover, centre)')

const jimpImg = await Jimp.read(source)
const min = Math.min(jimpImg.width, jimpImg.height)
const topLeft = jimpImg.clone().crop({ x: 0, y: 0, w: min, h: min })
await describe(await topLeft.resize({ w: 300, h: 300 }).getBuffer('image/jpeg'), 'jimp AS WE DO IT (top-left)')

const centred = (await Jimp.read(source)).crop({
	x: Math.floor((jimpImg.width - min) / 2),
	y: Math.floor((jimpImg.height - min) / 2),
	w: min, h: min
})
await describe(await centred.resize({ w: 300, h: 300 }).getBuffer('image/jpeg'), 'jimp FIXED (centre)')

await describe(await sharp(source).resize(300, 300, { fit: 'fill' }).jpeg().toBuffer(), '@napi-rs style (plain resize)')
