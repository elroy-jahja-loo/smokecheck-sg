import type { SearchCandidate } from "@/lib/types";
import { geospatialRepository, type GeospatialRepository } from "@/lib/data/geospatial-repository";
import { sourceRepository, type SourceRepository } from "@/lib/data/source-repository";

export interface SearchAdapter {
  search(query: string): Promise<{ candidates: SearchCandidate[]; sources: Awaited<ReturnType<SourceRepository["requireSources"]>> }>;
}

class SeedSearchAdapter implements SearchAdapter {
  constructor(
    private readonly geospatial: GeospatialRepository = geospatialRepository,
    private readonly sourceRepo: SourceRepository = sourceRepository,
  ) {}

  async search(query: string) {
    const normalized = query.trim().toLowerCase();
    const [areas, zones] = await Promise.all([
      this.geospatial.listDesignatedAreas(),
      this.geospatial.listProhibitedZones(),
    ]);

    const areaCandidates: SearchCandidate[] = areas
      .filter((area) => matches(normalized, area.name, area.address))
      .map((area) => ({
        id: area.id,
        label: area.name,
        address: area.address,
        lat: area.lat,
        lng: area.lng,
        kind: "designated-area",
        sourceIds: [area.sourceId, "onemap-compatible-shell"],
        freshnessLabel: area.freshnessLabel,
        isPrototype: area.isPrototype,
      }));

    const zoneCandidates: SearchCandidate[] = zones
      .filter((zone) => matches(normalized, zone.name, zone.ruleSummary))
      .map((zone) => {
        const [lng, lat] = zone.geometry.type === "Polygon" ? zone.geometry.coordinates[0][0] : zone.geometry.coordinates[0][0][0];
        return {
          id: zone.id,
          label: zone.name,
          address: zone.ruleSummary,
          lat,
          lng,
          kind: "prohibited-zone",
          sourceIds: [zone.sourceId],
          freshnessLabel: zone.freshnessLabel,
          isPrototype: zone.isPrototype,
        };
      });

    const candidates = [...areaCandidates, ...zoneCandidates];
    const sourceIds = Array.from(new Set(candidates.flatMap((candidate) => candidate.sourceIds)));

    return {
      candidates,
      sources: await this.sourceRepo.requireSources(sourceIds.length ? sourceIds : ["onemap-compatible-shell"]),
    };
  }
}

function matches(query: string, ...values: string[]) {
  if (!query) return true;
  return values.some((value) => value.toLowerCase().includes(query));
}

export const searchAdapter: SearchAdapter = new SeedSearchAdapter();
