import { AppHeader } from "@/components/app-header";
import { PublicFooter } from "@/components/public-footer";
import { SmokingFinesContent } from "@/components/smoking-fines-content";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Singapore Smoking Fines 2026: How Much & How to Avoid Them",
  description:
    "Singapore smoking fines explained: S$200–S$1,000 for smoking in prohibited places, S$300+ for cigarette butt littering, up to S$2,000 for vaping. Check any location before you light with the SmokeCheck SG map.",
  keywords: [
    "singapore smoking fine",
    "nea smoking fine",
    "smoking fine singapore 2026",
    "cigarette butt fine singapore",
    "littering fine singapore",
    "vaping fine singapore",
    "smoking penalty singapore",
    "how much is smoking fine in singapore",
    "orchard road smoking fine",
    "bus stop smoking fine",
  ],
  alternates: { canonical: "/singapore-smoking-fines" },
};

export default function SingaporeSmokingFinesPage() {
  return (
    <main className="page-shell">
      <AppHeader />
      <SmokingFinesContent />
      <PublicFooter />
    </main>
  );
}
