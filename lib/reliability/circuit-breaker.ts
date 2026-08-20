import CircuitBreaker from "opossum";
import { logEvent, observeMetric } from "@/lib/observability/logging";

export type CircuitBreakerService =
  | "onemap-search"
  | "onemap-reverse-geocode"
  | "onemap-route"
  | "datagov-sync"
  | "datagov-client"
  | "formsg-handoff"
  | "rag-query"
  | "geospatial-status"
  | "geospatial-map-features"
  | "queue-producer";

export type CircuitBreakerStatus = {
  name: string;
  enabled: boolean;
  closed: boolean;
  opened: boolean;
  halfOpen: boolean;
  stats: {
    failures: number;
    fallbacks: number;
    successes: number;
    rejects: number;
    fires: number;
    timeouts: number;
    errorRate: number;
  };
};

const breakerDefaults = {
  timeout: 8000,
  errorThresholdPercentage: 50,
  resetTimeout: 15000,
  rollingCountTimeout: 10000,
  rollingCountBuckets: 10,
  volumeThreshold: 5,
};

const breakers = new Map<CircuitBreakerService, CircuitBreaker>();
const actionRefs = new Map<CircuitBreakerService, { current: (...args: unknown[]) => Promise<unknown> }>();

function createBreakerOptions(service: CircuitBreakerService): CircuitBreaker.Options {
  const overrides: Partial<Record<CircuitBreakerService, Partial<CircuitBreaker.Options>>> = {
    "onemap-search": { timeout: 5000, errorThresholdPercentage: 60 },
    "onemap-reverse-geocode": { timeout: 4000, errorThresholdPercentage: 60 },
    "onemap-route": { timeout: 6000, resetTimeout: 20000 },
    "datagov-sync": { timeout: 30000, resetTimeout: 60000, volumeThreshold: 2 },
    "datagov-client": { timeout: 15000, resetTimeout: 30000, volumeThreshold: 3 },
    "formsg-handoff": { timeout: 5000, errorThresholdPercentage: 40, resetTimeout: 30000 },
    "rag-query": { timeout: 8000, errorThresholdPercentage: 40 },
    "geospatial-status": { timeout: 4000, errorThresholdPercentage: 50 },
    "geospatial-map-features": { timeout: 5000, errorThresholdPercentage: 50 },
    "queue-producer": { timeout: 5000, errorThresholdPercentage: 40, resetTimeout: 30000 },
  };

  return { ...breakerDefaults, ...overrides[service] };
}

export function getCircuitBreaker(service: CircuitBreakerService, fn?: (...args: unknown[]) => Promise<unknown>): CircuitBreaker {
  if (fn) {
    const existingRef = actionRefs.get(service);
    if (existingRef) {
      existingRef.current = fn;
      return breakers.get(service)!;
    }
  }

  const existing = breakers.get(service);
  if (existing) return existing;

  const options = createBreakerOptions(service);
  const stub = async () => {
    throw new Error(`Circuit breaker ${service} requires a function. Use getCircuitBreaker(name, fn)`);
  };
  const actionRef: { current: (...args: unknown[]) => Promise<unknown> } = { current: fn ?? stub };
  actionRefs.set(service, actionRef);

  const action = (...args: unknown[]) => actionRef.current(...args);
  const breaker = new CircuitBreaker(action, {
    ...options,
    name: service,
  });

  breaker.on("open", () => {
    logEvent("warn", "circuit_breaker.open", { service });
    observeMetric("circuit_breaker.open", 1, { service });
  });

  breaker.on("halfOpen", () => {
    logEvent("info", "circuit_breaker.half_open", { service });
    observeMetric("circuit_breaker.half_open", 1, { service });
  });

  breaker.on("close", () => {
    logEvent("info", "circuit_breaker.closed", { service });
    observeMetric("circuit_breaker.closed", 1, { service });
  });

  breaker.on("failure", () => {
    observeMetric("circuit_breaker.failure", 1, { service });
  });

  breaker.on("success", () => {
    observeMetric("circuit_breaker.success", 1, { service });
  });

  breaker.on("timeout", () => {
    observeMetric("circuit_breaker.timeout", 1, { service });
  });

  breaker.on("fallback", () => {
    observeMetric("circuit_breaker.fallback", 1, { service });
  });

  breakers.set(service, breaker);
  return breaker;
}

export function getAllCircuitBreakerStatus(): CircuitBreakerStatus[] {
  return Array.from(breakers.entries()).map(([name, breaker]) => {
    const stats = breaker.stats;
    return {
      name,
      enabled: breaker.enabled,
      closed: breaker.closed,
      opened: breaker.opened,
      halfOpen: breaker.halfOpen,
      stats: {
        failures: stats.failures,
        fallbacks: stats.fallbacks,
        successes: stats.successes,
        rejects: stats.rejects,
        fires: stats.fires,
        timeouts: stats.timeouts,
        errorRate: stats.fires > 0 ? Math.round((stats.failures / stats.fires) * 1000) / 10 : 0,
      },
    };
  });
}

export function isCircuitOpen(service: CircuitBreakerService): boolean {
  const breaker = breakers.get(service);
  return breaker ? breaker.opened : false;
}
