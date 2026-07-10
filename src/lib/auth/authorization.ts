import { notFound, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getCurrentUserContext } from "@/lib/auth/user-context";
import {
  getAccountCapabilities,
  getSubscriptionViewState,
  normalizePlanType,
  normalizeSiteStatus,
  normalizeSubscriptionStatus,
  type AccountCapabilities,
} from "@/lib/billing";
import { getSupabaseRlsClient } from "@/lib/supabase/rls-server";
import type {
  AppRole,
  AccessibleBranchSummary,
  AuthenticatedUserContext,
  CompanySummary,
} from "@/types/auth";

type CompanySubscriptionCapabilityRow = {
  status: string | null;
  plan_type: string | null;
  trial_ends_at: string | null;
  included_active_sites: number | null;
  max_active_locations: number | null;
};

export async function requireAuthenticatedUser() {
  const context = await getCurrentUserContext();

  if (!context) {
    redirect("/login");
  }

  return context;
}

export async function requireRole(allowedRoles: AppRole[]): Promise<AuthenticatedUserContext> {
  const context = await requireAuthenticatedUser();

  if (!allowedRoles.includes(context.profile.globalRole)) {
    redirect("/dashboard");
  }

  return context;
}

export async function getAccessibleCompanies(context?: AuthenticatedUserContext): Promise<CompanySummary[]> {
  await (context ?? requireAuthenticatedUser());
  const supabase = await getSupabaseRlsClient();

  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("companies")
    .select("id, name, slug, is_active, company_admin_user_id")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (
    data?.map((company) => ({
      id: company.id,
      name: company.name,
      slug: company.slug,
      isActive: company.is_active,
      companyAdminUserId: company.company_admin_user_id,
    })) ?? []
  );
}

export async function getAccessibleBranches(
  context?: AuthenticatedUserContext,
): Promise<AccessibleBranchSummary[]> {
  await (context ?? requireAuthenticatedUser());
  const supabase = await getSupabaseRlsClient();

  if (!supabase) {
    return [];
  }

  type AccessibleBranchRow = {
    id: string;
    company_id: string;
    name: string;
    slug: string;
    is_main: boolean;
    is_active: boolean;
    status: string | null;
    company: { name: string; slug: string } | { name: string; slug: string }[] | null;
  };

  const { data, error } = await supabase
    .from("branches")
    .select("id, company_id, name, slug, is_main, is_active, status, company:companies!inner(name, slug)")
    .order("created_at", { ascending: true })
    .returns<AccessibleBranchRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  return (
    data?.flatMap((branch) => {
      const company = Array.isArray(branch.company) ? branch.company[0] ?? null : branch.company;

      if (!company) {
        return [];
      }

      return [
        {
          id: branch.id,
          companyId: branch.company_id,
          name: branch.name,
          slug: branch.slug,
          isMain: branch.is_main,
          isActive: branch.is_active,
          status: normalizeSiteStatus(branch.status, branch.is_active),
          companyName: company.name,
          companySlug: company.slug,
        } satisfies AccessibleBranchSummary,
      ];
    }) ?? []
  );
}

export async function getCompanyAccountCapabilities(
  companyId: string,
  supabaseClient?: SupabaseClient,
): Promise<AccountCapabilities> {
  const supabase = supabaseClient ?? await getSupabaseRlsClient();

  if (!supabase) {
    return getAccountCapabilities({
      subscriptionViewState: "trial_expired",
      maxActiveLocations: 0,
      activeBranches: 0,
    });
  }

  const [{ count, error: activeBranchesError }, { data: subscription, error: subscriptionError }] = await Promise.all([
    supabase
      .from("branches")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "active"),
    supabase
      .from("company_subscriptions")
      .select("status, plan_type, trial_ends_at, included_active_sites, max_active_locations")
      .eq("company_id", companyId)
      .maybeSingle<CompanySubscriptionCapabilityRow>(),
  ]);

  if (activeBranchesError) {
    throw new Error(activeBranchesError.message);
  }

  if (subscriptionError) {
    throw new Error(subscriptionError.message);
  }

  const activeBranches = count ?? 0;
  const maxActiveLocations = subscription?.max_active_locations ?? 0;
  const subscriptionViewState = getSubscriptionViewState({
    status: normalizeSubscriptionStatus(subscription?.status),
    planType: normalizePlanType(subscription?.plan_type),
    trialEndsAt: subscription?.trial_ends_at ?? null,
  });

  return getAccountCapabilities({
    subscriptionViewState,
    maxActiveLocations,
    activeBranches,
  });
}

export async function requireCompanyAccess(companySlug: string) {
  const context = await requireAuthenticatedUser();
  const supabase = await getSupabaseRlsClient();

  if (!supabase) {
    redirect("/login");
  }

  const { data: company, error } = await supabase
    .from("companies")
    .select("id, name, slug, is_active, company_admin_user_id")
    .eq("slug", companySlug)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!company) {
    notFound();
  }

  return {
    context,
    company: {
      id: company.id,
      name: company.name,
      slug: company.slug,
      isActive: company.is_active,
      companyAdminUserId: company.company_admin_user_id,
    } satisfies CompanySummary,
  };
}

export async function requireBranchAccess(companySlug: string, branchSlug: string) {
  const context = await requireAuthenticatedUser();
  const supabase = await getSupabaseRlsClient();

  if (!supabase) {
    redirect("/login");
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, name, slug, is_active, company_admin_user_id")
    .eq("slug", companySlug)
    .eq("is_active", true)
    .maybeSingle();

  if (companyError) {
    throw new Error(companyError.message);
  }

  if (!company) {
    notFound();
  }

  const { data: branch, error: branchError } = await supabase
    .from("branches")
    .select("id, company_id, name, slug, is_main, is_active, status")
    .eq("company_id", company.id)
    .eq("slug", branchSlug)
    .maybeSingle();

  if (branchError) {
    throw new Error(branchError.message);
  }

  if (!branch) {
    notFound();
  }

  const branchStatus = normalizeSiteStatus(branch.status, branch.is_active);

  if (branchStatus === "deleted") {
    notFound();
  }

  return {
    context,
    company: {
      id: company.id,
      name: company.name,
      slug: company.slug,
      isActive: company.is_active,
      companyAdminUserId: company.company_admin_user_id,
    } satisfies CompanySummary,
    branch: {
      id: branch.id,
      companyId: branch.company_id,
      name: branch.name,
      slug: branch.slug,
      isMain: branch.is_main,
      isActive: branch.is_active,
      status: branchStatus,
    },
  };
}

export async function requireActiveBranchAccess(companySlug: string, branchSlug: string) {
  const access = await requireBranchAccess(companySlug, branchSlug);

  if (access.branch.status !== "active") {
    throw new Error("Esta sede está inactiva. Puedes consultar su historial, pero no crear ni modificar registros.");
  }

  const accountCapabilities = await getCompanyAccountCapabilities(access.company.id);

  if (accountCapabilities.requiresCapacityResolution) {
    throw new Error(
      `Tu plan permite administrar ${accountCapabilities.maxBranches} sede activa, pero actualmente tienes ${accountCapabilities.activeBranches} sedes activas. Selecciona qué sede deseas mantener activa para continuar operando.`,
    );
  }

  if (!accountCapabilities.canOperate) {
    throw new Error("Tu cuenta no tiene operación activa. Puedes consultar y descargar reportes históricos.");
  }

  return access;
}
