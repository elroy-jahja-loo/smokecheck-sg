import { readFile } from "node:fs/promises";
import path from "node:path";

export type VectorTileManifest = {
  format: "mvt-directory";
  generatedAt: string;
  sourcePath: string;
  outputDirectory: string;
  tilePathTemplate: string;
  minZoom: number;
  maxZoom: number;
  bounds: [number, number, number, number];
  layers: string[];
  tileCount: number;
  totalBytes: number;
};

type ManifestInput = {
  generatedAt?: string;
  sourcePath: string;
  outputDirectory: string;
  tilePathTemplate: string;
  minZoom: number;
  maxZoom: number;
  bounds: [number, number, number, number];
  layers: string[];
  tileCount: number;
  totalBytes: number;
};

export function createVectorTileManifest(input: ManifestInput): VectorTileManifest {
  return {
    format: "mvt-directory",
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    sourcePath: input.sourcePath,
    outputDirectory: input.outputDirectory,
    tilePathTemplate: input.tilePathTemplate,
    minZoom: input.minZoom,
    maxZoom: input.maxZoom,
    bounds: input.bounds,
    layers: [...input.layers],
    tileCount: input.tileCount,
    totalBytes: input.totalBytes,
  };
}

export async function readVectorTileManifest(manifestPath = resolveManifestPath()) {
  try {
    const raw = await readFile(manifestPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<VectorTileManifest>;
    if (!isVectorTileManifest(parsed)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export async function getVectorTileRuntimeStatus(env: NodeJS.ProcessEnv = process.env) {
  const baseUrl = env.VECTOR_TILE_BASE_URL?.trim();
  const manifestPath = env.VECTOR_TILE_MANIFEST_PATH?.trim() || resolveManifestPath();
  const manifest = await readVectorTileManifest(manifestPath);
  return {
    baseUrl,
    manifestPath,
    manifest,
    status: baseUrl
      ? (manifest ? "configured_with_manifest" : "configured_without_manifest")
      : (manifest ? "manifest_present_base_url_missing" : "not_configured"),
  } as const;
}

function resolveManifestPath() {
  return path.join(process.cwd(), ".local/vector-tiles/manifest.json");
}

function isVectorTileManifest(value: Partial<VectorTileManifest>): value is VectorTileManifest {
  return value.format === "mvt-directory"
    && typeof value.generatedAt === "string"
    && typeof value.sourcePath === "string"
    && typeof value.outputDirectory === "string"
    && typeof value.tilePathTemplate === "string"
    && Number.isInteger(value.minZoom)
    && Number.isInteger(value.maxZoom)
    && Array.isArray(value.bounds)
    && value.bounds.length === 4
    && Array.isArray(value.layers)
    && Number.isInteger(value.tileCount)
    && Number.isFinite(value.totalBytes ?? NaN);
}
