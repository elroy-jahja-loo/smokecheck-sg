import assert from "node:assert/strict";
import { test } from "node:test";

import { classifyAuditFindings } from "./dependency-audit";

const node = "node_modules/braces";
const advisory = { name: "braces", url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm" };

test("only the known unpatched, development-only braces dependency chain is exempt", () => {
  const findings = {
    braces: { nodes: [node], via: [advisory] },
    micromatch: { nodes: ["node_modules/micromatch"], via: ["braces"] },
  };
  const packages = { [node]: { dev: true }, "node_modules/micromatch": { dev: true } };

  assert.deepEqual(classifyAuditFindings(findings, packages), { exempt: ["braces", "micromatch"], blocking: [] });
  assert.deepEqual(classifyAuditFindings(findings, { ...packages, [node]: { dev: false } }), { exempt: ["micromatch"], blocking: ["braces"] });
});

test("new advisories, unknown packages, and production dependencies fail the audit", () => {
  const findings = {
    braces: { nodes: [node], via: [advisory, { name: "braces", url: "https://github.com/advisories/NEW" }] },
    next: { nodes: ["node_modules/next"], via: ["sharp"] },
    micromatch: { nodes: ["node_modules/micromatch"], via: ["braces"] },
  };
  assert.deepEqual(classifyAuditFindings(findings, {
    [node]: { dev: true }, "node_modules/next": { dev: false }, "node_modules/micromatch": { dev: false },
  }), { exempt: [], blocking: ["braces", "next", "micromatch"] });
});
