export interface ProtocolCaptureOptions {
	file: string;
	redact?: boolean;
	includeBufferData?: boolean;
	filter?: (direction: 'send' | 'recv', node: any, meta?: any) => boolean;
	clock?: () => string;
}
export interface ProtocolCaptureAnalysis {
	totals: { frames: number; send: number; recv: number; parseErrors: number };
	top: {
		tags: Array<{ name: string; count: number }>;
		xmlns: Array<{ name: string; count: number }>;
		types: Array<{ name: string; count: number }>;
		childTags: Array<{ name: string; count: number }>;
		directionTags: Array<{ name: string; count: number }>;
	};
	samples: Array<{ line: number; direction: string; summary: any }>;
	errors: Array<{ line: number; error: string }>;
}
export declare const redactBinaryNode: (value: any, options?: {
	redactAttrs?: RegExp;
	includeBufferData?: boolean;
	maxStringLength?: number;
	maxDepth?: number;
}) => any;
export declare const summarizeBinaryNode: (node: any) => {
	tag: any;
	id: any;
	type: any;
	xmlns: any;
	to: any;
	from: any;
	childTags: any[];
};
export declare const analyzeProtocolCaptureText: (text: string, options?: { sampleLimit?: number; topLimit?: number }) => ProtocolCaptureAnalysis;
export declare const analyzeProtocolCaptureFile: (file: string, options?: { sampleLimit?: number; topLimit?: number }) => Promise<ProtocolCaptureAnalysis>;
export declare const protocolCaptureReport: (analysis: ProtocolCaptureAnalysis) => string;
export declare const createProtocolCapture: (options: ProtocolCaptureOptions) => {
	record(direction: 'send' | 'recv', node: any, meta?: any): Promise<void>;
	bind(sock: any): () => void;
	flush(): Promise<void>;
	close(): Promise<void>;
};
export declare const bindProtocolCapture: (sock: any, options: ProtocolCaptureOptions) => ReturnType<typeof createProtocolCapture>;
