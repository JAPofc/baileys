export function makeMutex(): {
    mutex(code: any): any;
};
export function makeKeyedMutex(): {
    mutex(key: any, task: any): Promise<any>;
    /** number of keys with at least one in-flight lock; returns to 0 when all release */
    readonly size: number;
};
