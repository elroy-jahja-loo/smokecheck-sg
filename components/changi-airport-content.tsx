import Link from "next/link";

const FAQ_ITEMS = [
  {
    question: "Can you smoke at Changi Airport?",
    answer:
      "Yes — but only inside the designated smoking rooms and outdoor smoking terraces located in the transit (airside) areas of Terminals 1, 2, 3 and 4. All other areas of Changi Airport, including arrival halls, departure check-in areas and landside zones, are smoke-free.",
  },
  {
    question: "Where are the smoking rooms in Changi Airport?",
    answer:
      "Each terminal has dedicated smoking rooms and lounges inside the airside transit area, positioned near the transit concourses and open 24 hours for departing and transferring passengers. Follow the 'Smoking Room' signage after security, or check the SmokeCheck SG map before you fly.",
  },
  {
    question: "Can you smoke before check-in at Changi Airport?",
    answer:
      "No. There are no smoking areas before security on the landside. The smoking rooms and terraces are all located after immigration and security screening, inside the transit area.",
  },
  {
    question: "Can you vape at Changi Airport?",
    answer:
      "No. Vaping is illegal throughout Singapore, including at Changi Airport, and e-cigarettes cannot be brought into or through the country. Tobacco smoking is only permitted inside the designated smoking rooms.",
  },
  {
    question: "Are Changi Airport smoking rooms free?",
    answer:
      "Yes. The smoking rooms and outdoor smoking terraces are free for passengers. Some premium lounges also have their own smoking facilities for eligible guests.",
  },
];

const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: { "@type": "Answer", text: item.answer },
  })),
};

const BREADCRUMB_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://smokecheck-sg.vercel.app/" },
    { "@type": "ListItem", position: 2, name: "Smoking areas in Singapore", item: "https://smokecheck-sg.vercel.app/smoking-areas" },
    { "@type": "ListItem", position: 3, name: "Changi Airport smoking areas" },
  ],
};

export function ChangiAirportContent() {
  return (
    <div className="container stack smoking-areas-page bottom-safe-area">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSON_LD) }} />

      <div className="rules-main stack">
        <div className="rules-main__intro stack-sm">
          <p className="eyebrow">Singapore Changi Airport (SIN) — smoking guide 2026</p>
          <h1 className="section-title">Changi Airport Smoking Areas: Where You Can Smoke in T1&ndash;T4</h1>
          <p className="body-copy">
            Changi is one of the world&apos;s best airports — and one of the strictest about where you can light up. Smoking
            is only allowed inside the designated smoking rooms and outdoor garden terraces in the transit areas of all four
            terminals. Here is everything you need to know before your flight.
          </p>
          <Link href="/?q=Changi%20Airport" className="live-primary-button">Check Changi Airport on the map</Link>
        </div>

        <section className="first-class-card first-class-card--success">
          <div className="first-class-card__heading">
            <span className="first-class-card__icon" aria-hidden="true">&#x2714;</span>
            <h2>Where you CAN smoke at Changi</h2>
          </div>
          <ul className="body-copy">
            <li><strong>Terminal 1:</strong> smoking rooms in the transit area, including near the transit concourse</li>
            <li><strong>Terminal 2:</strong> smoking rooms and a terrace in the transit area</li>
            <li><strong>Terminal 3:</strong> smoking rooms in the transit area, including an outdoor terrace with garden views</li>
            <li><strong>Terminal 4:</strong> smoking rooms inside the airside departure zone</li>
            <li>All rooms are open around the clock, free to use, and fitted with ashtrays</li>
          </ul>
          <p className="source-line">Rooms are located airside (after security). Look for the &#x1F6AC; smoking-room signage in each terminal.</p>
        </section>

        <section className="first-class-card first-class-card--warning">
          <div className="first-class-card__heading">
            <span className="first-class-card__icon" aria-hidden="true">&#x26A0;</span>
            <h2>Where smoking is banned at Changi</h2>
          </div>
          <ul className="body-copy">
            <li>All landside areas — check-in halls, arrival halls and terminal forecourts</li>
            <li>Gate hold rooms, boarding bridges, restaurants, lounges without smoking facilities and all restrooms</li>
            <li>Jewel Changi Airport and its carparks</li>
            <li>Anywhere outside a marked smoking room — fines of S$200 to S$1,000 apply</li>
          </ul>
          <p className="source-line">Changi Beach is also a smoke-free recreational beach under NEA rules — not an alternative.</p>
        </section>

        <section className="guidance-card guidance-card--allowed">
          <div className="stack-sm">
            <h2>Before you fly: cigarette rules for travellers</h2>
            <p className="body-copy">
              Singapore has no duty-free concession for cigarettes. Every cigarette brought into the country must be declared
              and duty-paid, and duty-unpaid cigarettes carry minimum fines from S$500. E-cigarettes and vaporisers are
              completely prohibited. Smoke only in the airport&apos;s marked smoking rooms, and always check the local rules
              at your destination with SmokeCheck SG before you light.
            </p>
          </div>
        </section>

        <section aria-label="Changi Airport smoking frequently asked questions">
          <h2 className="section-title">Frequently asked questions</h2>
          <div className="stack-sm">
            {FAQ_ITEMS.map((item) => (
              <details key={item.question} className="accordion-card">
                <summary>
                  <span>{item.question}</span>
                  <span className="rules-accordion-arrow" aria-hidden="true">&#8964;</span>
                </summary>
                <div className="accordion-content">
                  <p className="body-copy">{item.answer}</p>
                </div>
              </details>
            ))}
          </div>
        </section>

        <section className="home-source-trust" aria-label="Related guides">
          <p className="source-line">
            <strong>Related:</strong> <Link href="/smoking-areas">All smoking areas in Singapore</Link> &middot;{" "}
            <Link href="/orchard-road-smoking-areas">Orchard Road yellow boxes</Link> &middot;{" "}
            <Link href="/singapore-smoking-fines">Singapore smoking fines</Link>
          </p>
          <p className="source-line">
            <strong>Guidance, not legal advice:</strong> terminal layouts change — always follow the latest on-site signage
            and Changi Airport staff instructions.
          </p>
        </section>
      </div>
    </div>
  );
}
