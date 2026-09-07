import { AppHeader } from "@/components/app-header";
import { PublicFooter } from "@/components/public-footer";
import { SmokingAreasContent } from "@/components/smoking-areas-content";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Smoking Areas in Singapore: Where You Can & Can't Smoke (2026)",
  description:
    "Where to smoke in Singapore, legally. Official NEA designated smoking areas (DSAs), Orchard Road yellow boxes, community smoking areas, smoking fines (S$200–S$1,000), and the full list of no-smoking zones. Check before you light.",
  keywords: [
    "smoking areas singapore",
    "where to smoke singapore",
    "smoking area singapore",
    "designated smoking area singapore",
    "NEA smoking areas",
    "smoking corner singapore",
    "yellow box orchard road",
    "where to smoke legally singapore",
    "smoke legally singapore",
    "can i smoke in singapore",
    "singapore smoking rules",
    "smoking fine singapore",
    "no smoking zone singapore",
    "orchard road no smoking zone",
    "community smoking areas singapore",
    "smoking prohibition singapore",
  ],
  alternates: { canonical: "/smoking-areas" },
  openGraph: {
    type: "article",
    title: "Smoking Areas in Singapore: Where You Can & Can't Smoke",
    description:
      "Where to smoke legally in Singapore: NEA designated smoking areas, Orchard Road yellow boxes, no-smoking zones and fines.",
    url: "/smoking-areas",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "SmokeCheck SG smoking areas and no-smoking zones map" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Smoking Areas in Singapore: Where You Can & Can't Smoke",
    description: "Find designated smoking areas, no-smoking zones, Orchard yellow boxes and smoking rules.",
    images: ["/og-image.png"],
  },
};

export default function SmokingAreasPage() {
  return (
    <main className="page-shell">
      <AppHeader />
      <SmokingAreasContent />
      <PublicFooter />
    </main>
  );
}
