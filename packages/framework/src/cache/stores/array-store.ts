import type { CacheStore, TaggedCacheStore } from '../cache-manager.js';

interface CacheEntry {
  value: unknown;
  expiresAt: number | null;
}

function isExpired(entry: CacheEntry): boolean {
  return entry.expiresAt !== null && Date.now() > entry.expiresAt;
}

export function createArrayStore(): CacheStore {
  const cache = new Map<string, CacheEntry>();
  const tagIndex = new Map<string, Set<string>>();

  function rawGet<T>(key: string): T | null {
    const entry = cache.get(key);
    if (!entry) return null;
    if (isExpired(entry)) {
      cache.delete(key);
      return null;
    }
    return entry.value as T;
  }

  function rawSet<T>(key: string, value: T, ttlSeconds?: number): void {
    cache.set(key, {
      value,
      expiresAt: ttlSeconds != null ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  return {
    async get<T>(key: string): Promise<T | null> {
      return rawGet<T>(key);
    },

    async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
      rawSet(key, value, ttlSeconds);
    },

    async forget(key: string): Promise<void> {
      cache.delete(key);
    },

    async flush(): Promise<void> {
      cache.clear();
      tagIndex.clear();
    },

    async remember<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
      const existing = rawGet<T>(key);
      if (existing !== null) return existing;
      const value = await fn();
      rawSet(key, value, ttlSeconds);
      return value;
    },

    tags(tags: string[]): TaggedCacheStore {
      return {
        async get<T>(key: string): Promise<T | null> {
          return rawGet<T>(key);
        },

        async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
          rawSet(key, value, ttlSeconds);
          for (const tag of tags) {
            let keys = tagIndex.get(tag);
            if (!keys) {
              keys = new Set();
              tagIndex.set(tag, keys);
            }
            keys.add(key);
          }
        },

        async flush(): Promise<void> {
          for (const tag of tags) {
            const keys = tagIndex.get(tag);
            if (keys) {
              for (const key of keys) {
                cache.delete(key);
              }
              tagIndex.delete(tag);
            }
          }
        },
      };
    },
  };
}
