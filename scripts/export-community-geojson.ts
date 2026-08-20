import { loadEnvConfig } from "@next/env";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { getPostgisPool } from "@/lib/db/postgis";

async function main() {
  loadEnvConfig(process.cwd());

  const outPath = process.env.SMOKECHECK_COMMUNITY_EXPORT_PATH ?? "data/generated/community-features.geojson";
  const pool = getPostgisPool();
  const [areas, zones] = await Promise.all([
    pool.query<{ id: string; name: string; radius_m: number | null; lat: number; lng: number }>(
      `select
         c.id,
         c.name,
         c.radius_m,
         extensions.st_y(c.location::extensions.geometry) as lat,
         extensions.st_x(c.location::extensions.geometry) as lng
       from public.community_designated_areas c`,
    ),
    pool.query<{ id: string; name: string; geometry_geojson: unknown }>(
      `select
         c.id,
         c.name,
         extensions.st_asgeojson(c.geometry::extensions.geometry)::jsonb as geometry_geojson
       from public.community_prohibited_zones c`,
    ),
  ]);

  const features = [
    ...areas.rows.map((row) => ({
      type: "Feature" as const,
      id: `community-dsa-${row.id}`,
      properties: {
        kind: "designated-area",
        name: row.name,
        sourceId: "community-reports",
        radiusM: Number(row.radius_m ?? 10),
      },
      geometry: { type: "Point" as const, coordinates: [row.lng, row.lat] },
    })),
    ...zones.rows.map((row) => ({
      type: "Feature" as const,
      id: `community-zone-${row.id}`,
      properties: {
        kind: "prohibited-zone",
        name: row.name,
        sourceId: "community-reports",
        zoneType: "community_no_smoking_zone",
      },
      geometry: row.geometry_geojson,
    })),
  ];

  const payload = { type: "FeatureCollection", features };
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(payload, null, 2));
  await pool.end();

  console.log(JSON.stringify({ outPath, featureCount: features.length }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
