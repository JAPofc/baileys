/**
 * Session tools — inspect, repair, move and ship your auth session:
 *
 * ```js
 * import {
 *     analyzeAuthState, repairAuthState,
 *     exportAuthToString, importAuthFromString,
 *     migrateFolderToAuthState
 * } from '@japofc/baileys'
 *
 * // health check ("session doctor")
 * const report = await analyzeAuthState('./auth')
 * report.registered; report.counts; report.corrupted; report.issues
 *
 * // quarantine corrupted JSON files so the socket can boot again
 * await repairAuthState('./auth')
 *
 * // ship the whole session as ONE portable string (the "SESSION_ID"
 * // pattern) — paste it on the other device and import:
 * const str = await exportAuthToString('./auth')
 * await importAuthFromString(str, './auth-restored')   // perfect copy
 *
 * // move a folder session into ANY other adapter (sqlite/redis/single-file):
 * const { state, saveCreds } = await useSQLiteAuthState('auth.db')
 * await migrateFolderToAuthState('./auth', state, saveCreds)
 * ```
 *
 * Export strings contain your full credentials — treat them like passwords.
 */
import { readdir, readFile, writeFile, mkdir, rename, stat } from 'fs/promises';
import { join } from 'path';
import { deflateSync, inflateSync } from 'zlib';
import { BufferJSON } from './generics.js';

export const SESSION_EXPORT_MAGIC = 'JAPSESS1';

/** Signal key types found in a multi-file auth folder. */
export const AUTH_KEY_TYPES = [
	'app-state-sync-key',
	'app-state-sync-version',
	'sender-key-memory',
	'sender-key',
	'pre-key',
	'session'
];

const categorize = (fileName) => {
	if (fileName === 'creds.json') {
		return 'creds';
	}
	for (const type of AUTH_KEY_TYPES) {
		if (fileName.startsWith(`${type}-`)) {
			return type;
		}
	}
	return 'other';
};

/**
 * Inspect a multi-file auth folder: what's inside, how big, is it healthy.
 * Never throws on unreadable content — problems land in `corrupted`/`issues`.
 */
export const analyzeAuthState = async (folder) => {
	const report = {
		folder,
		ok: false,
		registered: false,
		me: undefined,
		platform: undefined,
		counts: {},
		totalFiles: 0,
		totalBytes: 0,
		corrupted: [],
		issues: []
	};
	let files;
	try {
		files = (await readdir(folder)).filter(f => f.endsWith('.json'));
	} catch (err) {
		report.issues.push(`cannot read folder: ${err.message}`);
		return report;
	}
	for (const file of files) {
		report.totalFiles++;
		const path = join(folder, file);
		try {
			const raw = await readFile(path, 'utf-8');
			report.totalBytes += Buffer.byteLength(raw);
			const parsed = JSON.parse(raw, BufferJSON.reviver);
			const category = categorize(file);
			report.counts[category] = (report.counts[category] || 0) + 1;
			if (category === 'creds') {
				report.registered = !!parsed?.registered;
				report.me = parsed?.me?.id;
				report.platform = parsed?.platform;
			}
		} catch (err) {
			report.corrupted.push({ file, error: err.message });
		}
	}
	if (!report.counts.creds) {
		report.issues.push('creds.json missing — this folder holds no login');
	} else if (!report.registered) {
		report.issues.push('creds present but not registered — pairing incomplete');
	}
	if (report.counts.creds && !report.counts['pre-key']) {
		report.issues.push('no pre-keys stored — new sessions cannot be established');
	}
	if (report.corrupted.length) {
		report.issues.push(`${report.corrupted.length} corrupted file(s) — run repairAuthFolder()`);
	}
	report.ok = report.registered && report.corrupted.length === 0 && report.issues.length === 0;
	return report;
};

/**
 * Quarantine corrupted JSON files (renamed to `*.corrupted`) so the auth
 * state can load again. Returns `{ repaired: [names], checked }`.
 */
export const repairAuthFolder = async (folder, { suffix = '.corrupted' } = {}) => {
	const files = (await readdir(folder)).filter(f => f.endsWith('.json'));
	const repaired = [];
	for (const file of files) {
		const path = join(folder, file);
		try {
			JSON.parse(await readFile(path, 'utf-8'));
		} catch {
			await rename(path, path + suffix);
			repaired.push(file);
		}
	}
	return { repaired, checked: files.length };
};

