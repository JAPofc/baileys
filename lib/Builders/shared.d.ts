export { generateWAMessageFromContent, prepareWAMessageMedia } from '../Utils/messages.js';
export { generateMessageIDV2 } from '../Utils/generics.js';
export { botMetadataSignature, botMetadataCertificate } from '../Utils/rich-message-utils.js';
export { getBizBinaryNode } from '../WABinary/index.js';
export { PassThrough, Readable } from 'stream';
export declare const crypto: typeof import('crypto');

export interface ExtractIEOptions {
    extract?: boolean;
    hyperlink?: boolean;
    citation?: boolean;
    latex?: boolean;
}

export interface FetchBufferOptions {
    silent?: boolean;
    timeout?: number;
}

export interface ResolveMediaOptions {
    resolveUrl?: boolean;
    resolveWAUrl?: boolean;
    result?: string;
    resize?: boolean;
    width?: number;
    height?: number;
}

export interface Mp4PreviewOptions {
    time?: number;
    result?: 'buffer' | string;
    resize?: boolean;
    width?: number;
    height?: number;
    silent?: boolean;
}

export declare const extractIE: (text: string, options?: ExtractIEOptions) => Record<string, any>;
export declare const waitAllPromises: (input: any) => Promise<any>;
export declare const getSharp: () => Promise<any>;
export declare const getFfmpeg: () => Promise<any>;

export class Toolkit {
    static extractIE(text: string, options?: ExtractIEOptions): Record<string, any>;
    static resize(buffer: Buffer, x: number, y: number, fit?: string): Promise<Buffer>;
    static waitAllPromises(input: any): Promise<any>;
    static fetchBuffer(url: string, options?: Record<string, any>, opts?: FetchBufferOptions): Promise<Buffer>;
    static toUrl(client: any, path: string | Buffer, mediaType?: string): Promise<string>;
    static resolveMedia(client: any, media: any, mediaType?: string, options?: ResolveMediaOptions): Promise<any>;
    static getMp4Duration(buffer: Buffer, options?: { silent?: boolean }): number;
    static getMp4Preview(videoBuffer: Buffer, options?: Mp4PreviewOptions): Promise<Buffer | Record<string, any>>;
}

export abstract class BaseBuilder {
    setTitle(title: string): this;
    setSubtitle(subtitle: string): this;
    setBody(body: string): this;
    setFooter(footer: string): this;
    setContextInfo(obj: Record<string, any>): this;
    addPayload(obj: Record<string, any>): this;
}

export class RowBuilder {
    constructor();
    buttons: Record<string, any>[];
    button(displayText: string, buttonId?: string): this;
}
