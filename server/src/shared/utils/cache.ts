type CacheEntry<T> = {
  data: T;
  expiry: number;
};

export class SimpleCache {
  private cache = new Map<string, CacheEntry<any>>();

  set<T>(key: string, data: T, ttlSeconds: number): void {
    this.cache.set(key, {
      data,
      expiry: Date.now() + ttlSeconds * 1000,
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  keys(): string[] {
    return [...this.cache.keys()];
  }

  clear(): void {
    this.cache.clear();
  }
}

export const sharedCache = new SimpleCache();
