import assert from "node:assert/strict";
import test from "node:test";

import { assertDependencyVersions } from "./dependency-versions.mjs";

const manifest = {
  dependencies: { react: "19.2.1", "react-dom": "19.2.1", next: "16.4.0" },
  devDependencies: { "eslint-config-next": "16.4.0" },
};
const lock = {
  packages: {
    "": { dependencies: manifest.dependencies, devDependencies: manifest.devDependencies },
    "node_modules/react": { version: "19.2.1" },
    "node_modules/react-dom": { version: "19.2.1" },
    "node_modules/next": { version: "16.4.0" },
    "node_modules/eslint-config-next": { version: "16.4.0" },
  },
};

test("aligned React and Next dependencies install from their lockfile", () => {
  assert.doesNotThrow(() => assertDependencyVersions(manifest, lock));
});

test("a Dependabot react-dom-only bump fails before installation", () => {
  const update = { ...manifest, dependencies: { ...manifest.dependencies, "react-dom": "19.3.0" } };
  assert.throws(() => assertDependencyVersions(update, lock), /react.*react-dom.*same version/i);
});

test("a lockfile that disagrees with the manifest fails before installation", () => {
  const update = { ...lock, packages: { ...lock.packages, "node_modules/react-dom": { version: "19.3.0" } } };
  assert.throws(() => assertDependencyVersions(manifest, update), /lockfile.*react-dom/i);
});

test("Next and its ESLint config must also be updated together", () => {
  const update = { ...manifest, devDependencies: { "eslint-config-next": "16.3.0" } };
  assert.throws(() => assertDependencyVersions(update, lock), /next.*eslint-config-next.*same version/i);
});
