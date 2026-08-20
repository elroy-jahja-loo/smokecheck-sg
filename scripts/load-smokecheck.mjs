const baseUrl = process.env.SMOKECHECK_BASE_URL ?? "http://localhost:3000";
const concurrency = Number(process.env.SMOKECHECK_LOAD_CONCURRENCY ?? 12);
const requests = Number(process.env.SMOKECHECK_LOAD_REQUESTS ?? 120);
const requestTimeoutMs = Number(process.env.SMOKECHECK_REQUEST_TIMEOUT_MS ?? 15000);
const includeRag = (process.env.SMOKECHECK_INCLUDE_RAG ?? "true").toLowerCase() !== "false";

const targets = [
  ["GET", "/"],
  ["GET", "/rules"],
  ["GET", "/sources"],
  ["POST", "/api/geospatial/status", { lat: 1.3048, lng: 103.8318, selectedAddress: "313 Orchard Road" }],
];

if (includeRag) {
  targets.push(["POST", "/api/rag/query", { question: "Can I smoke near a bus stop?" }]);
}

const latencies = [];
let failures = 0;

await Promise.all(Array.from({ length: concurrency }, async (_, worker) => {
  for (let index = worker; index < requests; index += concurrency) {
    const [method, path, body] = targets[index % targets.length];
    const startedAt = performance.now();
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
      if (!response.ok) failures += 1;
      await response.arrayBuffer();
    } catch {
      failures += 1;
    } finally {
      latencies.push(performance.now() - startedAt);
    }
  }
}));

latencies.sort((left, right) => left - right);
const p95 = latencies[Math.floor((latencies.length - 1) * 0.95)] ?? 0;
const p50 = latencies[Math.floor((latencies.length - 1) * 0.5)] ?? 0;

console.log(JSON.stringify({ baseUrl, requests, concurrency, requestTimeoutMs, includeRag, failures, p50Ms: Math.round(p50), p95Ms: Math.round(p95) }, null, 2));
if (failures > 0) process.exitCode = 1;
