// MUST be the first import — enforces Node 20+ before any other module loads.
import './node-version-check.js';
import makeWASocket from './Socket/index.js';
export * from '../WAProto/index.js';
export * from './Utils/index.js';
export * from './Types/index.js';
export * from './Store/index.js';
export * from './Defaults/index.js';
export * from './WABinary/index.js';
export * from './WAM/index.js';
export * from './WAUSync/index.js';
export { Dugong } from './Socket/dugong.js';
// JAP@Add --- username query-id rotation helpers (autoRotateQueryIds support)
export { USERNAME_QUERY_IDS, fetchLatestUsernameQueryIds } from './Socket/username.js';
// JAP@Port --- Enterprise Bot Framework (Bot/Context/SessionManager/
// StatsManager/MediaManager/SQLiteStore). See lib/Framework/index.js.
export { Bot, Context, MediaManager, SessionManager, StatsManager, SQLiteStore } from './Framework/index.js';
// JAP@Add --- Audio-only WhatsApp voice-call
// handling (WASM call stack + WebRTC relay via optional `@roamhq/wrtc`). See
// lib/VoIP/index.js for usage — instantiate VoipClient(sock) after connection.open.
export { VoipClient, ActiveCall, CallState, attachVoip, createWavRecorder } from './VoIP/index.js';
export { makeWASocket };
export { makeWASocketAuto } from './Socket/index.js';
export default makeWASocket;

// Jap Builders
export * from './Builders/index.js';

