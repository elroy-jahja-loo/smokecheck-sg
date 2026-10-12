type AuditFinding = {
  nodes: string[];
  via: Array<string | { url?: string }>;
};

const knownDevOnlyChain: Record<string, string[]> = {
  braces: ["https://github.com/advisories/GHSA-vfj7-8cjw-p6xm"],
  chokidar: ["braces"],
  micromatch: ["braces"],
  "fast-glob": ["micromatch"],
  globby: ["fast-glob"],
  "@next/eslint-plugin-next": ["fast-glob"],
  "eslint-config-next": ["@next/eslint-plugin-next"],
  "tsc-alias": ["chokidar", "globby"],
};

export function classifyAuditFindings(
  findings: Record<string, AuditFinding>,
  packages: Record<string, { dev?: boolean }>,
) {
  const exempt: string[] = [];
  const blocking: string[] = [];

  for (const [name, finding] of Object.entries(findings)) {
    const expected = knownDevOnlyChain[name];
    const actual = finding.via.map((cause) => typeof cause === "string" ? cause : cause.url ?? "");
    const matchesKnownAdvisory = expected?.length === actual.length
      && expected.every((cause) => actual.includes(cause));
    const onlyDevDependencies = finding.nodes.length > 0
      && finding.nodes.every((path) => packages[path]?.dev === true);
    (matchesKnownAdvisory && onlyDevDependencies ? exempt : blocking).push(name);
  }

  return { exempt, blocking };
}
