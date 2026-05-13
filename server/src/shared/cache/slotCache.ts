/**
 * Simple in-memory TTL cache for slot availability.
 * Keyed by "unitId:employeeId:date" — entries expire after `ttlMs`.
 */
const cache = new Map<string, { data: string[]; expiresAt: number }>();
const DEFAULT_TTL_MS = 5_000; // 5 seconds

export function getSlotCache(unitId: string, employeeId: string, date: string): string[] | null {
  const key = `${unitId}:${employeeId}:${date}`;
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

export function setSlotCache(unitId: string, employeeId: string, date: string, slots: string[], ttlMs = DEFAULT_TTL_MS): void {
  const key = `${unitId}:${employeeId}:${date}`;
  cache.set(key, { data: slots, expiresAt: Date.now() + ttlMs });
}

export function invalidateSlotCache(unitId: string, employeeId: string, date: string): void {
  cache.delete(`${unitId}:${employeeId}:${date}`);
}

export function invalidateAllSlotCaches(): void {
  cache.clear();
}

// Periodic cleanup of expired entries (every 30s)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now > entry.expiresAt) cache.delete(key);
  }
}, 30_000).unref();
