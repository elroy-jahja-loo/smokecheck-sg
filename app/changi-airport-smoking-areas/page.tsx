import { AppHeader } from "@/components/app-header";
import { PublicFooter } from "@/components/public-footer";
import { ChangiAirportContent } from "@/components/changi-airport-content";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Changi Airport Smoking Areas: Smoking Rooms in T1–T4 (2026)",
  description:
    "Where can you smoke at Changi Airport? Designated smoking rooms and terraces in Terminals 1–4, all airside (after security). Landside areas, Jewel and gate rooms are smoke-free. Full guide with rules and fines.",
  keywords: [
    "changi airport smoking area",
    "changi airport smoking room",
    "can you smoke at changi airport",
    "changi terminal 1 smoking area",
    "changi terminal 3 smoking area",
    "changi airport smoking terrace",
    "singapore airport smoking",
    "jewel changi smoking",
  ],
  alternates: { canonical: "/changi-airport-smoking-areas" },
};

export default function ChangiAirportSmokingAreasPage() {
  return (
    <main className="page-shell">
      <AppHeader />
      <ChangiAirportContent />
      <PublicFooter />
    </main>
  );
}
