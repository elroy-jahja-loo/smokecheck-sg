import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const forbidden = [
  /^\.env(?:\.|$)/,
  /^opencode\.jsonc?$/,
  /^\.opencode\//,
  /^\.vercel\//,
  /\.pem$/,
  /\.p12$/,
  /\.pfx$/,
];
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bsbp_[a-f0-9]{24,}\b/i,
  /\bsk-[a-z0-9_-]{24,}\b/i,
  /\bAKIA[A-Z0-9]{16}\b/,
  /\bAIza[A-Za-z0-9_-]{30,}\b/,
  /(?:SENTRY_AUTH_TOKEN|QSTASH_TOKEN|REDIS_TOKEN|OIDC_CLIENT_SECRET)[ \t]*=[ \t]*["']?[A-Za-z0-9_+/=-]{16,}/,
];

const violations = [];
for (const file of tracked) {
  if (forbidden.some((pattern) => pattern.test(file)) && file !== ".env.local.example") {
    violations.push(`${file}: forbidden tracked file`);
    continue;
  }
  if (file === "package-lock.json" || file === "sbom.cdx.json") continue;
  let contents;
  try {
    contents = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (secretPatterns.some((pattern) => pattern.test(contents))) violations.push(`${file}: possible credential`);
}

if (violations.length > 0) {
  console.error(`Secret hygiene check failed:\n${violations.map((entry) => `- ${entry}`).join("\n")}`);
  process.exit(1);
}

console.log(`Secret hygiene check passed for ${tracked.length} tracked files.`);
