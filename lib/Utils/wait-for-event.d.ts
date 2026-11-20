import type { BaileysEventMap } from '../Types/index.js'

export type WaitForEventOptions<E extends keyof BaileysEventMap, T> = {
	/** keep waiting while this returns false */
	filter?: (payload: BaileysEventMap[E]) => boolean
	/**
	 * map/extract the resolved value; returning `undefined` is treated as
	 * "not it yet" and the wait continues
	 */
	pick?: (payload: BaileysEventMap[E]) => T | undefined
	/** default 30000; `0` or negative disables the timeout */
	timeoutMs?: number
	signal?: AbortSignal
}

export type WaitForEventEmitter = {
	on(event: string, listener: (...args: any[]) => void): any
	off(event: string, listener: (...args: any[]) => void): any
}

/**
 * Await the next matching Baileys event, detaching the listener on every exit
 * path. Rejects on timeout or abort.
 */
export function waitForEvent<E extends keyof BaileysEventMap>(
	ev: WaitForEventEmitter,
	event: E,
	opts?: WaitForEventOptions<E, BaileysEventMap[E]>
): Promise<BaileysEventMap[E]>
export function waitForEvent<E extends keyof BaileysEventMap, T>(
	ev: WaitForEventEmitter,
	event: E,
	opts: WaitForEventOptions<E, T> & { pick: (payload: BaileysEventMap[E]) => T | undefined }
): Promise<T>
