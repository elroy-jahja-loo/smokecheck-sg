import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { OpsAdminContent } from "@/components/ops-admin-content";
import { getDemoOfficerSessionFromRequest } from "@/lib/officer/demo-auth";
import { hasOfficerRole, officerRoles } from "@/lib/officer/roles";
import { getDataSyncStatus, getOperationalMetrics } from "@/lib/operations/system-status";
import { queueAdapter, queueProvider } from "@/lib/queue/queue-adapter";

export const dynamic = "force-dynamic";

export default async function OpsAdminPage() {
  const cookie = (await headers()).get("cookie") ?? "";
  const session = await getDemoOfficerSessionFromRequest(new Request("https://smokecheck.local/ops/admin", { headers: { cookie } }));
  if (!session) redirect("/ops/login?reason=admin-login-required");
  if (!hasOfficerRole(session.role, [officerRoles.admin, officerRoles.dataSync])) {
    redirect("/ops/dashboard?reason=admin-role-required");
  }

  const [syncStatus, metrics, deadLetters] = await Promise.all([
    getDataSyncStatus(),
    getOperationalMetrics(),
    queueAdapter.listDeadLetters(),
  ]);
  const canMutateDlq = hasOfficerRole(session.role, [officerRoles.admin, officerRoles.dataSync]);

  return <OpsAdminContent
    displayName={session.displayName}
    postgisConfigured={metrics.releaseReadiness.postgisConfigured}
    redisConfigured={metrics.releaseReadiness.redisConfigured}
    queueProvider={queueProvider}
    syncStatus={syncStatus.map((entry) => ({
      sourceId: entry.sourceId,
      sourceName: entry.source?.name,
      status: entry.status,
      lastSuccessfulSyncAt: entry.lastSuccessfulSyncAt,
      checksum: entry.checksum,
      stale: entry.stale,
    }))}
    deadLetters={deadLetters.map((entry) => ({
      id: entry.id,
      status: entry.status,
      eventName: entry.event.name,
      failureReason: entry.failureReason,
      provider: entry.provider,
      retryable: entry.retryable,
      createdAt: entry.createdAt,
    }))}
    canMutateDlq={canMutateDlq}
  />;
}
