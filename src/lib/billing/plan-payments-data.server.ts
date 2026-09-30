import "server-only";

import {
  calculatePlanMonthlyTotalCop,
  getAccountCapabilities,
  getDefaultAdditionalSiteMonthlyPriceCop,
  getDefaultBaseMonthlyPriceCop,
  getSubscriptionViewState,
  includedSitesInBasePlan,
  normalizePaymentMethodStatus,
  normalizePlanType,
  normalizeSubscriptionStatus,
  type PlanPaymentsData,
  type ScheduledCapacityChange,
} from "@/lib/billing";
import { getSupabaseRlsClient } from "@/lib/supabase/rls-server";
import type { AccessibleBranchSummary, CompanySummary } from "@/types/auth";

type CompanySubscriptionRow = {
  status: string | null;
  plan_type: string | null;
  trial_ends_at: string | null;
  current_period_ends_at: string | null;
  payment_grace_ends_at: string | null;
  cancellation_requested_at: string | null;
  cancellation_effective_at: string | null;
  base_monthly_price_cop: number | null;
  additional_site_monthly_price_cop: number | null;
  included_active_sites: number | null;
  max_active_locations: number | null;
  payment_method_status: string | null;
  payment_attention_required: boolean | null;
};

type SubscriptionCapacityChangeRow = {
  id: string;
  requested_max_active_locations: number;
  change_type: "upgrade" | "downgrade";
  status: "scheduled" | "applied" | "cancelled";
  effective_at: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

function getScheduledSelection(metadata: Record<string, unknown> | null) {
  const selectedBranchIds = metadata?.selectedBranchIds;

  if (!Array.isArray(selectedBranchIds)) {
    return [];
  }

  return [...new Set(selectedBranchIds.filter((branchId): branchId is string => typeof branchId === "string"))];
}

function buildPlanPaymentsData({
  branches,
  companySlug,
  scheduledCapacityChange,
  subscription,
}: {
  branches: AccessibleBranchSummary[];
  companySlug: string | null;
  scheduledCapacityChange: SubscriptionCapacityChangeRow | null;
  subscription: CompanySubscriptionRow | null;
}): PlanPaymentsData {
  const subscriptionStatus = normalizeSubscriptionStatus(subscription?.status);
  const planType = normalizePlanType(subscription?.plan_type);
  const baseMonthlyPriceCop = subscription?.base_monthly_price_cop ?? getDefaultBaseMonthlyPriceCop(planType);
  const additionalSiteMonthlyPriceCop =
    subscription?.additional_site_monthly_price_cop ?? getDefaultAdditionalSiteMonthlyPriceCop(planType);
  const includedActiveSites = subscription?.included_active_sites ?? includedSitesInBasePlan;
  const activeSites = branches.filter((branch) => branch.status === "active").length;
  const inactiveSites = branches.filter((branch) => branch.status === "inactive").length;
  const maxActiveLocations = subscription?.max_active_locations ?? 0;
  const subscriptionViewState = getSubscriptionViewState({
    status: subscriptionStatus,
    planType,
    trialEndsAt: subscription?.trial_ends_at ?? null,
    paymentGraceEndsAt: subscription?.payment_grace_ends_at ?? null,
  });
  const accountCapabilities = getAccountCapabilities({
    subscriptionViewState,
    maxActiveLocations,
    activeBranches: activeSites,
  });
  const billableAdditionalSites = Math.max(maxActiveLocations - includedActiveSites, 0);
  const monthlyTotalCop = subscription && subscriptionStatus !== "trial"
    ? calculatePlanMonthlyTotalCop({
        planType,
        siteCount: maxActiveLocations,
        baseMonthlyPriceCop,
        additionalSiteMonthlyPriceCop,
        includedActiveSites,
      })
    : 0;

  return {
    companySlug,
    subscriptionStatus,
    subscriptionViewState,
    accountCapabilities,
    planType,
    trialEndsAt: subscription?.trial_ends_at ?? null,
    nextChargeAt: subscription?.cancellation_requested_at ? null : subscription?.current_period_ends_at ?? null,
    paymentGraceEndsAt: subscription?.payment_grace_ends_at ?? null,
    cancellationRequestedAt: subscription?.cancellation_requested_at ?? null,
    cancellationEffectiveAt: subscription?.cancellation_effective_at ?? null,
    baseMonthlyPriceCop,
    additionalSiteMonthlyPriceCop,
    includedActiveSites,
    maxActiveLocations,
    paymentMethodStatus: normalizePaymentMethodStatus(subscription?.payment_method_status),
    paymentAttentionRequired: subscription?.payment_attention_required ?? false,
    totalSites: branches.length,
    activeSites,
    inactiveSites,
    billableAdditionalSites,
    monthlyTotalCop,
    scheduledCapacityChange: scheduledCapacityChange
      ? ({
          id: scheduledCapacityChange.id,
          requestedMaxActiveLocations: scheduledCapacityChange.requested_max_active_locations,
          changeType: scheduledCapacityChange.change_type,
          status: scheduledCapacityChange.status,
          effectiveAt: scheduledCapacityChange.effective_at,
          createdAt: scheduledCapacityChange.created_at,
          selectedBranchIds: getScheduledSelection(scheduledCapacityChange.metadata),
        } satisfies ScheduledCapacityChange)
      : null,
  };
}

export async function getCompanyAdminPlanPaymentsData(
  branches: AccessibleBranchSummary[],
  company: CompanySummary | null = null,
): Promise<PlanPaymentsData> {
  const companyId = company?.id ?? branches[0]?.companyId ?? null;
  const companySlug = company?.slug ?? branches[0]?.companySlug ?? null;
  const supabase = await getSupabaseRlsClient();

  if (!supabase || !companyId) {
    return buildPlanPaymentsData({ branches, companySlug, scheduledCapacityChange: null, subscription: null });
  }

  const [{ data: subscription }, { data: scheduledCapacityChange }] = await Promise.all([
    supabase
      .from("company_subscriptions")
      .select(
        "status, plan_type, trial_ends_at, current_period_ends_at, payment_grace_ends_at, cancellation_requested_at, cancellation_effective_at, base_monthly_price_cop, additional_site_monthly_price_cop, included_active_sites, max_active_locations, payment_method_status, payment_attention_required",
      )
      .eq("company_id", companyId)
      .maybeSingle<CompanySubscriptionRow>(),
    supabase
      .from("subscription_capacity_changes")
      .select("id, requested_max_active_locations, change_type, status, effective_at, created_at, metadata")
      .eq("company_id", companyId)
      .eq("status", "scheduled")
      .order("effective_at", { ascending: true })
      .limit(1)
      .maybeSingle<SubscriptionCapacityChangeRow>(),
  ]);

  return buildPlanPaymentsData({
    branches,
    companySlug,
    scheduledCapacityChange: scheduledCapacityChange ?? null,
    subscription: subscription ?? null,
  });
}
