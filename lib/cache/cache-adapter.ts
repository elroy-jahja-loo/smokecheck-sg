export type CacheSetOptions = {
  ttlSeconds: number;
};

type CacheRecord<T> = {
  value: T;
  expiresAt: number;
};

export interface CacheAdapter {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, options: CacheSetOptions): Promise<void>;
  acquireLease(key: string, owner: string, ttlSeconds: number): Promise<boolean>;
  releaseLease(key: string, owner: string): Promise<void>;
  invalidatePrefix(prefix: string): Promise<void>;
}

export interface RateLimitAdapter {
  check(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number; resetAt: string }>;
}

const cacheStore = new Map<string, CacheRecord<unknown>>();
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

class InMemoryCacheAdapter implements CacheAdapter {
  async get<T>(key: string) {
    const record = cacheStore.get(key);
    if (!record) return undefined;
    if (Date.now() > record.expiresAt) {
      cacheStore.delete(key);
      return undefined;
    }
    return record.value as T;
  }

  async set<T>(key: string, value: T, options: CacheSetOptions) {
    cacheStore.set(key, {
      value,
      expiresAt: Date.now() + options.ttlSeconds * 1000,
    });
  }

  async acquireLease(key: string, owner: string, ttlSeconds: number) {
    const existing = cacheStore.get(key);
    if (existing && existing.expiresAt > Date.now()) return false;
    cacheStore.set(key, { value: owner, expiresAt: Date.now() + ttlSeconds * 1000 });
    return true;
  }

  async releaseLease(key: string, owner: string) {
    if (cacheStore.get(key)?.value === owner) cacheStore.delete(key);
  }

  async invalidatePrefix(prefix: string) {
    for (const key of cacheStore.keys()) {
      if (key.startsWith(prefix)) cacheStore.delete(key);
    }
  }
}

class InMemoryRateLimitAdapter implements RateLimitAdapter {
  async check(key: string, limit: number, windowSeconds: number) {
    const now = Date.now();
    const existing = rateLimitStore.get(key);
    const resetAt = existing && existing.resetAt > now ? existing.resetAt : now + windowSeconds * 1000;
    const count = existing && existing.resetAt > now ? existing.count + 1 : 1;

    rateLimitStore.set(key, { count, resetAt });

    return {
      allowed: count <= limit,
      remaining: Math.max(limit - count, 0),
      resetAt: new Date(resetAt).toISOString(),
    };
  }
}

type UpstashResponse<T> = {
  result?: T;
  error?: string;
};

type UpstashPipelineResponse<T> = Array<{ result?: T; error?: string }>;

