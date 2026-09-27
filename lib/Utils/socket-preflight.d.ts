/** Socket preflight — validate makeWASocket configs before they bite. */

export interface PreflightReport {
	ok: boolean;
	/** Things that will break the socket (missing auth, bad shapes). */
	errors: string[];
	/** Things that will probably surprise you (retired platforms, ms/seconds mixups). */
	warnings: string[];
}

export declare const validateSocketConfig: (config?: Record<string, unknown>) => PreflightReport;
