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
