import type { ProhibitedZone } from "@/lib/types";

export const seedProhibitedZones: ProhibitedZone[] = [
  {
    id: "zone-orchard-demo",
    name: "Orchard Road No Smoking Zone prototype boundary",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [103.8288, 1.3017],
          [103.8356, 1.3017],
          [103.8356, 1.3072],
          [103.8288, 1.3072],
          [103.8288, 1.3017],
        ],
      ],
    },
    ruleSummary: "Public areas within the Orchard Road No Smoking Zone may have specific restrictions. Confirm with physical signs and NEA guidance.",
    sourceId: "nea-smoking-guidance",
    freshnessLabel: "Prototype polygon derived from rule category, not an official boundary dataset",
    isPrototype: true,
  },
  {
    id: "zone-civic-shelter-demo",
    name: "Civic district covered walkway prototype zone",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [103.8497, 1.2915],
          [103.8542, 1.2915],
          [103.8542, 1.2952],
          [103.8497, 1.2952],
          [103.8497, 1.2915],
        ],
      ],
    },
    ruleSummary: "Covered linkways, shelters, entrances, and queues commonly require caution. The prototype zone is illustrative only.",
    sourceId: "nea-smoking-guidance",
    freshnessLabel: "Prototype polygon, illustrative only",
    isPrototype: true,
  },
];
