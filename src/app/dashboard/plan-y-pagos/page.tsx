import { redirect } from "next/navigation";

import { CompanyAdminDashboard } from "@/components/dashboard/company-admin-dashboard";
import { getAccessibleBranches, requireAuthenticatedUser } from "@/lib/auth/authorization";
import { getCompanyAdminPlanPaymentsData } from "@/lib/billing/plan-payments-data.server";

export const dynamic = "force-dynamic";

export default async function PlanPaymentsPage() {
  const context = await requireAuthenticatedUser();

  if (context.profile.globalRole !== "company_admin") {
    redirect("/dashboard");
  }

  const branches = await getAccessibleBranches(context);
  const planPayments = await getCompanyAdminPlanPaymentsData(branches);

  return (
    <CompanyAdminDashboard
      profile={context.profile}
      branches={branches}
      planPayments={planPayments}
      initialPlanPaymentsOpen
    />
  );
}
