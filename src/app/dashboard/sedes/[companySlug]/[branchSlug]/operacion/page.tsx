import { BranchOperationalView } from "@/components/dashboard/branch-detail-view";

import { loadBranchDashboardData } from "../branch-dashboard-data";

export const dynamic = "force-dynamic";

export default async function BranchOperationalPage({
  params,
}: {
  params: Promise<{ companySlug: string; branchSlug: string }>;
}) {
  const { companySlug, branchSlug } = await params;
  const data = await loadBranchDashboardData(companySlug, branchSlug);

  return <BranchOperationalView {...data} />;
}
