import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

test("SBOM preserves patched overrides, dependency edges and every runtime dependency", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  assert.match(manifest.scripts.sbom, /--package-lock-only/);
  assert.doesNotMatch(manifest.scripts.sbom, /--omit/);

  const output = execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", [
    "sbom", "--package-lock-only", "--sbom-format=cyclonedx",
  ], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const bom = JSON.parse(output);
  assert.equal(bom.bomFormat, "CycloneDX");

  function componentAt(path) {
    const component = bom.components.find((item) => item.properties?.some((property) =>
      property.name === "cdx:npm:package:path" && property.value === path));
    assert.ok(component, `Missing component: ${path}`);
    assert.equal(component.version, lock.packages[path].version);
    return component;
  }

  const bundler = componentAt("node_modules/@sentry/bundler-plugins");
  const glob = componentAt("node_modules/glob");
  const root = bom.dependencies.find((item) => item.ref === bom.metadata.component["bom-ref"]);
  for (const name of Object.keys(manifest.dependencies)) {
    const component = componentAt(`node_modules/${name}`);
    assert.ok(root?.dependsOn.includes(component["bom-ref"]), `Missing runtime dependency edge: ${name}`);
  }
  assert.ok(bom.dependencies.find((item) => item.ref === bundler["bom-ref"])?.dependsOn.includes(glob["bom-ref"]));
  componentAt("node_modules/eslint-config-next");
});
