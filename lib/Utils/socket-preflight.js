/**
 * Socket preflight — catch broken makeWASocket configs BEFORE they turn
 * into cryptic 405s and silent QR failures. Wired into makeWASocket()
 * automatically (warnings via your logger); call it yourself for hard
 * validation in CI.
 *
 * ```js
 * import { validateSocketConfig } from '@japofc/baileys'
 *
 * const report = validateSocketConfig(config)
 * // { ok, errors: ['auth is missing …'], warnings: ['browser should be …'] }
 * if (!report.ok) throw new Error(report.errors.join('; '))
 * ```
 */

export const validateSocketConfig = (config = {}) => {
	const errors = [];
	const warnings = [];

	// auth
	if (!config.auth) {
		errors.push('auth is missing — pass { auth: state } from useMultiFileAuthState()/useSingleFileAuthState()');
	} else {
		if (!config.auth.creds) {
			errors.push('auth.creds is missing — did you pass the whole { state, saveCreds } object instead of state?');
		}
		if (!config.auth.keys || typeof config.auth.keys.get !== 'function' || typeof config.auth.keys.set !== 'function') {
			errors.push('auth.keys must expose get(type, ids) and set(data)');
		}
	}

	// version
	if (config.version !== undefined && config.version !== 'auto') {
		if (!Array.isArray(config.version) || config.version.length !== 3 || !config.version.every(n => Number.isInteger(n))) {
			errors.push('version must be an array of 3 integers (e.g. [2, 3000, 1048606905])');
		} else if (config.version[0] === 2 && config.version[1] === 2000) {
			warnings.push('version 2.2xxx is the retired legacy line — current WA Web is 2.3000.x');
		}
	}

	// browser tuple
	if (config.browser !== undefined) {
		if (!Array.isArray(config.browser) || config.browser.length !== 3 || !config.browser.every(part => typeof part === 'string')) {
			errors.push("browser must be a tuple of 3 strings — use Browsers.ubuntu('Chrome') etc.");
		} else if (/^win32$/i.test(config.browser[2] || '')) {
			warnings.push("browser sub-platform 'WIN32' was retired by WhatsApp — use Browsers.windows() (WIN_HYBRID)");
		}
	}

	// full history needs a Desktop identity
	if (config.syncFullHistory && Array.isArray(config.browser)) {
		const platform = String(config.browser[0] || '').toLowerCase();
		if (!platform.includes('desktop') && !platform.includes('windows') && !platform.includes('mac')) {
			warnings.push('syncFullHistory only works with a Desktop browser identity (Browsers.windows/macOS) — other identities receive partial history');
		}
	}

	// timeouts
	for (const key of ['connectTimeoutMs', 'defaultQueryTimeoutMs', 'keepAliveIntervalMs']) {
		const value = config[key];
		if (value !== undefined && value !== null && (!Number.isFinite(value) || value < 1000)) {
			warnings.push(`${key} of ${value}ms looks wrong — did you mean seconds? (values are milliseconds)`);
		}
	}

	// logger shape
	if (config.logger && typeof config.logger.child !== 'function') {
		errors.push('logger must be pino-compatible (needs .child()) — try createSecureLogger()');
	}

	return { ok: errors.length === 0, errors, warnings };
};
