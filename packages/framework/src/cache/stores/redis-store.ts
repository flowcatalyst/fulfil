import type { CacheStore, TaggedCacheStore } from '../cache-manager.js';

export interface RedisStoreConfig {
  /** ioredis client instance */
  readonly client: RedisClient;
  /** Key prefix for namespacing. Defaults to 'cache:' */
  readonly prefix?: string;
}

/**
 * Minimal interface for an ioredis-compatible client.
 * Pass an `ioredis` Redis instance.
 */
export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, expiryMode?: string, time?: number): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  sadd(key: string, ...members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
  srem(key: string, ...members: string[]): Promise<number>;
  flushdb(): Promise<unknown>;
}

export function createRedisStore(config: RedisStoreConfig): CacheStore {
  const prefix = config.prefix ?? 'cache:';
  const { client } = config;

  function prefixed(key: string): string {
    return `${prefix}${key}`;
  }

  function tagKey(tag: string): string {
    return `${prefix}tag:${tag}`;
  }

  async function rawGet<T>(key: string): Promise<T | null> {
    const raw = await client.get(prefixed(key));
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  }

  async function rawSet<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttlSeconds != null) {
      await client.set(prefixed(key), serialized, 'EX', ttlSeconds);
    } else {
      await client.set(prefixed(key), serialized);
    }
  }

  return {
    async get<T>(key: string): Promise<T | null> {
      return rawGet<T>(key);
    },

    async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
      return rawSet(key, value, ttlSeconds);
    },

    async forget(key: string): Promise<void> {
      await client.del(prefixed(key));
    },

    async flush(): Promise<void> {
      await client.flushdb();
    },

    async remember<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
      const existing = await rawGet<T>(key);
      if (existing !== null) return existing;
      const value = await fn();
      await rawSet(key, value, ttlSeconds);
      return value;
    },

    tags(tags: string[]): TaggedCacheStore {
      return {
        async get<T>(key: string): Promise<T | null> {
          return rawGet<T>(key);
        },

        async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
          await rawSet(key, value, ttlSeconds);
          for (const tag of tags) {
            await client.sadd(tagKey(tag), prefixed(key));
          }
        },

        async flush(): Promise<void> {
          for (const tag of tags) {
            const keys = await client.smembers(tagKey(tag));
            if (keys.length > 0) {
              await client.del(...keys);
            }
            await client.del(tagKey(tag));
          }
        },
      };
    },
  };
}
