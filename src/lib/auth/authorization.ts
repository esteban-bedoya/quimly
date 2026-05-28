import { notFound, redirect } from "next/navigation";

import { getCurrentUserContext } from "@/lib/auth/user-context";
import { getSupabaseRlsClient } from "@/lib/supabase/rls-server";
import type {
  AppRole,
  AccessibleBranchSummary,
  AuthenticatedUserContext,
  CompanySummary,
} from "@/types/auth";

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
  const activeContext = context ?? (await requireAuthenticatedUser());
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
    company: { name: string; slug: string } | { name: string; slug: string }[] | null;
  };

  const { data, error } = await supabase
    .from("branches")
    .select("id, company_id, name, slug, is_main, is_active, company:companies!inner(name, slug)")
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
          companyName: company.name,
          companySlug: company.slug,
        } satisfies AccessibleBranchSummary,
      ];
    }) ?? []
  ).filter((branch) => activeContext.profile.globalRole !== "company_admin" || branch.isActive);
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
    .select("id, company_id, name, slug, is_main, is_active")
    .eq("company_id", company.id)
    .eq("slug", branchSlug)
    .maybeSingle();

  if (branchError) {
    throw new Error(branchError.message);
  }

  if (!branch) {
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
    },
  };
}
