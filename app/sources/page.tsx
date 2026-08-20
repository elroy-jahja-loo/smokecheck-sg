import { getDataSyncStatus } from "@/lib/operations/system-status";
import { SourcesPageContent } from "./sources-page-content";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const syncStatus = await getDataSyncStatus().catch(() => []);

  return <SourcesPageContent syncStatus={syncStatus} />;
}
