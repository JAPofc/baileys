/**
 * Timing tools — debounce, throttle, stopwatches and quick measurements.
 *
 * ```js
 * import { debounce, throttle, createStopwatch, measureTime } from '@japofc/baileys'
 *
 * const save = debounce(() => store.flush(), 2000)   // trailing-edge
 * const notify = throttle(sendAlert, 60_000)         // at most 1/min
 *
 * const sw = createStopwatch()
 * sw.lap('download'); sw.lap('convert')
 * sw.format() // 'download 1.2s · convert 0.8s · total 2.0s'
 *
 * const { result, ms } = await measureTime(() => heavyWork())
 * ```
 */

/** Trailing-edge debounce; `.cancel()` and `.flush()` included. */
export const debounce = (fn, waitMs) => {
	let timer = null;
	let lastArgs = null;
	const wrapped = (...args) => {
		lastArgs = args;
		if (timer) {
			clearTimeout(timer);
		}
		timer = setTimeout(() => {
			timer = null;
			fn(...lastArgs);
		}, waitMs);
	};
	wrapped.cancel = () => {
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
	};
	wrapped.flush = () => {
		if (timer) {
			clearTimeout(timer);
			timer = null;
			fn(...lastArgs);
		}
	};
	return wrapped;
};

/** Leading-edge throttle: first call runs, repeats inside the window drop. */
export const throttle = (fn, waitMs, { now = () => Date.now() } = {}) => {
	// -Infinity sentinel: a clock that starts at 0 must not swallow call #1.
	let last = -Infinity;
	const wrapped = (...args) => {
		const t = now();
		if (t - last >= waitMs) {
			last = t;
			return fn(...args);
		}
		return undefined;
	};
	wrapped.reset = () => {
		last = -Infinity;
	};
	return wrapped;
};

/** Lap-based stopwatch with a pretty formatter. */
export const createStopwatch = ({ now = () => Date.now() } = {}) => {
	const startedAt = now();
	let lastLap = startedAt;
	const laps = [];
	return {
		lap(label) {
			const t = now();
			laps.push({ label: label || `lap${laps.length + 1}`, ms: t - lastLap });
			lastLap = t;
			return laps[laps.length - 1].ms;
		},
		get elapsedMs() {
			return now() - startedAt;
		},
		getLaps: () => laps.map(l => ({ ...l })),
		format() {
			const parts = laps.map(l => `${l.label} ${(l.ms / 1000).toFixed(1)}s`);
			parts.push(`total ${((now() - startedAt) / 1000).toFixed(1)}s`);
			return parts.join(' · ');
		}
	};
};

/** Run a (sync or async) function and time it: { result, ms }. */
export const measureTime = async (fn, { now = () => Date.now() } = {}) => {
	const start = now();
	const result = await fn();
	return { result, ms: now() - start };
};
