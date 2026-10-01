export declare const EXPLICITLY_REQUESTED_HISTORY_TYPES: readonly number[];
export type HistorySyncNotificationLike = number | {
    syncType?: number | null;
    [key: string]: any;
} | null | undefined;
export declare const isOnDemandHistorySync: (historyMsg?: HistorySyncNotificationLike) => boolean;
export declare const isProcessableHistorySyncType: (historyMsg?: HistorySyncNotificationLike) => boolean;
export declare const shouldProcessHistorySyncNotification: (historyMsg?: HistorySyncNotificationLike, shouldSyncHistoryMessage?: ((msg: any) => boolean) | boolean) => boolean;
export declare const recordsProcessedHistoryMessage: (historyMsg?: HistorySyncNotificationLike) => boolean;
