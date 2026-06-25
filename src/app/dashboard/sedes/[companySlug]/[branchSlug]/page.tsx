import { BranchLandingView } from "@/components/dashboard/branch-detail-view";
import { requireBranchAccess } from "@/lib/auth/authorization";
import { loadBranchReportPanelData } from "@/lib/branch-reports/data";

export const dynamic = "force-dynamic";

export default async function BranchDashboardPage({
  params,
}: {
  params: Promise<{ companySlug: string; branchSlug: string }>;
}) {
  const { companySlug, branchSlug } = await params;
  const { company, branch } = await requireBranchAccess(companySlug, branchSlug);
  const reportPanelData = await loadBranchReportPanelData(branch);

  return <BranchLandingView company={company} branch={branch} reportPanelData={reportPanelData} />;
}
