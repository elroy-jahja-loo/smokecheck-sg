import { AppHeader } from "@/components/app-header";
import { PublicFooter } from "@/components/public-footer";
import { OrchardRoadContent } from "@/components/orchard-road-content";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Orchard Road Smoking Areas: Yellow Box DSAs & No-Smoking Zone Rules",
  description:
    "Where are the yellow box smoking areas on Orchard Road? The Orchard Road No-Smoking Zone (since 2019) only allows smoking inside NEA designated smoking areas. Find every yellow box with directions, plus the S$200–S$1,000 fine rules.",
  keywords: [
    "orchard road smoking area",
    "orchard road yellow box",
    "yellow box singapore",
    "orchard road no smoking zone",
    "orchard smoking area",
    "where to smoke orchard road",
    "designated smoking area orchard",
    "smoking area near orchard mrt",
    "singapore smoking area",
    "nea smoking area",
  ],
  alternates: { canonical: "/orchard-road-smoking-areas" },
  openGraph: {
    type: "article",
    title: "Orchard Road Smoking Areas: Yellow Box DSAs & No-Smoking Zone Rules",
    description: "Find Orchard Road yellow-box smoking areas and understand the No-Smoking Zone rules.",
    url: "/orchard-road-smoking-areas",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Orchard Road designated smoking areas guide" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Orchard Road Smoking Areas: Yellow Box DSAs",
    description: "Find Orchard Road yellow-box smoking areas and understand the No-Smoking Zone rules.",
    images: ["/og-image.png"],
  },
};

export default function OrchardRoadSmokingAreasPage() {
  return (
    <main className="page-shell">
      <AppHeader />
      <OrchardRoadContent />
      <PublicFooter />
    </main>
  );
}
