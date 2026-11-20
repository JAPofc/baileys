/** Render an aligned monospace text table. */
export interface TextTableOptions {
    headers?: string[];
    align?: Array<'left' | 'right' | 'center'>;
    separator?: string;
    fence?: boolean;
}
export declare const textTable: (rows: any[][], options?: TextTableOptions) => string;
