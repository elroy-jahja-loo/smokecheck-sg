import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import rewind from "@mapbox/geojson-rewind";
import geojsonvt from "geojson-vt";
import vtpbf from "vt-pbf";

const sourcePath = process.env.SMOKECHECK_GEOJSON_SOURCE ?? "data/generated/map-features.geojson";
const outDir = process.env.SMOKECHECK_TILE_OUTPUT_DIR ?? ".local/vector-tiles";
const tileRoot = path.join(outDir, "tiles");
const metadataPath = path.join(outDir, "manifest.json");
const minZoom = Number.parseInt(process.env.SMOKECHECK_TILE_MIN_ZOOM ?? "10", 10);
const maxZoom = Number.parseInt(process.env.SMOKECHECK_TILE_MAX_ZOOM ?? "16", 10);
const singaporeBounds = [103.5, 1.1, 104.1, 1.5]; // [minLng, minLat, maxLng, maxLat]

if (!Number.isInteger(minZoom) || !Number.isInteger(maxZoom) || minZoom < 0 || maxZoom > 20 || minZoom > maxZoom) {
  throw new Error("Invalid tile zoom range. Expected integers where 0 <= minZoom <= maxZoom <= 20.");
}

const raw = await readFile(sourcePath, "utf8");
const geojson = JSON.parse(raw);
if (geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
  throw new Error("Expected a GeoJSON FeatureCollection for vector tile generation.");
}

const communitySourcePath = process.env.SMOKECHECK_COMMUNITY_GEOJSON_SOURCE?.trim();
if (communitySourcePath) {
  const communityRaw = await readFile(communitySourcePath, "utf8");
  const communityGeojson = JSON.parse(communityRaw);
  if (communityGeojson.type !== "FeatureCollection" || !Array.isArray(communityGeojson.features)) {
    throw new Error(`Expected a GeoJSON FeatureCollection for ${communitySourcePath}.`);
  }
  geojson.features.push(...communityGeojson.features);
}

await mkdir(outDir, { recursive: true });

const sanitized = toTileSourceGeoJson(geojson);
const tileIndex = geojsonvt(rewind(sanitized, true), {
  maxZoom,
  indexMaxZoom: maxZoom,
  indexMaxPoints: 0,
  tolerance: 3,
  buffer: 64,
  extent: 4096,
  lineMetrics: false,
  promoteId: "id",
});

let tileCount = 0;
let totalBytes = 0;
for (let z = minZoom; z <= maxZoom; z += 1) {
  const [minX, minY] = lngLatToTile(singaporeBounds[0], singaporeBounds[3], z);
  const [maxX, maxY] = lngLatToTile(singaporeBounds[2], singaporeBounds[1], z);
  for (let x = Math.max(0, minX); x <= maxX; x += 1) {
    for (let y = Math.max(0, minY); y <= maxY; y += 1) {
      const tile = tileIndex.getTile(z, x, y);
      const layerName = "smokecheck_features";
      const pbf = Buffer.from(vtpbf.fromGeojsonVt({ [layerName]: tile ?? { features: [] } }, {
        version: 2,
        extent: 4096,
      }));

      const targetDir = path.join(tileRoot, String(z), String(x));
      await mkdir(targetDir, { recursive: true });
      await writeFile(path.join(targetDir, `${y}.mvt`), pbf);

      tileCount += 1;
      totalBytes += pbf.byteLength;
    }
  }
}

const manifest = {
  format: "mvt-directory",
  generatedAt: new Date().toISOString(),
  sourcePath,
  outputDirectory: outDir,
  tilePathTemplate: "./tiles/{z}/{x}/{y}.mvt",
  minZoom,
  maxZoom,
  bounds: [103.5, 1.1, 104.1, 1.5],
  layers: ["smokecheck_features"],
  featureCount: geojson.features.length,
  tileCount,
  totalBytes,
  note: "MVT directory generated with geojson-vt + vt-pbf. For larger datasets use Tippecanoe PMTiles pipeline as primary production path.",
  ...(communitySourcePath ? { communitySourcePath } : {}),
};
await writeFile(metadataPath, JSON.stringify(manifest, null, 2));

console.log(JSON.stringify({
  outDir,
  tileCount,
  totalBytes,
  minZoom,
  maxZoom,
  featureCount: geojson.features.length,
  metadataPath,
}, null, 2));

function toTileSourceGeoJson(input) {
  return {
    type: "FeatureCollection",
    features: input.features
      .filter((feature) => feature && feature.type === "Feature" && feature.geometry)
      .map((feature, index) => ({
        type: "Feature",
        id: feature.id ?? `${feature.properties?.kind ?? "feature"}-${index}`,
        properties: {
          id: String(feature.id ?? `${feature.properties?.kind ?? "feature"}-${index}`),
          kind: String(feature.properties?.kind ?? "unknown"),
          name: String(feature.properties?.name ?? "Unnamed feature"),
          sourceId: String(feature.properties?.sourceId ?? "unknown"),
          zoneType: feature.properties?.zoneType ? String(feature.properties.zoneType) : undefined,
        },
        geometry: feature.geometry,
      })),
  };
}

function lngLatToTile(lng, lat, zoom) {
  const latClamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const n = 2 ** zoom;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (latClamped * Math.PI) / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + (1 / Math.cos(latRad))) / Math.PI) / 2 * n);
  return [x, y];
}
