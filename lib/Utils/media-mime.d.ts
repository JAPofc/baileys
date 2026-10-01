/** MIME ⇆ extension mapping and magic-byte media sniffing. */
export declare const normalizeMime: (mime?: string) => string;
export declare const mimeToExtension: (mime?: string) => string;
export declare const extensionToMime: (ext?: string) => string;
export declare const mediaKindFromMime: (mime?: string, opts?: { webpAsImage?: boolean }) => 'image' | 'video' | 'audio' | 'sticker' | 'document';
export declare const sniffMediaType: (input: Buffer | Uint8Array | ArrayBufferView) => { mime: string; ext: string; kind: 'image' | 'video' | 'audio' | 'sticker' | 'document' } | null;
