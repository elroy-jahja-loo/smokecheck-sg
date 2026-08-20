import Link from "next/link";

const FAQ_ITEMS = [
  {
    question: "Where are the yellow box smoking areas on Orchard Road?",
    answer:
      "The yellow boxes are the designated smoking areas (DSAs) placed at regular intervals along the Orchard Road No-Smoking Zone, which stretches from Tanglin Mall to Concorde Hotel. Each box is painted yellow with 'Smoking Area' signage and an ashtray. Open the SmokeCheck SG map, search 'Orchard Road', and every DSA is shown so you can walk to the nearest one.",
  },
  {
    question: "What is the Orchard Road No-Smoking Zone?",
    answer:
      "Since 1 January 2019, the entire Orchard Road precinct has been Singapore's first No-Smoking Zone. From Tanglin Mall to Concorde Hotel, smoking is banned in all public areas — covered walkways, shop fronts, open squares, carparks and bus stops — except inside the marked yellow-box DSAs.",
  },
  {
    question: "Can you smoke outside malls on Orchard Road?",
    answer:
      "No. Even on the pavement outside ION Orchard, Ngee Ann City, Paragon or Plaza Singapura, smoking is not allowed unless you are standing inside a yellow-box DSA. Mall staff and NEA officers can direct you to the nearest box, or you can find it on SmokeCheck SG.",
  },
  {
    question: "How much is the fine for smoking on Orchard Road outside a yellow box?",
    answer:
      "Smoking anywhere in the Orchard Road No-Smoking Zone outside a yellow-box DSA is an offence with a composition fine typically starting from S$200 and going up to S$1,000 per offence. Enforcement is active — check the map before you light.",
  },
  {
    question: "Can I smoke in a carpark on Orchard Road?",
    answer:
      "No. Unlike other parts of Singapore, where the top deck of multi-storey carparks and surface carparks are generally not prohibited, carparks inside the Orchard Road No-Smoking Zone are covered by the ban. Use a yellow-box DSA instead.",
  },
  {
    question: "Are the Orchard Road yellow boxes free?",
    answer:
      "Yes. All NEA yellow-box DSAs along Orchard Road are free and open to the public, with ashtrays provided. Keep butts in the ashtray — littering on Orchard Road is an additional offence.",
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
    { "@type": "ListItem", position: 3, name: "Orchard Road yellow boxes" },
  ],
};

export function OrchardRoadContent() {
  return (
    <div className="container stack smoking-areas-page bottom-safe-area">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSON_LD) }} />

      <div className="rules-main stack">
        <div className="rules-main__intro stack-sm">
          <p className="eyebrow">Orchard Road No-Smoking Zone — since January 2019</p>
          <h1 className="section-title">Orchard Road Smoking Areas: The Yellow Boxes Explained</h1>
          <p className="body-copy">
            Singapore&apos;s most famous shopping street is also its strictest No-Smoking Zone. From Tanglin Mall to Concorde
            Hotel, smoking is banned everywhere in public — except inside the yellow-box designated smoking areas (DSAs) that
            NEA places at regular intervals along the stretch. This guide explains exactly how the zone works and how to find
            the nearest yellow box fast.
          </p>
          <Link href="/?q=Orchard%20Road" className="live-primary-button">Find Orchard Road yellow boxes on the map</Link>
        </div>

        <section className="first-class-card first-class-card--success">
          <div className="first-class-card__heading">
            <span className="first-class-card__icon" aria-hidden="true">&#x2714;</span>
            <h2>How the Orchard Road yellow boxes work</h2>
          </div>
          <ul className="body-copy">
            <li>The No-Smoking Zone covers the Orchard Road precinct from Tanglin Mall to Concorde Hotel</li>
            <li>Dozens of yellow-box DSAs sit at regular intervals along the pedestrian stretch, near major malls and MRT exits</li>
            <li>Each box is painted yellow, marked with smoking-area signage, and fitted with an ashtray</li>
            <li>Smoking is only legal while you are inside the box — stepping out, even one metre, puts you back in a no-smoking area</li>
            <li>Bus stops, covered walkways, shop fronts, open squares and carparks inside the zone are all smoke-free</li>
          </ul>
        </section>

        <section className="first-class-card first-class-card--warning">
          <div className="first-class-card__heading">
            <span className="first-class-card__icon" aria-hidden="true">&#x26A0;</span>
            <h2>What you can&apos;t do in the zone</h2>
          </div>
          <ul className="body-copy">
            <li>Smoke anywhere outside a yellow box, including pavements in front of ION Orchard, Ngee Ann City, Paragon, Wisma Atria and Plaza Singapura</li>
            <li>Smoke in carparks, at bus stops, on covered linkways, or within five metres of building entrances</li>
            <li>Vape or use e-cigarettes anywhere in Singapore — including inside the boxes</li>
            <li>Drop cigarette butts outside the ashtrays — that is a separate littering offence</li>
          </ul>
          <p className="source-line">Composition fines for smoking in the zone run from S$200 up to S$1,000 per offence. NEA officers patrol regularly.</p>
        </section>

        <section className="guidance-card guidance-card--designated">
          <div className="stack-sm">
            <h2>How to find the nearest yellow box</h2>
            <p className="body-copy">
              Open SmokeCheck SG on your phone, search &quot;Orchard Road&quot;, and every official DSA in the zone appears on
              the map as a green marker. Tap one for walking directions from wherever you are. Planning a trip along the
              stretch? The boxes are spaced so you are never more than a short walk from one.
            </p>
            <Link href="/?q=Orchard%20Road" className="source-line">Open the map <span aria-hidden="true">&rarr;</span></Link>
          </div>
        </section>

        <section aria-label="Orchard Road smoking area frequently asked questions">
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
            <Link href="/singapore-smoking-fines">Singapore smoking fines</Link> &middot;{" "}
            <Link href="/changi-airport-smoking-areas">Changi Airport smoking areas</Link>
          </p>
          <p className="source-line">
            <strong>Guidance, not legal advice:</strong> smoke only inside marked yellow boxes and follow NEA instructions.
            Sources: NEA Orchard Road No-Smoking Zone guidance and the Smoking (Prohibition in Certain Places) Act 1992.
          </p>
        </section>
      </div>
    </div>
  );
}
