/**
 * lib/Utils/exif-orientation.js — EXIF orientation arithmetic
 *
 * Part of @japofc/baileys. A JPEG straight out of a phone camera is almost always stored
 * in the sensor's native landscape layout with an EXIF `Orientation` tag telling the
 * viewer how to turn it. Image libraries disagree about whether to apply it: jimp
 * auto-rotates on read, sharp does not. `extractImageThumb()` reported raw metadata
 * dimensions, so the same photo produced a different thumbnail and different
 * `imageMessage.width`/`height` depending on which optional library was installed
 * (BUGREPORT §2.61).
 */

/** EXIF orientation values whose transform swaps width and height (90°/270° rotations). */
export const SWAPPED_EXIF_ORIENTATIONS = Object.freeze([5, 6, 7, 8]);

const SWAPPED = new Set(SWAPPED_EXIF_ORIENTATIONS);

/**
 * Whether this EXIF orientation turns the image through a quarter turn, so the displayed
 * width and height are the stored ones swapped.
 *
 * @param {number | null | undefined} orientation EXIF `Orientation` tag (1-8).
 * @returns {boolean} `false` for 1-4, for missing values and for anything out of range.
 */
export const isOrientationSwapped = (orientation) => SWAPPED.has(orientation);

/**
 * The dimensions a viewer actually shows, given stored dimensions plus an EXIF
 * orientation.
 *
 * @param {{ width?: number, height?: number, orientation?: number } | null | undefined} metadata
 * @returns {{ width: number | undefined, height: number | undefined }}
 */
export const exifOrientedDimensions = (metadata) => {
	const width = metadata?.width;
	const height = metadata?.height;
	if (isOrientationSwapped(metadata?.orientation)) {
		return { width: height, height: width };
	}
	return { width, height };
};
