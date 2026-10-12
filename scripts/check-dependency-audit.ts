import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { classifyAuditFindings } from "@/lib/security/dependency-audit";

const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["audit", "--json"], {
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
});

if (result.error || (result.status !== 0 && result.status !== 1)) {
  throw new Error(`npm audit could not complete: ${result.error?.message ?? result.stderr}`);
}

let findings: ReturnType<typeof JSON.parse>;
try {
  findings = JSON.parse(result.stdout);
} catch {
  throw new Error("npm audit did not return valid JSON; cannot verify dependencies");
}

if (!findings.vulnerabilities || typeof findings.vulnerabilities !== "object") {
  throw new Error("npm audit did not return vulnerability data; cannot verify dependencies");
}

const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const { exempt, blocking } = classifyAuditFindings(findings.vulnerabilities, lock.packages);

if (exempt.length > 0) {
  console.warn(`Known unpatched, development-only braces advisory: ${exempt.join(", ")}`);
}
if (blocking.length > 0) {
  console.error(`Dependency audit failed for: ${blocking.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("Dependency audit passed: no other reported vulnerabilities.");
}
