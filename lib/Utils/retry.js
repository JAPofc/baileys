/**
 * retry — run an async operation with exponential backoff.
 *
 * Network calls to WhatsApp (media upload, mex queries, profile fetches) fail
 * transiently all the time; this wraps one in a bounded retry loop with
 * exponential backoff + optional jitter, so a blip doesn't crash your handler.
 *
 * ```js
 * import { retryWithBackoff, computeBackoffDelay } from '@japofc/baileys'
 *
 * const buf = await retryWithBackoff(() => downloadMediaMessage(msg), {
 *   attempts: 4,          // total tries (default 3)
 *   baseDelayMs: 500,     // first backoff (default 300)
 *   factor: 2,            // growth per attempt (default 2)
 *   maxDelayMs: 10_000,   // cap (default 30_000)
 *   jitter: true,         // randomize 0..delay to avoid thundering herds
 *   shouldRetry: (err) => err?.output?.statusCode !== 404,
 *   onRetry: ({ attempt, delayMs, error }) => logger.warn({ attempt, delayMs }, 'retrying'),
 *   signal: AbortSignal.timeout(15_000), // cancel the whole retry loop
 * })
 * ```
 */

/**
 * Delay (ms) before the retry that FOLLOWS a given 1-based `attempt`:
 * `baseDelayMs * factor^(attempt-1)`, clamped to `maxDelayMs`. With
 * `jitter: true` the result is uniformly sampled in `[0, delay]` (full jitter).
 * RNG is injectable for deterministic tests.
 */
export const computeBackoffDelay = (attempt, {
	baseDelayMs = 300,
	factor = 2,
	maxDelayMs = 30_000,
	jitter = false,
	random = Math.random
} = {}) => {
	const n = Math.max(1, Math.floor(attempt));
	const raw = baseDelayMs * Math.pow(factor, n - 1);
	const capped = Math.min(maxDelayMs, raw);
	if (!Number.isFinite(capped) || capped < 0) {
		return 0;
	}
	return jitter ? Math.floor(random() * capped) : Math.floor(capped);
};

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** An abort error that mirrors the DOM/undici convention (`name === 'AbortError'`). */
export const createAbortError = (reason) => {
	if (reason !== undefined && reason !== null) {
		return reason;
	}
	const err = new Error('The retry operation was aborted');
	err.name = 'AbortError';
	return err;
};

/**
 * Sleep for `ms`, but reject as soon as `signal` aborts. Uses the injected
 * `sleep` for the timing (so tests stay timer-free) and races it against the
 * abort. Cleans up its listener either way.
 */
const abortableSleep = (ms, sleep, signal) => {
	if (!signal) {
		return sleep(ms);
	}
	if (signal.aborted) {
		return Promise.reject(createAbortError(signal.reason));
	}
	return new Promise((resolve, reject) => {
		const onAbort = () => reject(createAbortError(signal.reason));
		signal.addEventListener('abort', onAbort, { once: true });
		Promise.resolve(sleep(ms)).then(
			() => { signal.removeEventListener('abort', onAbort); resolve(); },
			(err) => { signal.removeEventListener('abort', onAbort); reject(err); }
		);
	});
};

/**
 * Run `fn` up to `attempts` times, awaiting an exponential backoff between
 * tries. Resolves with the first success; rejects with the LAST error once
 * attempts are exhausted or `shouldRetry(error)` returns false.
 *
 * `fn` receives the 1-based attempt number. `sleep` is injectable so tests can
 * run without real timers.
 *
 * Pass an `AbortSignal` as `signal` to cancel a retry loop: an already-aborted
 * signal rejects before the first attempt, and an abort that lands during a
 * backoff wait rejects immediately instead of waiting it out. The rejection is
 * the signal's `reason` when set, otherwise an `Error` with `name:'AbortError'`.
 */
export const retryWithBackoff = async (fn, options = {}) => {
	if (typeof fn !== 'function') {
		throw new TypeError('retryWithBackoff(fn): fn must be a function');
	}
	const {
		attempts = 3,
		baseDelayMs = 300,
		factor = 2,
		maxDelayMs = 30_000,
		jitter = false,
		random = Math.random,
		shouldRetry = () => true,
		onRetry,
		sleep = defaultSleep,
		signal
	} = options;

	if (signal?.aborted) {
		throw createAbortError(signal.reason);
	}

	const total = Math.max(1, Math.floor(attempts));
	let lastError;
	for (let attempt = 1; attempt <= total; attempt++) {
		try {
			return await fn(attempt);
		}
		catch (error) {
			lastError = error;
			const isLast = attempt >= total;
			if (isLast || !shouldRetry(error, attempt)) {
				throw error;
			}
			const delayMs = computeBackoffDelay(attempt, { baseDelayMs, factor, maxDelayMs, jitter, random });
			if (typeof onRetry === 'function') {
				try { onRetry({ attempt, delayMs, error }); }
				catch { /* listener errors are the listener's problem */ }
			}
			await abortableSleep(delayMs, sleep, signal);
		}
	}
	// Unreachable in practice (the loop either returns or throws), but keeps
	// the contract explicit.
	throw lastError;
};
