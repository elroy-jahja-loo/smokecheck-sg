import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextVitals,
  ...nextTypescript,
  {
    ignores: [".next/**", ".test-build/**", ".vercel/**", ".local/**", "out/**", "build/**", "playwright-report/**", "test-results/**", "next-env.d.ts", "sbom.cdx.json"],
  },
];

export default eslintConfig;
