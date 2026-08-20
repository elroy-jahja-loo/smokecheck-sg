import { featureFlags } from "@/lib/feature-flags";
import { loadInitialMapFeatures } from "@/lib/data/map-features-service";
import { readVectorTileManifest } from "@/lib/vector-tiles/manifest";
import { HomePageContent } from "./home-page-content";

type HomeProps = {
  searchParams: Promise<{ signage?: string; lat?: string; lng?: string; q?: string }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const signageMode = params.signage === "1" || params.signage === "true";
  const vectorTileManifest = featureFlags.vectorTileMode === "generated" ? await readVectorTileManifest() : undefined;
  const initialMapFeatures = await loadInitialMapFeatures();

  return (
    <HomePageContent
      signageMode={signageMode}
      initialQuery={params.q}
      initialLat={params.lat}
      initialLng={params.lng}
      vectorTileBaseUrl={featureFlags.vectorTileMode === "generated" ? process.env.VECTOR_TILE_BASE_URL : undefined}
      vectorTileLayerName={vectorTileManifest?.layers[0]}
      initialMapFeatures={initialMapFeatures}
    />
  );
}
