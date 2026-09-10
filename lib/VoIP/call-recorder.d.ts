/**
 * JAP@Add --- Type declarations for the VoIP WAV recorder.
 */
export interface WavRecorderOptions {
    sampleRate?: number;
    channels?: number;
}
export interface WavRecorder {
    write(pcm: Float32Array): void;
    close(): void;
    readonly bytesWritten: number;
}
export declare const createWavRecorder: (filePath: string, opts?: WavRecorderOptions) => WavRecorder;
