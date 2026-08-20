import { cacheAdapter } from "@/lib/cache/cache-adapter";
import { geospatialRepository, SeedGeospatialRepository, type MapFeature, type MapFeatureBbox } from "@/lib/data/geospatial-repository";
import { buildViewportBbox, defaultCenter } from "@/lib/geospatial/viewport-bbox";

export type MapFeaturesLoadResult = {
  features: MapFeature[];
  cacheHit: boolean;
  degraded: boolean;
  cacheKey: string;
};

function mapFeaturesCacheKey(bbox: MapFeatureBbox) {
  return `viewport:v1:${bbox.minLat.toFixed(4)}:${bbox.minLng.toFixed(4)}:${bbox.maxLat.toFixed(4)}:${bbox.maxLng.toFixed(4)}:${bbox.zoom}`;
}

export async function loadMapFeaturesInView(bbox: MapFeatureBbox): Promise<MapFeaturesLoadResult> {
  const cacheKey = mapFeaturesCacheKey(bbox);
  const staleCacheKey = `${cacheKey}:stale`;
  const cached = await cacheAdapter.get<MapFeature[]>(cacheKey);
  if (cached) {
    return { features: cached, cacheHit: true, degraded: false, cacheKey };
  }

  let degraded = false;
  let features: MapFeature[];
  try {
    features = geospatialRepository.listMapFeaturesInView
      ? await geospatialRepository.listMapFeaturesInView(bbox)
      : [];
  } catch {
    degraded = true;
    features = await cacheAdapter.get<MapFeature[]>(staleCacheKey)
      ?? await new SeedGeospatialRepository().listMapFeaturesInView(bbox);
  }
  await cacheAdapter.set(cacheKey, features, { ttlSeconds: 15 * 60 });
  if (!degraded) await cacheAdapter.set(staleCacheKey, features, { ttlSeconds: 24 * 60 * 60 });
  return { features, cacheHit: false, degraded, cacheKey };
}

function buildInitialViewportBbox() {
  return buildViewportBbox(defaultCenter);
}

export async function loadInitialMapFeatures() {
  try {
    return (await loadMapFeaturesInView(buildInitialViewportBbox())).features;
  } catch {
    return [];
  }
}
