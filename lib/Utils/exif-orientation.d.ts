/** EXIF orientation values whose transform swaps width and height (90°/270° rotations). */
export declare const SWAPPED_EXIF_ORIENTATIONS: readonly number[];

/** Whether this EXIF orientation turns the image a quarter turn. `false` when absent. */
export declare function isOrientationSwapped(orientation: number | null | undefined): boolean;

/**
 * The dimensions a viewer actually displays, given stored dimensions plus an EXIF
 * orientation (BUGREPORT §2.61).
 */
export declare function exifOrientedDimensions(
    metadata: { width?: number; height?: number; orientation?: number } | null | undefined
): { width: number | undefined; height: number | undefined };
