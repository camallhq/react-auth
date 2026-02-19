// src/auth/refreshLock.ts
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function tryAcquireLock(storage: StorageLike, key: string, ttlMs: number): boolean {
  const now = Date.now();
  const raw = storage.getItem(key);
  if (raw) {
    const lockUntil = Number(raw);
    if (!Number.isNaN(lockUntil) && lockUntil > now) return false;
  }
  storage.setItem(key, String(now + ttlMs));
  return true;
}

export function releaseLock(storage: StorageLike, key: string) {
  storage.removeItem(key);
}

export async function waitForUnlock(storage: StorageLike, key: string, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const raw = storage.getItem(key);
    if (!raw) return;
    const until = Number(raw);
    if (Number.isNaN(until) || until <= Date.now()) {
      storage.removeItem(key);
      return;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
}
