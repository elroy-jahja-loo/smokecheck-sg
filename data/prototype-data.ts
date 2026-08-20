import type { DesignatedArea, SourceMetadata } from "@/lib/types";
import { seedDesignatedAreas } from "@/data/seed-designated-areas";
import { seedSourceMetadata } from "@/data/seed-source-metadata";

export const globalDisclaimer =
  "This tool provides guidance based on available map and rule data. Physical signs, current law, and NEA instructions prevail.";

export const sourceMetadata: SourceMetadata[] = seedSourceMetadata.filter((source) => source.id !== "simulated-officer-heatmap");
export const allSourceMetadata: SourceMetadata[] = seedSourceMetadata;

export const designatedAreas: DesignatedArea[] = seedDesignatedAreas;


export const ruleSummaries = [
  "Bus stops, shelters, covered linkways, queues, and many public buildings commonly have smoking prohibitions.",
  "Designated smoking areas may exist in some locations, but users must confirm with physical signage before acting.",
  "The map is guidance only. Current law, physical signs, and NEA instructions prevail.",
];


export const ruleFaqSections = [
  {
    id: "bus-stops-and-shelters",
    title: "Bus stops and shelters",
    summary:
      "Smoking is commonly prohibited at bus stops, bus shelters, and nearby waiting areas. Keep away from queues and follow posted signs.",
  },
  {
    id: "covered-walkways",
    title: "Covered walkways",
    summary:
      "Covered linkways and sheltered pedestrian routes may be prohibited places. If the map is unclear, avoid smoking there and check NEA guidance.",
  },
  {
    id: "parks-and-beaches",
    title: "Parks and beaches",
    summary:
      "Many parks, playgrounds, exercise areas, reservoirs, and beaches are covered by smoking prohibition rules. On-site signs and current law prevail.",
  },
  {
    id: "building-entrances",
    title: "Building entrances",
    summary:
      "Entrances, exits, windows, vents, and public queues can create rule complexity. Move away and confirm physical signage before acting.",
  },
  {
    id: "orchard-road-no-smoking-zone",
    title: "Orchard Road No Smoking Zone",
    summary:
      "Public areas within the Orchard Road No Smoking Zone may have specific restrictions. Use designated areas only where signs confirm them.",
  },
  {
    id: "designated-smoking-areas",
    title: "Designated smoking areas",
    summary:
      "A known designated area in this prototype is a source-backed map point, not blanket permission. Confirm with physical signage and be considerate to others.",
  },
  {
    id: "where-smoking-may-be-allowed",
    title: "Examples of places where smoking may be allowed",
    summary:
      "Smoking may be allowed only where current law, premises rules, and on-site signs allow it. Examples can include approved smoking corners, smoking rooms, marked designated smoking areas, and some open spaces unless otherwise prohibited. This is not blanket permission.",
  },
  {
    id: "why-map-may-not-be-enough",
    title: "Why the map may not be enough",
    summary:
      "GPS accuracy, micro-geographies near entrances and shelters, temporary signage changes, and prototype seed data mean the map is guidance, not a guarantee. Physical signs, current law, and NEA instructions always take precedence.",
  },
  {
    id: "signage-conflicts-with-map",
    title: "What to do if signage conflicts with the map",
    summary:
      "Follow the physical sign, current law, and NEA instructions over SmokeCheck SG. Treat the map as a planning and guidance aid, report stale data through official channels, and avoid smoking where the boundary is uncertain.",
  },
];
