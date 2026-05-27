import { cache } from "react";

import { redirect } from "next/navigation";

import { readSessionTokens } from "@/lib/auth/session";
import { getSupabaseAuthClient } from "@/lib/supabase/auth";
import type {
  AuthenticatedUserContext,
  CompanySummary,
  UserCompanyMembership,
  UserProfile,
} from "@/types/auth";

type ProfileRow = {
  user_id: string;
  email: string;
  full_name: string | null;
  global_role: UserProfile["globalRole"];
  is_active: boolean;
  can_access_all_companies: boolean;
  default_company_id: string | null;
};

type MembershipRow = {
  id: string;
  is_active: boolean;
  company: CompanySummary | CompanySummary[] | null;
};

function normalizeCompany(company: MembershipRow["company"]): CompanySummary | null {
  if (!company) {
    return null;
  }

  return Array.isArray(company) ? company[0] ?? null : company;
}

export const getCurrentUserContext = cache(async (): Promise<AuthenticatedUserContext | null> => {
  const session = await readSessionTokens();

  if (!session) {
    return null;
  }

  const supabase = getSupabaseAuthClient(session.accessToken);

  if (!supabase) {
    return null;
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(session.accessToken);

  if (authError || !user) {
    return null;
  }

  const { data: profileRow, error: profileError } = await supabase
    .from("user_profiles")
    .select("user_id, email, full_name, global_role, is_active, can_access_all_companies, default_company_id")
    .eq("user_id", user.id)
    .maybeSingle<ProfileRow>();

  if (profileError || !profileRow || !profileRow.is_active) {
    return null;
  }

  const { data: membershipRows, error: membershipsError } = await supabase
    .from("company_memberships")
    .select("id, is_active, company:companies(id, name, slug, is_active)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .returns<MembershipRow[]>();

  if (membershipsError) {
    throw new Error(membershipsError.message);
  }

  return {
    profile: {
      userId: profileRow.user_id,
      email: profileRow.email,
      fullName: profileRow.full_name,
      globalRole: profileRow.global_role,
      isActive: profileRow.is_active,
      canAccessAllCompanies: profileRow.can_access_all_companies,
      defaultCompanyId: profileRow.default_company_id,
    },
    memberships: (membershipRows ?? []).map<UserCompanyMembership>((membership) => ({
      id: membership.id,
      isActive: membership.is_active,
      company: normalizeCompany(membership.company),
    })),
  };
});

export async function requireUserContext() {
  const context = await getCurrentUserContext();

  if (!context) {
    redirect("/login");
  }

  return context;
}
