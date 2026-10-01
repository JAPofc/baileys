/**
 * phone-country — detect a country from a phone number or JID by its dial code.
 *
 * Handy for greeting users in their language, region stats, or flagging
 * unexpected countries. Uses longest-prefix matching over a table of common
 * dial codes (not exhaustive — covers the codes most bots actually see).
 *
 * ```js
 * import { detectCountry, flagEmoji } from '@japofc/baileys'
 *
 * detectCountry('6281234567890')        // { dialCode: '62', iso2: 'ID', name: 'Indonesia' }
 * detectCountry('14155550123@s.whatsapp.net') // { dialCode: '1', iso2: 'US', name: 'United States' }
 * flagEmoji('ID')                        // '🇮🇩'
 * ```
 */

// dial code → [iso2, name]. Ordered loosely; matching is longest-prefix so the
// order here does not affect correctness.
const DIAL_CODES = {
	'1': ['US', 'United States'],
	'7': ['RU', 'Russia'],
	'20': ['EG', 'Egypt'],
	'27': ['ZA', 'South Africa'],
	'31': ['NL', 'Netherlands'],
	'33': ['FR', 'France'],
	'34': ['ES', 'Spain'],
	'39': ['IT', 'Italy'],
	'44': ['GB', 'United Kingdom'],
	'49': ['DE', 'Germany'],
	'52': ['MX', 'Mexico'],
	'55': ['BR', 'Brazil'],
	'60': ['MY', 'Malaysia'],
	'61': ['AU', 'Australia'],
	'62': ['ID', 'Indonesia'],
	'63': ['PH', 'Philippines'],
	'64': ['NZ', 'New Zealand'],
	'65': ['SG', 'Singapore'],
	'66': ['TH', 'Thailand'],
	'81': ['JP', 'Japan'],
	'82': ['KR', 'South Korea'],
	'84': ['VN', 'Vietnam'],
	'86': ['CN', 'China'],
	'90': ['TR', 'Turkey'],
	'91': ['IN', 'India'],
	'92': ['PK', 'Pakistan'],
	'234': ['NG', 'Nigeria'],
	'351': ['PT', 'Portugal'],
	'880': ['BD', 'Bangladesh'],
	'966': ['SA', 'Saudi Arabia'],
	'971': ['AE', 'United Arab Emirates'],
	'972': ['IL', 'Israel']
};

const MAX_LEN = Math.max(...Object.keys(DIAL_CODES).map((k) => k.length));

/** Extract the leading digits of a phone or JID (drops '+', server, device). */
const digitsOf = (input) => String(input ?? '').split('@')[0].split(':')[0].replace(/\D/g, '');

/**
 * Detect the country of a phone/JID. Returns `{ dialCode, iso2, name }` or
 * `null` when no known dial code matches. Longest-prefix wins (so `1` doesn't
 * shadow a longer code).
 */
export const detectCountry = (input) => {
	const digits = digitsOf(input);
	if (!digits) {
		return null;
	}
	for (let len = Math.min(MAX_LEN, digits.length); len >= 1; len--) {
		const prefix = digits.slice(0, len);
		const hit = DIAL_CODES[prefix];
		if (hit) {
			return { dialCode: prefix, iso2: hit[0], name: hit[1] };
		}
	}
	return null;
};

/** Just the dial code (e.g. '62'), or null. */
export const dialCodeOf = (input) => detectCountry(input)?.dialCode ?? null;

/**
 * Regional-indicator flag emoji for a 2-letter ISO country code:
 * flagEmoji('ID') → '🇮🇩'. Returns '' for anything that isn't two letters.
 */
export const flagEmoji = (iso2) => {
	const code = String(iso2 ?? '').trim().toUpperCase();
	if (!/^[A-Z]{2}$/.test(code)) {
		return '';
	}
	return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
};

/** Convenience: flag emoji for a phone/JID, or '' when unknown. */
export const countryFlagOf = (input) => {
	const c = detectCountry(input);
	return c ? flagEmoji(c.iso2) : '';
};
