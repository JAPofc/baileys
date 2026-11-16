/** Tiny RFC-4180 CSV writer/reader. */
export interface ToCSVOptions {
    delimiter?: string;
    newline?: string;
    columns?: string[];
    header?: boolean;
}
export declare const toCSV: (rows: Array<Record<string, any>> | any[][], options?: ToCSVOptions) => string;
export interface ParseCSVOptions {
    delimiter?: string;
    headers?: boolean;
}
export declare function parseCSV(text: string, options?: { headers?: false; delimiter?: string }): string[][];
export declare function parseCSV(text: string, options?: { headers?: true; delimiter?: string }): Array<Record<string, string>>;
export declare function parseCSV(text: string, options?: ParseCSVOptions): any;
