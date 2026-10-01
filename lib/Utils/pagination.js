/**
 * pagination — slice a list into pages for bot menus / leaderboards / lists.
 *
 * ```js
 * import { paginate, pageIndicator } from '@japofc/baileys'
 *
 * const p = paginate(members, { page: 2, perPage: 10 })
 * // { items:[...], page:2, perPage:10, total:37, pages:4,
 * //   hasPrev:true, hasNext:true, start:11, end:20, isEmpty:false }
 *
 * pageIndicator(p.page, p.pages)   // '‹ 2/4 ›'
 * ```
 */

/**
 * Paginate an array. `page` is 1-based and clamped into `[1, pages]`; an empty
 * list yields `pages: 1`, `page: 1`, `items: []`. `start`/`end` are 1-based,
 * human-friendly item numbers (end is inclusive; 0 when the page is empty).
 */
export const paginate = (items, { page = 1, perPage = 10 } = {}) => {
	const list = Array.isArray(items) ? items : [];
	const size = Math.max(1, Math.floor(perPage));
	const total = list.length;
	const pages = Math.max(1, Math.ceil(total / size));
	const current = Math.min(pages, Math.max(1, Math.floor(page) || 1));
	const offset = (current - 1) * size;
	const pageItems = list.slice(offset, offset + size);
	return {
		items: pageItems,
		page: current,
		perPage: size,
		total,
		pages,
		hasPrev: current > 1,
		hasNext: current < pages,
		start: pageItems.length ? offset + 1 : 0,
		end: pageItems.length ? offset + pageItems.length : 0,
		isEmpty: pageItems.length === 0
	};
};

/** Compact page indicator: pageIndicator(2, 4) → '‹ 2/4 ›' (arrows only when a neighbor exists). */
export const pageIndicator = (page, pages, { prev = '‹', next = '›' } = {}) => {
	const p = Math.max(1, Math.floor(page) || 1);
	const total = Math.max(1, Math.floor(pages) || 1);
	const left = p > 1 ? `${prev} ` : '';
	const right = p < total ? ` ${next}` : '';
	return `${left}${p}/${total}${right}`;
};

/**
 * Total number of pages for a given list length and page size (>= 1).
 * `pageCount(0, 10)` → 1.
 */
export const pageCount = (total, perPage = 10) => {
	const n = Math.max(0, Math.floor(Number(total) || 0));
	const size = Math.max(1, Math.floor(perPage));
	return Math.max(1, Math.ceil(n / size));
};
