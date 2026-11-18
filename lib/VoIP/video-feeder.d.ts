/** Pixel format id for planar YUV 4:2:0. */
export declare const VIDEO_FORMAT_I420: 0;
/** Bytes in one I420 frame (throws on odd dimensions). */
export declare function i420FrameSize(width: number, height: number): number;

export declare class VideoFeeder {
    constructor(
        width: number,
        height: number,
        frameRate: number,
        onFrame: (frame: Buffer, info: { width: number; height: number; format: number }) => void,
        source?: string | { data: Buffer; ext?: string }
    );
    readonly width: number;
    readonly height: number;
    readonly frameRate: number;
    readonly frameSize: number;
    framesEmitted: number;
    droppedFrames: number;
    underflowFrames: number;
    bytesProduced: number;
    blackFrame(): Buffer;
    start(): void;
    stop(): void;
    setSource(source: string | { data: Buffer; ext?: string }): boolean;
    getStats(): {
        framesEmitted: number; droppedFrames: number; underflowFrames: number;
        bytesProduced: number; queued: number; running: boolean;
    };
}
