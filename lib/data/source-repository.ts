import { seedSourceMetadata } from "@/data/seed-source-metadata";
import { getPostgisPool, hasPostgisConfig } from "@/lib/db/postgis";
import type { SourceMetadata } from "@/lib/types";

export interface SourceRepository {
  listSources(): Promise<SourceMetadata[]>;
  getSource(id: string): Promise<SourceMetadata | undefined>;
  requireSources(ids: string[]): Promise<SourceMetadata[]>;
}

export class SeedSourceRepository implements SourceRepository {
  async listSources() {
    return seedSourceMetadata;
  }

  async getSource(id: string) {
    return seedSourceMetadata.find((source) => source.id === id);
  }

  async requireSources(ids: string[]) {
    const sources = ids
      .map((id) => seedSourceMetadata.find((source) => source.id === id))
      .filter((source): source is SourceMetadata => Boolean(source));

    if (sources.length !== new Set(ids).size) {
      throw new Error("Missing source metadata for public result");
    }

    return sources;
  }
}

class PostgisSourceRepository implements SourceRepository {
  async listSources() {
    const result = await getPostgisPool().query<{
      id: string;
      name: string;
      source_url: string;
      authority: SourceMetadata["authority"];
      updated_at: Date;
      notes: string | null;
      is_official: boolean;
    }>(
      `select id, name, source_url, authority, updated_at, notes, is_official
       from public.source_metadata
       order by id`,
    ).catch(() => undefined);
    if (!result) return seedSourceMetadata;
    const { rows } = result;

    const postgisSources = rows.map<SourceMetadata>((row) => ({
      id: row.id,
      name: row.name,
      url: row.source_url,
      authority: row.authority,
      retrievedAt: row.updated_at.toISOString(),
      ...(row.notes ? { versionLabel: row.notes } : {}),
      isPrototype: !row.is_official,
    }));

    const byId = new Map(seedSourceMetadata.map((source) => [source.id, source]));
    for (const source of postgisSources) byId.set(source.id, source);
    return Array.from(byId.values());
  }

  async getSource(id: string) {
    return (await this.listSources()).find((source) => source.id === id);
  }

  async requireSources(ids: string[]) {
    const uniqueIds = Array.from(new Set(ids));
    const sources = await this.listSources();
    const selected = uniqueIds
      .map((id) => sources.find((source) => source.id === id))
      .filter((source): source is SourceMetadata => Boolean(source));

    if (selected.length !== uniqueIds.length) {
      throw new Error("Missing source metadata for public result");
    }

    return selected;
  }
}

export function createSourceRepository(): SourceRepository {
  return hasPostgisConfig() ? new PostgisSourceRepository() : new SeedSourceRepository();
}

export const sourceRepository: SourceRepository = createSourceRepository();
