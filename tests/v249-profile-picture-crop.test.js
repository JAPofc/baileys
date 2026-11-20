// §2.98 — a profile picture must not depend on which optional image library is installed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Jimp } from 'jimp'
import { generateProfilePicture, PROFILE_PICTURE_POSITIONS } from '../lib/index.js'
import { getImageProcessingLibrary } from '../lib/Utils/messages-media.js'

// `sharp` is an OPTIONAL peer dependency: on a machine where its prebuilt binary is not
// installed, a static `import sharp from 'sharp'` makes this whole FILE fail to load rather
// than skipping the cases that need it -- which is what broke the Node 24 CI job while
// Node 20 and 22 passed. Resolve it the way the library itself does, and skip if absent.
const lib = await getImageProcessingLibrary()
const sharp = 'sharp' in lib ? lib.sharp?.default : undefined
const needsSharp = { skip: sharp ? false : 'sharp is not installed' }

// 600x300 — left third RED, middle third WHITE, right third BLUE
const W = 600, H = 300
const makeSource = async () => {
	const raw = Buffer.alloc(W * H * 3)
	for (let y = 0; y < H; y++) {
		for (let x = 0; x < W; x++) {
			const i = (y * W + x) * 3
			const band = x < 200 ? [255, 0, 0] : x < 400 ? [255, 255, 255] : [0, 0, 255]
			raw[i] = band[0]; raw[i + 1] = band[1]; raw[i + 2] = band[2]
		}
	}
	return sharp(raw, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer()
}

/** Sample a thin strip across the vertical centre at 3 points and name the dominant colour. */
const bands = async (buffer) => {
	const meta = await sharp(buffer).metadata()
	const strip = await sharp(buffer)
		.extract({ left: 0, top: Math.max(0, Math.floor(meta.height / 2) - 1), width: meta.width, height: 2 })
		.toBuffer()
	const { data, info } = await sharp(strip).resize(3, 1, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true })
	return [0, 1, 2].map(i => {
		const [r, g, b] = [data[i * info.channels], data[i * info.channels + 1], data[i * info.channels + 2]]
		if (r > 200 && g < 90 && b < 90) return 'RED'
		if (b > 200 && r < 90) return 'BLUE'
		if (r > 200 && g > 200 && b > 200) return 'WHITE'
		return 'MIX'
	})
}

test('§2.98 a landscape photo is centre-cropped, not cropped from the corner', needsSharp, async () => {
	const source = await makeSource()
	const { img, width, height, fit, position } = await generateProfilePicture(source, { width: 300, height: 300 })
	assert.deepEqual({ width, height, fit, position }, { width: 300, height: 300, fit: 'cover', position: 'centre' })
	const meta = await sharp(img).metadata()
	assert.deepEqual([meta.width, meta.height], [300, 300])

	const sampled = await bands(img)
	assert.equal(sampled[1], 'WHITE', 'the centre of the source must be the centre of the crop')
	assert.deepEqual(sampled[0], sampled[0] === 'MIX' ? 'MIX' : sampled[0])
	assert.notDeepEqual(sampled, ['RED', 'RED', 'WHITE'], 'that is the old top-left crop')
	assert.notDeepEqual(sampled, ['RED', 'WHITE', 'BLUE'], 'that is an undistorted squash, not a crop')
})

test('§2.98 position picks which square is kept', needsSharp, async () => {
	const source = await makeSource()
	const left = await bands((await generateProfilePicture(source, { width: 300, height: 300, position: 'left' })).img)
	const right = await bands((await generateProfilePicture(source, { width: 300, height: 300, position: 'right' })).img)
	assert.equal(left[0], 'RED')
	assert.equal(right[2], 'BLUE')
	assert.notDeepEqual(left, right)
	// a portrait source crops vertically, and top/bottom differ
	const portrait = await sharp(source).rotate(90).png().toBuffer()
	const top = (await generateProfilePicture(portrait, { width: 200, height: 200, position: 'top' })).img
	const bottom = (await generateProfilePicture(portrait, { width: 200, height: 200, position: 'bottom' })).img
	assert.notEqual(Buffer.compare(top, bottom), 0, 'top and bottom crops of a portrait must differ')
	assert.ok(PROFILE_PICTURE_POSITIONS.includes('centre'))
	await assert.rejects(generateProfilePicture(source, { position: 'diagonal' }), /unknown position/)
})

test('§2.98 contain keeps the whole picture, cover fills the square', needsSharp, async () => {
	const source = await makeSource()
	const contain = await generateProfilePicture(source, { width: 300, height: 300, fit: 'contain' })
	const meta = await sharp(contain.img).metadata()
	assert.deepEqual([meta.width, meta.height], [300, 300])
	const sampled = await bands(contain.img)
	assert.deepEqual(sampled, ['RED', 'WHITE', 'BLUE'], 'contain must still show both ends of the source')
	assert.equal(contain.fit, 'contain')
})

