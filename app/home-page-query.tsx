"use client";

import { useSearchParams } from "next/navigation";
import { HomePageContent } from "./home-page-content";

export function HomePageQuery(props: { vectorTileBaseUrl?: string; vectorTileLayerName?: string }) {
  const params = useSearchParams();
  const signage = params.get("signage");

  return (
    <HomePageContent
      {...props}
      signageMode={signage === "1" || signage === "true"}
      initialQuery={params.get("q") ?? undefined}
      initialLat={params.get("lat") ?? undefined}
      initialLng={params.get("lng") ?? undefined}
    />
  );
}
