/**
 * Simple in-memory TTL cache for slot availability.
 * Keyed by "unitId:employeeId:date:durationMinutes" — entries expire after `ttlMs`.
 * On new booking, all duration variants for the same employee+date are invalidated.
 */
const cache = new Map<string, { data: string[]; expiresAt: number }>();
const DEFAULT_TTL_MS = 60_000; // 60 seconds — safe since invalidateSlotCache is called on every new booking

export function getSlotCache(unitId: string, employeeId: string, date: string, durationMinutes: number, bufferMins = 0): string[] | null {
  const key = `${unitId}:${employeeId}:${date}:${durationMinutes}:${bufferMins}`;
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

export function setSlotCache(unitId: string, employeeId: string, date: string, durationMinutes: number, slots: string[], bufferMins = 0, ttlMs = DEFAULT_TTL_MS): void {
  const key = `${unitId}:${employeeId}:${date}:${durationMinutes}:${bufferMins}`;
  cache.set(key, { data: slots, expiresAt: Date.now() + ttlMs });
}

export function invalidateSlotCache(unitId: string, employeeId: string, date: string): void {
  const prefix = `${unitId}:${employeeId}:${date}:`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
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
