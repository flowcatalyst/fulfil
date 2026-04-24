export interface TaggedCacheStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  flush(): Promise<void>;
}

export interface CacheStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  forget(key: string): Promise<void>;
  flush(): Promise<void>;
  remember<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T>;
  tags(tags: string[]): TaggedCacheStore;
}

export interface CacheManager {
  store(name?: string): CacheStore;
}

export function createCacheManager(
  stores: Record<string, CacheStore>,
  defaultStore?: string,
): CacheManager {
  const defaultName = defaultStore ?? Object.keys(stores)[0];

  return {
    store(name?: string): CacheStore {
      const storeName = name ?? defaultName;
      if (!storeName) {
        throw new Error('No cache stores configured');
      }
      const s = stores[storeName];
      if (!s) {
        throw new Error(
          `Cache store "${storeName}" not found. Available stores: ${Object.keys(stores).join(', ')}`,
        );
      }
      return s;
    },
  };
}
