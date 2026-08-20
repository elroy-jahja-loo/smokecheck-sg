import { OfficerOpsWorkspace } from "@/components/officer-ops-workspace";
import { officerHotspots, officerReportDraft } from "@/data/officer-prototype-data";
import { getDemoOfficerSessionFromRequest } from "@/lib/officer/demo-auth";
import { hasOfficerRole, officerRoles } from "@/lib/officer/roles";
import { listDemoComplaintHotspots, listRecentDemoOfficerReports } from "@/lib/officer/demo-operations";
import { featureFlags } from "@/lib/feature-flags";
import { readVectorTileManifest } from "@/lib/vector-tiles/manifest";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { OpsDashboardHeader } from "./ops-dashboard-header";

export default async function OfficerDashboardPage() {
  const cookie = (await headers()).get("cookie") ?? "";
  const session = await getDemoOfficerSessionFromRequest(new Request("https://smokecheck.local/ops/dashboard", { headers: { cookie } }));
  if (!session) redirect("/ops/login?reason=officer-login-required");
  const canOpenOpsAdmin = hasOfficerRole(session.role, [officerRoles.admin, officerRoles.dataSync]);
  const hotspots = await listDemoComplaintHotspots().catch(() => officerHotspots);
  const recentReports = await listRecentDemoOfficerReports().catch(() => []);
  const vectorTileManifest = featureFlags.vectorTileMode === "generated" ? await readVectorTileManifest() : undefined;

  return (
    <main className="ops-page-shell">
      <OpsDashboardHeader displayName={session.displayName} canOpenOpsAdmin={canOpenOpsAdmin} />
      <OfficerOpsWorkspace
        hotspots={hotspots}
        recentReports={recentReports}
        initialDraft={officerReportDraft}
        vectorTileBaseUrl={featureFlags.vectorTileMode === "generated" ? process.env.VECTOR_TILE_BASE_URL : undefined}
        vectorTileLayerName={vectorTileManifest?.layers?.[0]}
      />
    </main>
  );
}
