import Link from "next/link";

const FAQ_ITEMS = [
  {
    question: "How much is the smoking fine in Singapore?",
    answer:
      "Smoking in a prohibited place carries a composition fine typically starting from S$200 and going up to S$1,000 per offence under the Smoking (Prohibition in Certain Places) Act 1992. Repeat offenders and court prosecutions can cost more. Vaping offences carry fines of up to S$2,000.",
  },
  {
    question: "What is the fine for dropping a cigarette butt in Singapore?",
    answer:
      "A cigarette butt is litter. First-time littering offenders can be issued a S$300 composition fine, while court fines go up to S$2,000 for a first conviction, S$4,000 for a second, and S$10,000 for a third or subsequent conviction, plus Corrective Work Orders. Always use the ashtrays provided at smoking areas.",
  },
  {
    question: "Can I be fined for smoking at a bus stop in Singapore?",
    answer:
      "Yes. Bus stops, bus shelters and bus poles — including the area within five metres — are prohibited places. The same composition fines of S$200 to S$1,000 apply. Check SmokeCheck SG for the nearest legal smoking area instead.",
  },
  {
    question: "How do NEA officers issue smoking fines?",
    answer:
      "NEA enforcement officers on patrol can issue on-the-spot composition fines to anyone smoking in a prohibited place, including the Orchard Road No-Smoking Zone outside yellow boxes. You will be asked for identification, and the fine is typically payable online via NEA's e-services.",
  },
  {
    question: "Is there a fine for vaping in Singapore?",
    answer:
      "Yes — up to S$2,000 for the possession or use of e-cigarettes, vaporisers and related components. Vaping is banned outright in Singapore regardless of location, so no smoking-area exemption applies.",
  },
  {
    question: "What is the fine for duty-unpaid cigarettes in Singapore?",
    answer:
      "Buying, selling or possessing duty-unpaid cigarettes (SDPC) is an offence under the Customs Act, with minimum fines from S$500 for a first offence and much higher penalties for larger quantities. Only buy cigarettes from licensed retailers.",
  },
  {
    question: "How can I avoid smoking fines in Singapore?",
    answer:
      "Check the location before you light: open SmokeCheck SG, search the address, and see whether the spot is inside a no-smoking zone and where the nearest official designated smoking area is. Follow on-site signage, smoke only in marked areas, and stub out in the ashtrays provided.",
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
    { "@type": "ListItem", position: 3, name: "Singapore smoking fines" },
  ],
};

export function SmokingFinesContent() {
  return (
    <div className="container stack smoking-areas-page bottom-safe-area">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSON_LD) }} />

      <div className="rules-main stack">
        <div className="rules-main__intro stack-sm">
          <p className="eyebrow">Smoking (Prohibition in Certain Places) Act 1992 — 2026 guide</p>
          <h1 className="section-title">Singapore Smoking Fines: How Much You Could Pay &amp; How to Avoid Them</h1>
          <p className="body-copy">
            One wrong spot can cost more than the whole carton. Singapore&apos;s smoking fines are among the highest in the
            region — S$200 to S$1,000 for lighting up in a prohibited place, plus separate penalties for littering butts and
            vaping. Here is exactly what each offence costs and how to check a location before you light.
          </p>
          <Link href="/" className="live-primary-button">Check a location before you light</Link>
        </div>

        <section className="first-class-card first-class-card--warning">
          <div className="first-class-card__heading">
            <span className="first-class-card__icon" aria-hidden="true">&#x26A0;</span>
            <h2>Singapore smoking fines at a glance (2026)</h2>
          </div>
          <ul className="body-copy">
            <li><strong>Smoking in a prohibited place</strong> (bus stops, linkways, parks, building entrances, Orchard Road outside yellow boxes): S$200 to S$1,000 composition fine per offence</li>
            <li><strong>Cigarette butt littering</strong>: S$300 first-time composition; up to S$2,000 (first), S$4,000 (second), S$10,000 (third or more) in court, plus Corrective Work Orders</li>
            <li><strong>Vaping or possessing an e-cigarette</strong>: up to S$2,000</li>
            <li><strong>Duty-unpaid cigarettes</strong>: minimum S$500 for a first offence, more for larger quantities</li>
            <li><strong>Underage smoking</strong> (under 21 buying, using or possessing tobacco): fines apply under the Tobacco (Control of Advertisements and Sale) Act</li>
          </ul>
          <p className="source-line">Amounts are the commonly cited composition and court figures; exact penalties depend on the offence and offender history.</p>
        </section>

        <section className="first-class-card first-class-card--success">
          <div className="first-class-card__heading">
            <span className="first-class-card__icon" aria-hidden="true">&#x2714;</span>
            <h2>Where you will not get fined</h2>
          </div>
          <ul className="body-copy">
            <li>Inside NEA designated smoking areas (DSAs), including Orchard Road yellow boxes</li>
            <li>Approved smoking corners at food retail establishments and smoking rooms at offices, Changi Airport and entertainment outlets</li>
            <li>Open public spaces outside the Orchard Road No-Smoking Zone, surface carparks, and the uncovered top deck of multi-storey carparks (outside Orchard Road)</li>
            <li>Your own home and private vehicles with windows fully wound up</li>
          </ul>
          <p className="source-line">SmokeCheck SG shows the nearest legal smoking area to any address, with walking directions.</p>
        </section>

        <section className="guidance-card guidance-card--uncertain">
          <div className="stack-sm">
            <h2>What to do if you receive a smoking fine</h2>
            <p className="body-copy">
              Composition fines for smoking can be paid online through NEA&apos;s e-services within the stated period — paying
              early usually avoids further action. If you believe the fine was issued in error, you can appeal to NEA with
              details of the location and circumstances. Keep in mind that smoking fines are issued by NEA enforcement
              officers, and official notices always reference the Smoking (Prohibition in Certain Places) Act. SmokeCheck SG
              does not process or contest fines.
            </p>
          </div>
        </section>

        <section aria-label="Smoking fine frequently asked questions">
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
            <Link href="/changi-airport-smoking-areas">Changi Airport smoking areas</Link>
          </p>
          <p className="source-line">
            <strong>Guidance, not legal advice:</strong> penalties can change and enforcement details vary by case. Follow
            NEA notices and current law.
          </p>
        </section>
      </div>
    </div>
  );
}
