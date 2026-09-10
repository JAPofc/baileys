/**
 * JAP@Add --- Status + channel post schedulers.
 *
 * ```js
 * import { StatusScheduler, ChannelScheduler, StatusHelper } from '@j.ap/baileys'
 * const statusQ = new StatusScheduler(sock)
 * statusQ.schedule(StatusHelper.text('Selamat pagi! ☀️'), new Date('2026-09-11T06:00:00+07:00'))
 * statusQ.scheduleIn(StatusHelper.text('Promo!'), 3600_000, { repeatMs: 86400_000 }) // hourly-ish
 *
 * const channelQ = new ChannelScheduler(sock)
 * channelQ.schedule('123@newsletter', { text: 'Update harian' }, runAt)
 * ```
 *
 * In-memory only (jobs vanish on restart — persist `pending()` yourself if needed).
 */
import { Boom } from '@hapi/boom';
import { StatusHelper } from './status.js';
class BaseTimedPoster {
    constructor(sock, { onError } = {}) {
        if (!sock || typeof sock.sendMessage !== 'function') {
            throw new Boom('Scheduler(sock, ...) requires an active Baileys socket', { statusCode: 400 });
        }
        this.sock = sock;
        this.onError = typeof onError === 'function' ? onError : null;
        this.jobs = new Map();
        this.seq = 0;
    }
    _schedule(sendFn, when, { repeatMs, maxRepeats } = {}) {
        const target = when instanceof Date ? when.getTime() : Number(when);
        if (!Number.isFinite(target)) {
            throw new Boom('schedule(when) needs a Date or epoch-ms number', { statusCode: 400 });
        }
        if (repeatMs !== undefined && (!Number.isFinite(Number(repeatMs)) || Number(repeatMs) <= 0)) {
            throw new Boom('repeatMs must be a positive number', { statusCode: 400 });
        }
        const id = `post_${Date.now()}_${++this.seq}`;
        const job = { id, timer: null, runs: 0, cancelled: false };
        const tick = async () => {
            if (job.cancelled) {
                return;
            }
            job.runs++;
            try {
                await sendFn();
            }
            catch (err) {
                try {
                    this.onError?.(err, id);
                }
                catch { }
            }
            if (job.cancelled) {
                return;
            }
            if (repeatMs && (maxRepeats == null || job.runs < maxRepeats)) {
                job.timer = setTimeout(tick, Number(repeatMs));
                job.timer.unref?.();
            }
            else {
                this.jobs.delete(id);
            }
        };
        job.timer = setTimeout(tick, Math.max(0, target - Date.now()));
        job.timer.unref?.();
        this.jobs.set(id, job);
        return id;
    }
    /** Cancel one job. Returns true if it existed. */
    cancel(id) {
        const job = this.jobs.get(id);
        if (!job) {
            return false;
        }
        job.cancelled = true;
        clearTimeout(job.timer);
        this.jobs.delete(id);
        return true;
    }
    /** Cancel everything. */
    clear() {
        for (const id of [...this.jobs.keys()]) {
            this.cancel(id);
        }
    }
    /** List pending job ids + run counts. */
    pending() {
        return [...this.jobs.values()].map(({ id, runs }) => ({ id, runs }));
    }
}
/** Schedule status posts (broadcast or targeted via `jids`). */
export class StatusScheduler extends BaseTimedPoster {
    schedule(content, when, { jids = [], repeatMs, maxRepeats } = {}) {
        return this._schedule(() => StatusHelper.send(this.sock, content, jids), when, { repeatMs, maxRepeats });
    }
    scheduleIn(content, delayMs, opts = {}) {
        return this.schedule(content, Date.now() + Number(delayMs), opts);
    }
}
/** Schedule channel/newsletter posts. */
export class ChannelScheduler extends BaseTimedPoster {
    schedule(channelJid, content, when, { repeatMs, maxRepeats } = {}) {
        if (typeof channelJid !== 'string' || !channelJid.endsWith('@newsletter')) {
            throw new Boom('ChannelScheduler.schedule needs a channel JID (@newsletter)', { statusCode: 400 });
        }
        return this._schedule(() => this.sock.sendMessage(channelJid, content), when, { repeatMs, maxRepeats });
    }
    scheduleIn(channelJid, content, delayMs, opts = {}) {
        return this.schedule(channelJid, content, Date.now() + Number(delayMs), opts);
    }
}
