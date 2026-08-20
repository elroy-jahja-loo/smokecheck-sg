import type { DesignatedArea } from "@/lib/types";

export const seedDesignatedAreas: DesignatedArea[] = [
  {
    id: "dsa-orchard-demo",
    name: "Orchard precinct designated area",
    address: "Prototype point near 313 Orchard Road",
    lat: 1.3048,
    lng: 103.8318,
    sourceId: "datagov-discovery",
    freshnessLabel: "Prototype seed data, illustrative only",
    isPrototype: true,
  },
  {
    id: "dsa-civic-demo",
    name: "Civic district designated area",
    address: "Prototype point near City Hall",
    lat: 1.2931,
    lng: 103.8521,
    sourceId: "datagov-discovery",
    freshnessLabel: "Prototype seed data, illustrative only",
    isPrototype: true,
  },
];