class UpstashRedisRestClient {
  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  async command<T>(command: unknown[]) {
    const signal = AbortSignal.timeout(2_500);
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
      signal,
    });
    const payload = await response.json().catch(() => undefined) as UpstashResponse<T> | undefined;
    if (!response.ok || payload?.error) throw new Error(payload?.error ?? `Upstash Redis command failed with ${response.status}`);
    return payload?.result;
  }

  async pipeline<T>(commands: unknown[][]) {
    const signal = AbortSignal.timeout(2_500);
    const response = await fetch(`${this.url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
      signal,
    });
    const payload = await response.json().catch(() => undefined) as UpstashPipelineResponse<T> | undefined;
    if (!response.ok || !payload || payload.some((item) => item.error)) throw new Error(payload?.find((item) => item.error)?.error ?? `Upstash Redis pipeline failed with ${response.status}`);
    return payload;
  }
}

class UpstashRedisCacheAdapter implements CacheAdapter {
  constructor(private readonly client: UpstashRedisRestClient) {}

  async get<T>(key: string) {
    const value = await this.client.command<string | null>(["GET", key]);
    if (!value) return undefined;
    return JSON.parse(value) as T;
  }

  async set<T>(key: string, value: T, options: CacheSetOptions) {
    await this.client.command(["SET", key, JSON.stringify(value), "EX", options.ttlSeconds]);
  }

  async acquireLease(key: string, owner: string, ttlSeconds: number) {
    const result = await this.client.command<string | null>(["SET", key, owner, "NX", "EX", ttlSeconds]);
    return result === "OK";
  }

  async releaseLease(key: string, owner: string) {
    const script = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";
    await this.client.command(["EVAL", script, 1, key, owner]);
  }

  async invalidatePrefix(prefix: string) {
    const script = [
      "local cursor = '0'",
      "repeat",
      "  local res = redis.call('SCAN', cursor, 'MATCH', ARGV[1] .. '*', 'COUNT', 200)",
      "  cursor = res[1]",
      "  for _, key in ipairs(res[2]) do redis.call('DEL', key) end",
      "until cursor == '0'",
      "return 1",
    ].join("\n");
    await this.client.command(["EVAL", script, 0, prefix]);
  }
}

class UpstashRedisRateLimitAdapter implements RateLimitAdapter {
  constructor(private readonly client: UpstashRedisRestClient) {}

  async check(key: string, limit: number, windowSeconds: number) {
    const script = [
      "local count = redis.call('INCR', KEYS[1])",
      "if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end",
      "return { count, redis.call('TTL', KEYS[1]) }",
    ].join("\n");
    const response = await this.client.command<[number, number]>(["EVAL", script, 1, key, windowSeconds]);
    const count = Number(response?.[0] ?? 1);
    const ttl = Math.max(Number(response?.[1] ?? windowSeconds), 0);
    return {
      allowed: count <= limit,
      remaining: Math.max(limit - count, 0),
      resetAt: new Date(Date.now() + ttl * 1000).toISOString(),
    };
  }
}

class ResilientCacheAdapter implements CacheAdapter {
  constructor(private readonly primary: CacheAdapter, private readonly fallback: CacheAdapter) {}

  async get<T>(key: string) {
    try {
      return await this.primary.get<T>(key);
    } catch {
      return this.fallback.get<T>(key);
    }
  }

  async set<T>(key: string, value: T, options: CacheSetOptions) {
    await this.fallback.set(key, value, options);
    await this.primary.set(key, value, options).catch(() => undefined);
  }

  async acquireLease(key: string, owner: string, ttlSeconds: number) {
    try {
      return await this.primary.acquireLease(key, owner, ttlSeconds);
    } catch {
      return this.fallback.acquireLease(key, owner, ttlSeconds);
    }
  }

  async releaseLease(key: string, owner: string) {
    await Promise.allSettled([
      this.primary.releaseLease(key, owner),
      this.fallback.releaseLease(key, owner),
    ]);
  }

  async invalidatePrefix(prefix: string) {
    await Promise.allSettled([
      this.primary.invalidatePrefix(prefix),
      this.fallback.invalidatePrefix(prefix),
    ]);
  }
}

class ResilientRateLimitAdapter implements RateLimitAdapter {
  constructor(private readonly primary: RateLimitAdapter, private readonly fallback: RateLimitAdapter) {}

  async check(key: string, limit: number, windowSeconds: number) {
    try {
      return await this.primary.check(key, limit, windowSeconds);
    } catch {
      return this.fallback.check(key, Math.max(1, Math.floor(limit / 2)), windowSeconds);
    }
  }
}

function createRedisAdapters() {
  const url = process.env.REDIS_URL?.replace(/^"|"$/g, "");
  const token = process.env.REDIS_TOKEN?.replace(/^"|"$/g, "");
  if (!url || !token) {
    return {
      cache: new InMemoryCacheAdapter(),
      rateLimit: new InMemoryRateLimitAdapter(),
      provider: "in_memory" as const,
    };
  }
  const client = new UpstashRedisRestClient(url, token);
  const fallbackCache = new InMemoryCacheAdapter();
  const fallbackRateLimit = new InMemoryRateLimitAdapter();
  return {
    cache: new ResilientCacheAdapter(new UpstashRedisCacheAdapter(client), fallbackCache),
    rateLimit: new ResilientRateLimitAdapter(new UpstashRedisRateLimitAdapter(client), fallbackRateLimit),
    provider: "upstash_redis" as const,
  };
}

const redisAdapters = createRedisAdapters();

export const cacheAdapter: CacheAdapter = redisAdapters.cache;
export const rateLimitAdapter: RateLimitAdapter = redisAdapters.rateLimit;
export const cacheProvider = redisAdapters.provider;
