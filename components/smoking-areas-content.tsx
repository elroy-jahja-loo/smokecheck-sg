import Link from "next/link";

const FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: "Where can I smoke in Singapore?",
    answer:
      "You can smoke in approved smoking corners at food retail establishments, smoking rooms at offices, Changi Airport and entertainment outlets, and designated smoking areas (DSAs) such as the yellow boxes along Orchard Road. Smoking is also allowed in your own home, in private vehicles with windows fully wound up, and in most open public spaces outside the Orchard Road No-Smoking Zone. Use the SmokeCheck SG map to check any address and see the nearest official smoking area.",
  },
  {
    question: "Where can I smoke cigarettes legally in Singapore?",
    answer:
      "Legally, cigarettes may be smoked in NEA-designated smoking areas, approved smoking corners and smoking rooms, and open outdoor spaces that are not covered by the Smoking (Prohibition in Certain Places) Regulations — for example open spaces in residential estates and town centres, surface carparks, uncovered walkways, and the top deck of multi-storey carparks (all outside Orchard Road). Always check for on-site signage and 'no smoking' markings first.",
  },
  {
    question: "What is a designated smoking area (DSA) in Singapore?",
    answer:
      "A designated smoking area (DSA) is a clearly marked spot where smoking is allowed even though the surrounding area is smoke-free. The most well-known DSAs are the yellow boxes along the Orchard Road No-Smoking Zone. DSAs also exist within university compounds, JTC-managed parks, and certain MINDEF premises. NEA publishes official DSA locations as open data on data.gov.sg, which SmokeCheck SG plots on its map.",
  },
  {
    question: "Where are the yellow boxes on Orchard Road?",
    answer:
      "The yellow boxes are the designated smoking areas (DSAs) inside the Orchard Road No-Smoking Zone, which has covered the Orchard Road precinct since January 2019. On the entire stretch, smoking is only allowed inside these marked yellow boxes. Open SmokeCheck SG, search 'Orchard Road', and every official DSA in the precinct appears on the map with walking directions.",
  },
  {
    question: "Can you smoke on the street in Singapore?",
    answer:
      "It depends where. Smoking is banned at bus stops and within five metres of them, covered linkways, pedestrian overhead bridges, covered or underground walkways, areas within five metres of building entrances and ventilation intakes, queue areas, and the entire Orchard Road No-Smoking Zone outside yellow boxes. Open, unsheltered streets outside these places are generally not prohibited, but many precincts have additional rules — check SmokeCheck SG and the signs around you before lighting up.",
  },
  {
    question: "Where is smoking banned in Singapore?",
    answer:
      "Smoking is banned in most indoor places and public service vehicles, at bus stops and bus shelters (plus five metres around them), covered linkways, playgrounds, parks and gardens under NParks, nature reserves, reservoirs and ABC Waters sites, recreational beaches, swimming pools (plus five metres around them), hospitals, schools (plus five metres around their compounds), community buildings, sports stadia, pedestrian bridges, covered walkways, washrooms, ferry terminals, designated queue areas, and within five metres of building entrances, windows and ventilation intakes — plus the Orchard Road No-Smoking Zone outside yellow boxes.",
  },
  {
    question: "Can I smoke at Changi Airport?",
    answer:
      "Yes, but only inside the designated smoking rooms and smoking lounges in the transit areas of each terminal. Smoking is not allowed elsewhere in the airport terminals. SmokeCheck SG shows airport-area rules and nearby smoking facilities where data is available.",
  },
  {
    question: "How much is the smoking fine in Singapore?",
    answer:
      "Smoking in a prohibited place is an offence under the Smoking (Prohibition in Certain Places) Act 1992. Composition fines typically range from S$200 up to S$1,000 per offence, and penalties can be higher for repeat offenders or court prosecution. Vaping offences under the Tobacco (Control of Advertisements and Sale) Act carry fines of up to S$2,000. Use SmokeCheck SG to check a spot before you light so you never have to find out the hard way.",
  },
  {
    question: "Is vaping allowed in Singapore?",
    answer:
      "No. The purchase, use and possession of e-cigarettes, vapes and vaporisers is illegal in Singapore, with fines of up to S$2,000 for use or possession. Smoking prohibition rules apply to tobacco smoking; vaping is banned outright.",
  },
  {
    question: "Where can I find a smoking area near me?",
    answer:
      "Open SmokeCheck SG on your phone, allow location access or search your current address, and the map shows every nearby official designated smoking area, plus community-added smoking areas marked as unverified. Tap any area for walking directions.",
  },
  {
    question: "What are community smoking areas on SmokeCheck SG?",
    answer:
      "Community smoking areas are spots added by fellow users — for example an approved smoking corner at a hawker centre or an open area locals commonly use. They are clearly marked as community-added and unverified until cross-checked against official sources. Always confirm with the physical sign before relying on one.",
  },
  {
    question: "Are smoking areas in Singapore free?",
    answer:
      "Yes. Official NEA designated smoking areas and Orchard Road yellow boxes are free to use. Indoor smoking rooms in hotels, lounges or entertainment outlets may be for customers only, and private venues can impose their own house rules.",
  },
  {
    question: "What happens if I drop a cigarette butt in Singapore?",
    answer:
      "Cigarette butts count as litter. Littering offences in Singapore can be fined from S$300 for a first composition, with court fines up to S$2,000 for a first conviction, plus Corrective Work Orders (CWO) for repeat offenders. Dispose of butts only in the ashtrays provided at smoking areas — keep Singapore clean.",
  },
  {
    question: "Does SmokeCheck SG tell me where I can smoke or where I cannot?",
    answer:
      "Both. SmokeCheck SG is a smoking-rules checker: search any location and it shows whether the spot falls inside a no-smoking zone (red) and where the nearest designated smoking areas are (green), including community-added areas. It does not grant permission — physical signage and NEA instructions always prevail.",
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

export function SmokingAreasContent() {
  return (
    <div className="container stack smoking-areas-page bottom-safe-area">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }} />

      <div className="rules-main stack">
        <div className="rules-main__intro stack-sm">
          <p className="eyebrow">Singapore smoking areas, rules and fines — 2026</p>
          <h1 className="section-title">Where to Smoke in Singapore: Smoking Areas &amp; Rules</h1>
          <p className="body-copy">
            SmokeCheck SG is a smoking-rules checker, not a smoking-area finder. Search any address, and you will see exactly
            where smoking is banned and where the nearest official NEA designated smoking areas are — including Orchard Road
            yellow boxes and community-added smoking areas. Check before you light, keep your conscience clear, and help keep
            Singapore clean.
          </p>
          <Link href="/" className="live-primary-button">Open the smoking areas map</Link>
        </div>

        <section className="first-class-card first-class-card--success">
          <div className="first-class-card__heading">
            <span className="first-class-card__icon" aria-hidden="true">&#x2714;</span>
            <h2>Where you CAN smoke in Singapore</h2>
          </div>
          <p className="body-copy">Under NEA&apos;s smoking prohibition rules (updated August 2026), smoking is allowed in:</p>
          <ul className="body-copy">
            <li>Approved smoking corners at food retail establishments (hawker centres, coffeeshops, restaurants with NEA-approved corners)</li>
            <li>Smoking rooms at office premises, Changi Airport and public entertainment outlets</li>
            <li>Designated smoking areas (DSAs) — including the yellow boxes in the Orchard Road No-Smoking Zone</li>
            <li>DSAs within university compounds, JTC-managed parks and MINDEF premises</li>
            <li>Residential homes and private vehicles (with windows fully wound up in prohibited places)</li>
            <li>Open spaces in residential estates and open (unsheltered) spaces in town centres</li>
            <li>Open public spaces, surface carparks, uncovered walkways and vacant land — outside the Orchard Road No-Smoking Zone</li>
            <li>Uncovered areas on the top deck of multi-storey carparks — outside the Orchard Road No-Smoking Zone</li>
          </ul>
          <p className="source-line">Check SmokeCheck SG for the nearest official smoking area to any address, with walking directions.</p>
        </section>

        <section className="first-class-card first-class-card--warning">
          <div className="first-class-card__heading">
            <span className="first-class-card__icon" aria-hidden="true">&#x26A0;</span>
            <h2>Where smoking is BANNED in Singapore</h2>
          </div>
          <ul className="body-copy">
            <li>Inside most buildings and public service vehicles, including common areas of residential buildings (corridors, void decks, lifts, stairwells)</li>
            <li>Bus stops, bus shelters and bus poles — and within five metres of them</li>
            <li>Covered linkways, pedestrian overhead bridges, and covered or underground walkways</li>
            <li>Playgrounds, exercise areas, swimming pools (and within five metres), sports stadia</li>
            <li>Parks, gardens and nature reserves managed by NParks; parks in HDB estates; reservoirs and ABC Waters sites; recreational beaches</li>
            <li>Hospitals, schools and educational institutions — including within five metres of their compounds</li>
            <li>Community buildings, community centres and clubs under the People&apos;s Association</li>
            <li>Washrooms, ferry terminals, designated queue areas, and within five metres of building entrances, windows and ventilation intakes</li>
            <li>The Orchard Road No-Smoking Zone — except inside marked yellow boxes</li>
          </ul>
          <p className="source-line">Smoking in a prohibited place can cost S$200–S$1,000 per offence.</p>
        </section>

        <section className="guidance-card guidance-card--designated">
          <div className="stack-sm">
            <h2>Official NEA smoking areas &amp; the Orchard Road yellow boxes</h2>
            <p className="body-copy">
              NEA publishes the official Designated Smoking Areas dataset on data.gov.sg, and SmokeCheck SG plots every one of
              them on the map — including the yellow boxes inside the Orchard Road No-Smoking Zone, where smoking has only been
              allowed inside DSAs since January 2019. Tap any area for walking directions from your location.
            </p>
          </div>
        </section>

        <section className="guidance-card guidance-card--allowed">
          <div className="stack-sm">
            <h2>Community smoking areas</h2>
            <p className="body-copy">
              On top of official data, the SmokeCheck SG community can add smoking areas they have spotted on the ground —
              an approved smoking corner at a hawker centre, a quiet open corner near an MRT station, and more. Community-added
              areas are always marked as unverified until cross-checked against official sources, so confirm with the physical
              sign before lighting up. Add one yourself from the map in under a minute.
            </p>
          </div>
        </section>

        <section className="guidance-card guidance-card--uncertain">
          <div className="stack-sm">
            <h2>Keep Singapore clean from cigarettes</h2>
            <p className="body-copy">
              A lit cigarette creates two risks in Singapore: a fine for smoking in the wrong place, and a littering fine for
              the butt. Littering — including flicking a cigarette butt — can cost S$300 for a first composition and up to
              S$2,000 in court, plus Corrective Work Orders for repeat offenders. Smoke only in legal smoking areas, and bin or
              stub out in the ashtray provided. Clean city, clear conscience.
            </p>
          </div>
        </section>

        <section aria-label="Popular smoking area guides">
          <h2 className="section-title">Popular guides</h2>
          <div className="home-rules-grid">
            <section className="guidance-card guidance-card--designated">
              <div className="stack-sm">
                <h2>Orchard Road yellow boxes</h2>
                <p className="body-copy">The No-Smoking Zone rules and where to find every yellow-box DSA from Tanglin Mall to Concorde Hotel.</p>
                <Link href="/orchard-road-smoking-areas" className="source-line">Read the guide <span aria-hidden="true">&rarr;</span></Link>
              </div>
            </section>
            <section className="guidance-card guidance-card--uncertain">
              <div className="stack-sm">
                <h2>Singapore smoking fines</h2>
                <p className="body-copy">What each offence costs — S$200–S$1,000 for smoking in the wrong place, butt littering, vaping, and more.</p>
                <Link href="/singapore-smoking-fines" className="source-line">Read the fines guide <span aria-hidden="true">&rarr;</span></Link>
              </div>
            </section>
            <section className="guidance-card guidance-card--allowed">
              <div className="stack-sm">
                <h2>Changi Airport smoking areas</h2>
                <p className="body-copy">Where the smoking rooms and terraces are in Terminals 1–4, and the rules for travellers.</p>
                <Link href="/changi-airport-smoking-areas" className="source-line">Read the Changi guide <span aria-hidden="true">&rarr;</span></Link>
              </div>
            </section>
          </div>
        </section>

        <section aria-label="Smoking area frequently asked questions">
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

        <section className="home-source-trust" aria-label="Disclaimer and sources">
          <p className="source-line">
            <strong>Guidance, not legal advice:</strong> SmokeCheck SG does not confirm legality or grant permission to smoke.
            Physical signage, current law and NEA instructions always prevail. Source data: NEA Smoking Prohibition overview
            (last updated 18 August 2026), data.gov.sg Designated Smoking Areas dataset, and the Smoking (Prohibition in
            Certain Places) Act 1992. See the <Link href="/sources">sources page</Link> for full provenance.
          </p>
        </section>

        <Link href="/" className="live-primary-button">Check any location on the map</Link>
      </div>
    </div>
  );
}
