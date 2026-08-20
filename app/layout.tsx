import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AccessibilityControls } from "@/components/accessibility-controls";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { SkipToContent } from "@/components/skip-link";
import { I18nProvider } from "@/lib/i18n/i18n-provider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://smokecheck-sg.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "SmokeCheck SG — Smoking Areas in Singapore: Where You Can & Can't Smoke",
    template: "%s | SmokeCheck SG",
  },
  description:
    "Find smoking areas and no-smoking zones anywhere in Singapore. SmokeCheck SG maps official NEA designated smoking areas (DSA), Orchard Road yellow boxes, community-reported spots, smoking rules and fines — so you know where you can and can't smoke before you light.",
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
    "keep singapore clean",
    "cigarette litter singapore",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_SG",
    url: SITE_URL,
    siteName: "SmokeCheck SG",
    title: "SmokeCheck SG — Smoking Areas in Singapore: Where You Can & Can't Smoke",
    description:
      "Check where you can and can't smoke anywhere in Singapore. Official NEA designated smoking areas, Orchard Road yellow boxes, community-reported spots, rules and fines on one map.",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "SmokeCheck SG — Clean city. Clear conscience. Check first. Smoking areas and no-smoking zones map for Singapore" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SmokeCheck SG — Smoking Areas in Singapore: Where You Can & Can't Smoke",
    description:
      "Check where you can and can't smoke anywhere in Singapore. Official NEA designated smoking areas, yellow boxes, community spots, rules and fines on one map.",
    images: ["/og-image.png"],
  },
  manifest: "/manifest.json",
  icons: { icon: "/icon.svg" },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

const SITE_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${process.env.NEXT_PUBLIC_APP_URL || "https://smokecheck-sg.vercel.app"}/#website`,
      url: process.env.NEXT_PUBLIC_APP_URL || "https://smokecheck-sg.vercel.app",
      name: "SmokeCheck SG",
      description:
        "SmokeCheck SG is a free Singapore smoking-rules checker: find where you can and can't smoke, official NEA designated smoking areas, Orchard Road yellow boxes, community smoking areas, and smoking fines.",
      inLanguage: "en-SG",
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${process.env.NEXT_PUBLIC_APP_URL || "https://smokecheck-sg.vercel.app"}/search?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "WebApplication",
      name: "SmokeCheck SG",
      url: process.env.NEXT_PUBLIC_APP_URL || "https://smokecheck-sg.vercel.app",
      applicationCategory: "TravelApplication",
      operatingSystem: "Web",
      browserRequirements: "Requires JavaScript",
      inLanguage: ["en", "zh", "ms", "ta"],
      description:
        "Check smoking rules for any location in Singapore and find the nearest designated smoking area with walking directions. Maps official NEA DSA data, Orchard Road No-Smoking Zone yellow boxes, and community-reported smoking areas.",
      featureList: [
        "Smoking rules checker for any Singapore address",
        "Official NEA designated smoking areas (DSA) map",
        "Orchard Road yellow box locations",
        "Community-added smoking areas",
        "Walking directions to smoking areas",
        "Singapore smoking fines guide",
      ],
      offers: { "@type": "Offer", price: "0", priceCurrency: "SGD" },
    },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-SG" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://www.onemap.gov.sg" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://www.onemap.gov.sg" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(SITE_JSON_LD) }} />
      </head>
      <body className={inter.className}>
        <I18nProvider>
          <SkipToContent />
          <div id="main-content" tabIndex={-1}>
            {children}
          </div>
          <AccessibilityControls />
          <ServiceWorkerRegistration />
        </I18nProvider>
      </body>
    </html>
  );
}