test('§2.98 the jimp path centre-crops the same way sharp does', needsSharp, async () => {
	// jimp is driven directly here because the runtime picks sharp when both are installed
	const source = await makeSource()
	const image = await Jimp.read(source)
	const size = Math.min(image.width, image.height)
	const centred = image.clone().crop({
		x: Math.floor((image.width - size) / 2),
		y: Math.floor((image.height - size) / 2),
		w: size, h: size
	})
	const viaJimp = await centred.resize({ w: 300, h: 300 }).getBuffer('image/jpeg')
	const viaSharp = (await generateProfilePicture(source, { width: 300, height: 300 })).img
	assert.deepEqual(await bands(viaJimp), await bands(viaSharp), 'both backends must produce the same crop')

	// and the source really does still contain the old, wrong behaviour nowhere
	const src = readFileSync(new URL('../lib/Utils/messages-media.js', import.meta.url), 'utf8')
	const code = src.split('\n').filter(line => !/^\s*(\*|\/\/|\/\*)/.test(line)).join('\n')
	assert.doesNotMatch(code, /crop\(\{ x: 0, y: 0, w: min, h: min \}\)/, 'the top-left crop must be gone')
	assert.match(code, /const cropOrigin = \(width, height, size\)/)
	assert.match(code, /typeof transformer\.crop === 'function'/, '@napi-rs must crop before resizing')
})

// §2.98 (upgrade) — buttons that would not render fall back to readable text.
import {
	supportsInteractiveButtons, sendInteractiveSafe, describeButtonsAsText, getMessageDevice,
	BUTTON_UNRELIABLE_PLATFORMS
} from '../lib/index.js'

const fakeSock = (platform) => {
	const sent = []
	return {
		sent,
		authState: { creds: { platform } },
		logger: { debug() {} },
		sendMessage: async (jid, content) => { sent.push({ jid, content }); return { key: { id: 'X' }, content } }
	}
}
const CONTENT = {
	text: 'Pilih satu',
	footer: 'JAP',
	interactiveButtons: [
		{ name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'Ya', id: '.ya' }) },
		{ name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: 'Situs', url: 'https://x' }) }
	]
}

test('§2.98 the paired platform decides whether buttons can render', () => {
	assert.deepEqual(supportsInteractiveButtons(fakeSock('Android')), { supported: true, platform: 'android', reason: null })
	assert.equal(supportsInteractiveButtons(fakeSock('iOS')).supported, false)
	assert.match(supportsInteractiveButtons(fakeSock('iPad')).reason, /does not render native-flow buttons/)
	// unknown or missing platform is treated as capable — refusing on a guess is worse
	assert.equal(supportsInteractiveButtons(fakeSock(undefined)).supported, true)
	assert.equal(supportsInteractiveButtons(fakeSock('something-new')).supported, true)
	assert.equal(supportsInteractiveButtons({}).supported, true)
	assert.ok(BUTTON_UNRELIABLE_PLATFORMS.includes('ios'))
})

test('§2.98 sendInteractiveSafe sends buttons when they render, text when they do not', async () => {
	const android = fakeSock('Android')
	const ok = await sendInteractiveSafe(android, '1@s.whatsapp.net', CONTENT)
	assert.equal(ok.mode, 'interactive')
	assert.equal(ok.reason, null)
	assert.ok(android.sent[0].content.interactiveButtons, 'the buttons must go out untouched')

	const ios = fakeSock('iOS')
	const fallback = await sendInteractiveSafe(ios, '1@s.whatsapp.net', CONTENT)
	assert.equal(fallback.mode, 'text')
	assert.match(fallback.reason, /ios/)
	assert.equal(ios.sent[0].content.interactiveButtons, undefined)
	assert.equal(ios.sent[0].content.text, 'Pilih satu\n1. Ya (.ya)\n2. Situs — https://x\nJAP')

	// opting out of the fallback turns it into an error instead of a blank bubble
	await assert.rejects(sendInteractiveSafe(fakeSock('iOS'), 'j', CONTENT, { fallback: false }), /does not render/)
	// a web-only requirement also triggers the fallback
	const webOnly = await sendInteractiveSafe(fakeSock('Android'), 'j', {
		text: 'x', interactiveButtons: [{ name: 'galaxy_message', buttonParamsJson: JSON.stringify({ display_text: 'G' }) }]
	}, { requireWebSupport: true })
	assert.equal(webOnly.mode, 'text')
	// genuinely invalid buttons are still an error, not a silent downgrade
	await assert.rejects(sendInteractiveSafe(fakeSock('Android'), 'j', {
		text: 'x', interactiveButtons: [{ name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: 'no url' }) }]
	}), /needs a url/)
	await assert.rejects(sendInteractiveSafe({}, 'j', CONTENT), /connected socket/)
})

test('§2.98 describeButtonsAsText reads every button shape, and getMessageDevice reads ids', () => {
	assert.equal(describeButtonsAsText({ text: 'Hi', buttons: [{ id: 'a', text: 'Satu' }] }), 'Hi\n1. Satu (a)')
	assert.equal(describeButtonsAsText({ text: 'Hi', buttons: ['Plain'] }, { numbered: false }), 'Hi\n• Plain')
	assert.match(describeButtonsAsText({
		text: 'Call', interactiveButtons: [{ name: 'cta_call', buttonParamsJson: JSON.stringify({ display_text: 'Telepon', phone_number: '628' }) }]
	}), /Telepon — 628/)
	assert.throws(() => describeButtonsAsText({}), /nothing in this content/)

	assert.equal(getMessageDevice({ key: { id: '3A' + 'x'.repeat(18) } }), 'ios')
	assert.equal(getMessageDevice({ key: { id: '3E' + 'x'.repeat(20) } }), 'web')
	assert.equal(getMessageDevice({}), 'unknown')
})
