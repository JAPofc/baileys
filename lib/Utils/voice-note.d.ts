/**
 * JAP@Add --- Type declarations for the voice-note sender.
 */
export interface VoiceNoteBuildOptions {
    convert?: boolean;
    waveform?: number[] | Buffer;
    seconds?: number;
    [key: string]: any;
}
export declare const buildVoiceNoteContent: (audio: Buffer | string | {
    url: string;
}, opts?: VoiceNoteBuildOptions) => Promise<any>;
export declare const sendVoiceNote: (sock: any, jid: any, audio: Buffer | string | {
    url: string;
}, options?: any) => Promise<any>;
