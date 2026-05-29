import { BranchLandingView } from "@/components/dashboard/branch-detail-view";

import { loadBranchDashboardData } from "./branch-dashboard-data";

export const dynamic = "force-dynamic";

export default async function BranchDashboardPage({
  params,
}: {
  params: Promise<{ companySlug: string; branchSlug: string }>;
}) {
  const { companySlug, branchSlug } = await params;
  const data = await loadBranchDashboardData(companySlug, branchSlug);

  return <BranchLandingView {...data} />;
}
