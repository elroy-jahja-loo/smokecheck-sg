import { AppHeader } from "@/components/app-header";
import { PublicFooter } from "@/components/public-footer";
import { RulesContent } from "@/components/rules-content";
import { globalDisclaimer, ruleFaqSections, sourceMetadata } from "@/data/prototype-data";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Singapore Smoking Rules: Where You Can & Can't Smoke",
  description:
    "Singapore smoking rules explained simply: where smoking is banned (bus stops, linkways, parks, Orchard Road No-Smoking Zone), where it's allowed (designated smoking areas, smoking corners, open spaces), and the fines if you get it wrong.",
  keywords: [
    "singapore smoking rules",
    "smoking prohibition singapore",
    "where can i smoke singapore",
    "can you smoke in singapore",
    "no smoking zone singapore",
    "singapore smoking law",
    "nea smoking rules",
  ],
  alternates: { canonical: "/rules" },
};

export default function RulesPage() {
  return (
    <main className="page-shell">
      <AppHeader />
      <div className="container stack rules-page bottom-safe-area">
        <RulesContent sections={ruleFaqSections} sources={sourceMetadata} disclaimer={globalDisclaimer} />
      </div>
      <PublicFooter />
    </main>
  );
}
