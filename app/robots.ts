import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://smokecheck-sg.vercel.app";

const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Bytespider",
  "Amazonbot",
  "Applebot-Extended",
  "cohere-ai",
  "Google-Extended",
  "GoogleOther",
  "YouBot",
  "CCBot",
  "meta-externalagent",
  "Diffbot",
];

const DISALLOWED = ["/api/", "/ops/", "/monitoring", "/sentry-example-page", "/sentry-example-api"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: DISALLOWED,
      },
      {
        userAgent: AI_CRAWLERS,
        allow: ["/", "/smoking-areas", "/orchard-road-smoking-areas", "/singapore-smoking-fines", "/changi-airport-smoking-areas", "/rules", "/search", "/sources", "/llms.txt", "/llms-full.txt"],
        disallow: DISALLOWED,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
