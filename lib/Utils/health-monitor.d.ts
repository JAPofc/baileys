/** Health monitor — process metrics, custom probes, threshold alerts. */

export interface HealthSnapshot {
	at: number;
	uptimeSec: number;
	processUptimeSec: number;
	heapUsedMb: number;
	heapTotalMb: number;
	rssMb: number;
	externalMb: number;
	eventLoopLagMs: number;
	probes: Record<string, unknown>;
}

export interface HealthMonitorOptions {
	/** Snapshot interval. Default 30000. */
	intervalMs?: number;
	/** metric name (snapshot field or probe name) → alert threshold. */
	thresholds?: Record<string, number>;
	/** Per-probe wall-clock cap. Default 5000. */
	probeTimeoutMs?: number;
	/** Snapshots kept in history. Default 60. */
	maxHistory?: number;
	/** Clock override (testing). */
	now?: () => number;
}

export interface HealthAlert {
	metric: string;
	value: number;
	threshold: number;
	at: number;
}

export interface HealthMonitor {
	/** Collect one snapshot now (measures real event-loop lag). */
	snapshot(): Promise<HealthSnapshot>;
	/** Register a custom metric. Returns a remover. */
	addProbe(name: string, fn: () => unknown | Promise<unknown>): () => void;
	/** Add/change a threshold live (null removes it). */
	setThreshold(metric: string, value: number | null): void;
	getThresholds(): Record<string, number>;
	start(): () => void;
	stop(): void;
	readonly isRunning: boolean;
	/** Fires once per threshold crossing (re-armed when the metric recovers). */
	onAlert(cb: (alert: HealthAlert) => void): () => void;
	/** Fires when a metric drops back under its threshold. */
	onRecover(cb: (alert: HealthAlert) => void): () => void;
	onSnapshot(cb: (snapshot: HealthSnapshot) => void): () => void;
	getHistory(): HealthSnapshot[];
	isAlerting(metric: string): boolean;
}

/** Heap/lag trend text (sparklines) from getHistory(). */
export declare const renderHealthHistory: (history: HealthSnapshot[]) => string;

/** Pretty owner-DM text for a snapshot(). */
export declare const formatHealthSnapshot: (snapshot: HealthSnapshot) => string;

export declare const createHealthMonitor: (options?: HealthMonitorOptions) => HealthMonitor;
