/** Read the sender-key memory of one or more groups. */
export declare function readSenderKeyMemory(keys: any, jids: string | string[]): Promise<Record<string, Record<string, boolean>>>;
/** Forget the whole sender-key memory of these groups (next message re-distributes). */
export declare function clearSenderKeyMemory(keys: any, jids: string | string[]): Promise<{ cleared: number; devices: number }>;
/** Drop specific devices from one group's sender-key memory. */
export declare function forgetSenderKeyDevices(keys: any, jid: string, deviceJids: string | string[]): Promise<{ removed: number; remaining: number }>;
