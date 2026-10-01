/** Paginate lists for bot menus/leaderboards. */
export interface Page<T> {
    items: T[];
    page: number;
    perPage: number;
    total: number;
    pages: number;
    hasPrev: boolean;
    hasNext: boolean;
    start: number;
    end: number;
    isEmpty: boolean;
}
export declare const paginate: <T>(items: T[], opts?: { page?: number; perPage?: number }) => Page<T>;
export declare const pageIndicator: (page: number, pages: number, opts?: { prev?: string; next?: string }) => string;
export declare const pageCount: (total: number, perPage?: number) => number;