/**
 * Serialize a whole multi-file auth folder into ONE portable string
 * (deflate + base64, raw file map → perfect fidelity). Treat the result
 * like a password: it IS your WhatsApp login.
 */
export const exportAuthToString = async (folder) => {
	const files = (await readdir(folder)).filter(f => f.endsWith('.json'));
	if (!files.includes('creds.json')) {
		throw new Error('no creds.json in folder — nothing to export');
	}
	const map = {};
	for (const file of files) {
		map[file] = await readFile(join(folder, file), 'utf-8');
	}
	const packed = deflateSync(Buffer.from(JSON.stringify(map), 'utf-8')).toString('base64');
	return `${SESSION_EXPORT_MAGIC}.${packed}`;
};

/** True when a string looks like an exportAuthToString() result. */
export const isSessionExportString = (value) =>
	typeof value === 'string' && value.startsWith(`${SESSION_EXPORT_MAGIC}.`);

/**
 * Restore a session string into a folder (created if missing).
 * Returns `{ files }` — the number of files written.
 */
export const importAuthFromString = async (sessionString, folder) => {
	if (!isSessionExportString(sessionString)) {
		throw new Error(`not a session export string (expected "${SESSION_EXPORT_MAGIC}." prefix)`);
	}
	const packed = sessionString.slice(SESSION_EXPORT_MAGIC.length + 1);
	let map;
	try {
		map = JSON.parse(inflateSync(Buffer.from(packed, 'base64')).toString('utf-8'));
	} catch {
		throw new Error('session string is corrupted (inflate/parse failed)');
	}
	if (!map['creds.json']) {
		throw new Error('session string holds no creds.json');
	}
	await mkdir(folder, { recursive: true });
	let count = 0;
	for (const [file, content] of Object.entries(map)) {
		if (file.includes('/') || file.includes('..')) {
			continue; // defensive: no path traversal from a pasted string
		}
		await writeFile(join(folder, file), content, { mode: 0o600 });
		count++;
	}
	return { files: count };
};

/**
 * Push a multi-file folder session into ANY auth-state adapter
 * (single-file, SQLite, Redis, Mongo…): creds are copied into
 * `targetState.creds` and every key record is written via
 * `targetState.keys.set()`.
 *
 * File names encode key ids with `:` → `-` and `/` → `__`; `__` is reversed
 * automatically, but a `-` inside session/sender-key ids is ambiguous —
 * such files are still migrated as-is and listed in `warnings` (those
 * records re-establish themselves automatically after reconnect).
 *
 * Returns `{ migrated: { type: count }, warnings }`.
 */
export const migrateFolderToAuthState = async (folder, targetState, saveCreds) => {
	const files = (await readdir(folder)).filter(f => f.endsWith('.json'));
	if (!files.includes('creds.json')) {
		throw new Error('no creds.json in source folder');
	}
	const migrated = {};
	const warnings = [];
	const readJson = async (file) => JSON.parse(await readFile(join(folder, file), 'utf-8'), BufferJSON.reviver);

	// creds first
	const creds = await readJson('creds.json');
	for (const key of Object.keys(targetState.creds)) {
		delete targetState.creds[key];
	}
	Object.assign(targetState.creds, creds);
	migrated.creds = 1;
	if (saveCreds) {
		await saveCreds();
	}

	for (const file of files) {
		const type = categorize(file);
		if (type === 'creds' || type === 'other') {
			if (type === 'other') {
				warnings.push(`${file}: unknown key type — skipped`);
			}
			continue;
		}
		const rawId = file.slice(type.length + 1, -'.json'.length);
		const id = rawId.replace(/__/g, '/');
		if ((type === 'session' || type === 'sender-key' || type === 'sender-key-memory') && id.includes('-')) {
			warnings.push(`${file}: id may have contained ':' (stored sanitized) — migrated as-is, will re-establish on use`);
		}
		const value = await readJson(file);
		await targetState.keys.set({ [type]: { [id]: value } });
		migrated[type] = (migrated[type] || 0) + 1;
	}
	return { migrated, warnings };
};
