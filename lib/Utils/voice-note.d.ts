/**
 * JAP@Add --- Type declarations for the voice-note sender.
 */
export interface VoiceNoteBuildOptions {
    convert?: boolean;
    waveform?: number[] | Buffer;
    seconds?: number;
    /** Remote URL fetch timeout (default 60s). */
    fetchTimeoutMs?: number;
    timeoutMs?: number;
    /** Max bytes accepted when audio is an HTTP(S) URL (default 50 MiB). */
    maxContentLength?: number;
    /** Allow localhost/private-IP URLs. Off by default to reduce SSRF risk. */
    allowPrivate?: boolean;
    headers?: any;
    dispatcher?: any;
    fetchImpl?: typeof fetch;
    [key: string]: any;
}
export declare const buildVoiceNoteContent: (audio: Buffer | string | {
    url: string;
}, opts?: VoiceNoteBuildOptions) => Promise<any>;
export declare const sendVoiceNote: (sock: any, jid: any, audio: Buffer | string | {
    url: string;
}, options?: any) => Promise<any>;
