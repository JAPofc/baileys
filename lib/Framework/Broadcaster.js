/**
 * Broadcaster + Scheduler — throttled fan-out sending and timed job dispatch.
 *
 * Ports the ergonomics of the "scheduled broadcast" recipe (rate-limited list
 * send with retries, progress and cancellation) onto our framework, and pairs
 * it with a small one-shot scheduler. Both are transport-agnostic and take an
 * injectable clock/timer/sleep so they are fully unit-testable without sockets
 * or wall-clock waits.
 *
 * Credit: JAP.
 */

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Create a throttled broadcaster.
 *
 * @param {object} opts
 * @param {(jid: string, message: any) => Promise<any>} opts.send  delivery fn (wrap sock.sendMessage)
 * @param {number} [opts.throttleMs=1000]   pause between recipients (rate limiting)
 * @param {number} [opts.maxRetries=2]      extra attempts after the first failure
 * @param {number} [opts.retryDelayMs=500]  pause before a retry
 * @param {(p: object) => void} [opts.onProgress]  per-recipient progress callback
 * @param {(ms: number) => Promise<void>} [opts.sleep]  injectable delay (tests)
 */
export function createBroadcaster(opts = {}) {
    const {
        send,
        throttleMs = 1000,
        maxRetries = 2,
        retryDelayMs = 500,
        onProgress,
        sleep = defaultSleep
    } = opts;

    if (typeof send !== 'function') {
        throw new TypeError('createBroadcaster: `send` function is required');
    }
    if (!Number.isFinite(throttleMs) || throttleMs < 0) {
        throw new RangeError('createBroadcaster: `throttleMs` must be a finite number >= 0');
    }
    if (!Number.isInteger(maxRetries) || maxRetries < 0) {
        throw new RangeError('createBroadcaster: `maxRetries` must be a non-negative integer');
    }
    if (!Number.isFinite(retryDelayMs) || retryDelayMs < 0) {
        throw new RangeError('createBroadcaster: `retryDelayMs` must be a finite number >= 0');
    }

    /**
     * Fan a message out to a list of recipients.
     *
     * @param {string[]} recipients  JIDs (deduped, order preserved)
     * @param {any | ((jid: string, index: number) => any | Promise<any>)} message
     * @returns {{ cancel(): void, readonly cancelled: boolean, done: Promise<object> }}
     */
    function broadcast(recipients, message) {
        if (!Array.isArray(recipients)) {
            throw new TypeError('broadcast: `recipients` must be an array');
        }

        // Dedupe while preserving order; drop empties/non-strings.
        const seen = new Set();
        const list = [];
        for (const r of recipients) {
            if (typeof r !== 'string' || r.length === 0) continue;
            if (seen.has(r)) continue;
            seen.add(r);
            list.push(r);
        }

        const resolveMessage = typeof message === 'function' ? message : () => message;
        const total = list.length;
        const results = [];
        let sent = 0;
        let failed = 0;
        let cancelled = false;

        const run = (async () => {
            for (let i = 0; i < list.length; i++) {
                if (cancelled) break;
                const jid = list[i];
                let attempts = 0;
                let ok = false;
                let lastErr;

                while (attempts <= maxRetries) {
                    if (cancelled) break;
                    attempts++;
                    try {
                        const payload = await resolveMessage(jid, i);
                        const result = await send(jid, payload);
                        ok = true;
                        results.push({ jid, ok: true, attempts, result });
                        sent++;
                        break;
                    } catch (err) {
                        lastErr = err;
                        if (attempts <= maxRetries) {
                            await sleep(retryDelayMs);
                        }
                    }
                }

                // If cancelled mid-item without success, abandon it (counts as skipped).
                if (cancelled && !ok) break;

                if (!ok) {
                    results.push({ jid, ok: false, attempts, error: lastErr });
                    failed++;
                }

                if (typeof onProgress === 'function') {
                    onProgress({ index: i, total, jid, ok, sent, failed, remaining: total - (i + 1) });
                }

                // Throttle between recipients — not after the last one, not when cancelled.
                if (throttleMs > 0 && i < list.length - 1 && !cancelled) {
                    await sleep(throttleMs);
                }
            }

            return {
                total,
                sent,
                failed,
                cancelled,
                skipped: total - results.length,
                results
            };
        })();

        return {
            cancel() { cancelled = true; },
            get cancelled() { return cancelled; },
            done: run
        };
    }

    return { broadcast };
}

// setTimeout on most JS runtimes is a signed 32-bit ms value; larger delays
// silently overflow and fire almost immediately. We chunk long waits instead.
const MAX_TIMER_MS = 2 ** 31 - 1;

/**
 * Create a one-shot job scheduler.
 *
 * @param {object} [opts]
 * @param {() => number} [opts.now]                          clock (ms epoch)
 * @param {(fn: () => void, ms: number) => any} [opts.setTimer]   timer arm
 * @param {(handle: any) => void} [opts.clearTimer]         timer disarm
 * @param {(err: any, job: object) => void} [opts.onError]  task error sink
 */
export function createScheduler(opts = {}) {
    const {
        now = Date.now,
        setTimer = (fn, ms) => setTimeout(fn, ms),
        clearTimer = (handle) => clearTimeout(handle),
        onError
    } = opts;

    let seq = 0;
    const jobs = new Map();

    function scheduleAt(runAt, task) {
        const when = runAt instanceof Date ? runAt.getTime() : Number(runAt);
        if (!Number.isFinite(when)) {
            throw new TypeError('scheduleAt: `runAt` must be a timestamp (ms) or Date');
        }
        if (typeof task !== 'function') {
            throw new TypeError('scheduleAt: `task` must be a function');
        }

        const id = `job_${++seq}`;
        const job = { id, runAt: when, status: 'pending', handle: undefined };
        jobs.set(id, job);

        const fire = async () => {
            job.status = 'running';
            jobs.delete(id); // one-shot
            try {
                await task();
                job.status = 'done';
            } catch (err) {
                job.status = 'error';
                if (typeof onError === 'function') onError(err, job);
            }
        };

        // Re-arm in chunks so delays beyond the 32-bit timer ceiling still fire
        // at the right wall-clock moment instead of overflowing to ~immediately.
        const arm = () => {
            const remaining = Math.max(0, job.runAt - now());
            if (remaining > MAX_TIMER_MS) {
                job.handle = setTimer(arm, MAX_TIMER_MS);
            } else {
                job.handle = setTimer(fire, remaining);
            }
        };
        arm();

        return id;
    }

    function scheduleAfter(ms, task) {
        const delay = Number(ms);
        if (!Number.isFinite(delay)) {
            throw new TypeError('scheduleAfter: `ms` must be a finite number');
        }
        return scheduleAt(now() + delay, task);
    }

    function cancel(id) {
        const job = jobs.get(id);
        if (!job) return false;
        if (job.handle !== undefined) clearTimer(job.handle);
        job.status = 'cancelled';
        jobs.delete(id);
        return true;
    }

    function cancelAll() {
        let n = 0;
        for (const id of [...jobs.keys()]) {
            if (cancel(id)) n++;
        }
        return n;
    }

    function list() {
        return [...jobs.values()].map(({ id, runAt, status }) => ({ id, runAt, status }));
    }

    return {
        scheduleAt,
        scheduleAfter,
        cancel,
        cancelAll,
        list,
        get size() { return jobs.size; }
    };
}
