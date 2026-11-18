/** Newsletter tools — paced batch channel operations. */

export interface NewsletterBatchReport {
	ok: string[];
	failed: Array<{ jid: string; error: unknown }>;
	total: number;
}

export interface NewsletterBatchOptions {
	/** Pause between operations. Default 1500. */
	delayMs?: number;
	onProgress?: (info: { jid: string; index: number; total: number; ok: number; failed: number }) => void;
}

export declare const followManyNewsletters: (sock: unknown, jids: string[], options?: NewsletterBatchOptions) => Promise<NewsletterBatchReport>;
export declare const unfollowManyNewsletters: (sock: unknown, jids: string[], options?: NewsletterBatchOptions) => Promise<NewsletterBatchReport>;
export declare const muteManyNewsletters: (sock: unknown, jids: string[], options?: NewsletterBatchOptions) => Promise<NewsletterBatchReport>;
