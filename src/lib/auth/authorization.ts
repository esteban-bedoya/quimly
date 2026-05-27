import { notFound, redirect } from "next/navigation";

import { getCurrentUserContext } from "@/lib/auth/user-context";
import { getSupabaseRlsClient } from "@/lib/supabase/rls-server";
import type { AppRole, AuthenticatedUserContext, CompanySummary } from "@/types/auth";

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
