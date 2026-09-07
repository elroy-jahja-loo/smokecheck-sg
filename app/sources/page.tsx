import { getDataSyncStatus } from "@/lib/operations/system-status";
import { SourcesPageContent } from "./sources-page-content";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "SmokeCheck SG Data Sources, Coverage and Limitations",
  description:
    "See the official NEA, Singapore Statutes Online, data.gov.sg and OneMap sources behind SmokeCheck SG, including coverage, freshness and limitations.",
  alternates: { canonical: "/sources" },
  openGraph: {
    type: "article",
    title: "SmokeCheck SG Data Sources, Coverage and Limitations",
    description: "Dataset provenance, freshness, coverage and limitations for SmokeCheck SG.",
    url: "/sources",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "SmokeCheck SG data sources and limitations" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SmokeCheck SG Data Sources, Coverage and Limitations",
    description: "Dataset provenance, freshness, coverage and limitations for SmokeCheck SG.",
    images: ["/og-image.png"],
  },
};

export default async function SourcesPage() {
  const syncStatus = await getDataSyncStatus().catch(() => []);

  return <SourcesPageContent syncStatus={syncStatus} />;
}
