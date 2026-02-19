type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export declare function tryAcquireLock(storage: StorageLike, key: string, ttlMs: number): boolean;
export declare function releaseLock(storage: StorageLike, key: string): void;
export declare function waitForUnlock(storage: StorageLike, key: string, timeoutMs?: number): Promise<void>;
export {};
