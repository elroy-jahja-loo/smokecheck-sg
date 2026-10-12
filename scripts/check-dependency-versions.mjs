import { readFileSync } from "node:fs";

import { assertDependencyVersions } from "./dependency-versions.mjs";

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));

assertDependencyVersions(manifest, lock);
console.log("React and Next dependency versions match the committed lockfile.");
