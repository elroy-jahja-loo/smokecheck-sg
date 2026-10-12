const pairedPackages = [
  ["react", "react-dom"],
  ["next", "eslint-config-next"],
];

export function assertDependencyVersions(manifest, lock) {
  for (const [runtime, companion] of pairedPackages) {
    const runtimeVersion = manifest.dependencies?.[runtime];
    const companionVersion = manifest.dependencies?.[companion] ?? manifest.devDependencies?.[companion];
    if (!runtimeVersion || runtimeVersion !== companionVersion) {
      throw new Error(`${runtime} and ${companion} must use the same version; update them together.`);
    }

    for (const [name, version] of [[runtime, runtimeVersion], [companion, companionVersion]]) {
      if (!/^\d+\.\d+\.\d+$/.test(version)) {
        throw new Error(`${name} must use a pinned version to keep installs reproducible.`);
      }
      const dependencyType = manifest.dependencies?.[name] ? "dependencies" : "devDependencies";
      if (lock.packages?.[""]?.[dependencyType]?.[name] !== version
          || lock.packages?.[`node_modules/${name}`]?.version !== version) {
        throw new Error(`lockfile version for ${name} does not match package.json; run npm install and commit the lockfile.`);
      }
    }
  }
}
