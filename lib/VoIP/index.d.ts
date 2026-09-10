// JAP Baileys — VoIP client surface (typed stubs).
//
// Mirrors the names lib/index.js re-exports from lib/VoIP/index.js.
// VoipClient/ActiveCall are EventEmitters without hand-written declarations
// yet; these `any` stubs keep every name importable from TypeScript until
// full .d.ts files land. (See ./types.js for the CallState enum.)
export { CallState } from './types.js';
export { createWavRecorder } from './call-recorder.js';
export type { WavRecorder, WavRecorderOptions } from './call-recorder.js';
declare const _any: any;
export declare const ActiveCall: typeof _any;
export type ActiveCall = any;
export declare const VoipClient: typeof _any;
export type VoipClient = any;
export declare const attachVoip: typeof _any;
export type attachVoip = any;
