import { Suspense } from "react";
import { featureFlags } from "@/lib/feature-flags";
import { readVectorTileManifest } from "@/lib/vector-tiles/manifest";
import { HomePageContent } from "./home-page-content";
import { HomePageQuery } from "./home-page-query";

export default async function Home() {
  const vectorTileManifest = featureFlags.vectorTileMode === "generated" ? await readVectorTileManifest() : undefined;
  const mapProps = {
    vectorTileBaseUrl: featureFlags.vectorTileMode === "generated" ? process.env.VECTOR_TILE_BASE_URL : undefined,
    vectorTileLayerName: vectorTileManifest?.layers[0],
  };

  return (
    // Keep the homepage statically rendered, including useful HTML for crawlers.
    // Shared coordinates and signage settings are applied only in the browser.
    <Suspense fallback={<HomePageContent signageMode={false} {...mapProps} />}>
      <HomePageQuery {...mapProps} />
    </Suspense>
  );
}
