import { featureFlags } from "@/lib/feature-flags";
import { loadInitialMapFeatures } from "@/lib/data/map-features-service";
import { readVectorTileManifest } from "@/lib/vector-tiles/manifest";
import { SearchPageContent } from "./search-page-content";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Search Smoking Areas & No-Smoking Zones in Singapore",
  description:
    "Search any Singapore address, postal code or landmark to check if smoking is allowed there, see nearby no-smoking zones, and find the nearest official NEA designated smoking area with walking directions.",
  alternates: { canonical: "/search" },
};

export default async function SearchPage() {
  const vectorTileManifest = featureFlags.vectorTileMode === "generated" ? await readVectorTileManifest() : undefined;
  const initialMapFeatures = await loadInitialMapFeatures();
  return (
    <SearchPageContent
      vectorTileBaseUrl={featureFlags.vectorTileMode === "generated" ? process.env.VECTOR_TILE_BASE_URL : undefined}
      vectorTileLayerName={vectorTileManifest?.layers[0]}
      initialMapFeatures={initialMapFeatures}
    />
  );
}
