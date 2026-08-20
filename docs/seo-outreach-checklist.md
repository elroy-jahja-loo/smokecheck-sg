# SmokeCheck SG — SEO launch checklist & outreach templates

Post-launch actions to help `smokecheck-sg.vercel.app` rank #1 for smoking-area queries.

## 1. Verify indexing (do this right after deploy)

- [ ] Open `https://smokecheck-sg.vercel.app/robots.txt` — confirm all AI crawlers + Google are allowed
- [ ] Open `https://smokecheck-sg.vercel.app/sitemap.xml` — confirm all 8 pages listed
- [ ] Open `https://smokecheck-sg.vercel.app/llms.txt` — confirm AI-reader file served
- [ ] Open `https://smokecheck-sg.vercel.app/llms-full.txt` — confirm full FAQ corpus served
- [ ] Google Search Console → add property (domain or URL prefix) → submit `/sitemap.xml` → use "URL Inspection" to request indexing for `/`, `/smoking-areas`, `/orchard-road-smoking-areas`, `/singapore-smoking-fines`, `/changi-airport-smoking-areas`
- [ ] Bing Webmaster Tools → import from Search Console (one click) → submit sitemap
- [ ] Check `https://smokecheck-sg.vercel.app/og-image.png` renders on Twitter/WhatsApp card validators (opengraph.xyz / card validator)

## 2. Structured-data checks

- [ ] Google Rich Results Test on `/smoking-areas` → FAQPage should validate (rich result = FAQ dropdown in Google)
- [ ] Same test on `/orchard-road-smoking-areas`, `/singapore-smoking-fines`, `/changi-airport-smoking-areas`
- [ ] Homepage should show WebSite + WebApplication JSON-LD in "View Source"

## 3. Community outreach templates

Rules for posting: genuinely help first, mention the site once, never spam. Only post where self-promotion is tolerated (r/askSingapore allows relevant resources in replies; HWZ has a "websites" thread; Quora allows links in detailed answers).

### Reddit r/askSingapore — reply template

When someone asks "where can I smoke in Singapore" or "can I smoke at a bus stop":

> Quick rules recap: no smoking within 5m of bus stops/shelters, on covered linkways, in parks/beaches, near building entrances, and the whole Orchard Road stretch is a no-smoking zone except the yellow boxes (S$200–S$1,000 fine). Allowed: NEA designated smoking areas, smoking corners at hawker centres with the approved sign, open spaces outside Orchard Road, and private vehicles with windows up.
>
> I built a free map for exactly this — you search any address and it shows no-smoking zones + the nearest legal smoking area with walking directions: smokecheck-sg.vercel.app (not affiliated with NEA; always follow the physical signs).

### HardwareZone forum — new thread or reply

Title ideas:
- "Interactive map of NEA designated smoking areas (DSAs) + no-smoking zones"
- "Orchard Road yellow boxes: all DSA locations on one map"

Body: same facts as the Reddit reply, plus "I made this to stop myself getting fined — happy to add missing spots, there's a community-add button."

### Quora — answer "Where can you smoke in Singapore?"

Write the full answer (use `/smoking-areas` content), include the map link once at the end. Quora answers rank well on Google for exactly these questions.

### Telegram/WhatsApp groups (expat SG, smokers' groups)

Short pitch:
> Free SG map that shows where smoking is banned + nearest official smoking area (incl. Orchard yellow boxes): smokecheck-sg.vercel.app — check before you light, skip the $200 fine.

### Google Maps alternative

Also post a "no-smoking zone / smoking area" spot list once the map has verified entries. Google Maps reviews/place listings rank highly for "smoking area near me" style queries.

## 4. Backlink targets (quality over quantity)

- [ ] r/askSingapore & r/Singapore wiki/FAQs (message mods)
- [ ] HardwareZone (SG's biggest forum)
- [ ] Quora answers (10+ questions on smoking rules)
- [ ] Local blogs: thesmartlocal, sethlui, mothership comment sections when smoking-fine stories run
- [ ] Reddit r/TravelSingapore — "Can I smoke in Singapore?" threads appear weekly
- [ ] Product Hunt / AlternativeTo listings ("alternatives to getsmokespot.app")

## 5. Content refresh cadence

- Re-verify NEA overview page monthly (it changes: last update was 18 Aug 2026) and update the facts sections
- Re-publish `llms-full.txt` whenever FAQ content changes
- Every new community-reported area = fresh indexable data; encourage adds via the map's community button

## 6. Honest expectations

- Google: expect movement in 2–6 weeks after indexing; #1 for long-tails ("changi airport smoking rooms", "orchard road yellow box map") first, then head terms
- AI search (ChatGPT/Perplexity/DeepSeek): llms.txt + FAQPage + clear facts help citations appear quickly after crawlers fetch the site
- Nothing beats real usage + links — the outreach above is the multiplier
