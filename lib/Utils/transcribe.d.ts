export type TranscriptionProvider = (audio: Buffer, meta?: { mimetype?: string }) => Promise<{ text: string }>;
export declare const customProvider: (fn: (audio: Buffer, meta?: any) => Promise<{ text: string } | string> | { text: string } | string) => TranscriptionProvider;
export interface WhisperProviderOptions {
    apiKey: string;
    model?: string;
    baseUrl?: string;
    language?: string;
    fileName?: string;
}
export declare const openAIWhisperProvider: (opts: WhisperProviderOptions) => TranscriptionProvider;
export declare const transcribeAudio: (audio: Buffer, opts?: { provider?: TranscriptionProvider; mimetype?: string }) => Promise<{ text: string }>;
export declare const transcribeMessage: (sock: any, webMessage: any, opts?: { provider?: TranscriptionProvider; download?: (keys: any) => Promise<any> }) => Promise<{ text: string; seconds: number | null; ptt: boolean }>;
