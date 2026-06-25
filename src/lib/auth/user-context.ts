import { cache } from "react";

import { redirect } from "next/navigation";

import { readSessionTokens } from "@/lib/auth/session";
import { getSupabaseAuthClient } from "@/lib/supabase/auth";
import type { AuthenticatedUserContext, UserProfile } from "@/types/auth";

type ProfileRow = {
  user_id: string;
  email: string;
  full_name: string | null;
  global_role: UserProfile["globalRole"];
  is_active: boolean;
  default_company_id: string | null;
};

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
    .select("user_id, email, full_name, global_role, is_active, default_company_id")
    .eq("user_id", user.id)
    .maybeSingle<ProfileRow>();

  if (profileError || !profileRow || !profileRow.is_active) {
    return null;
  }

  return {
    profile: {
      userId: profileRow.user_id,
      email: profileRow.email,
      fullName: profileRow.full_name,
      globalRole: profileRow.global_role,
      isActive: profileRow.is_active,
      defaultCompanyId: profileRow.default_company_id,
    },
  };
});

export async function requireUserContext() {
  const context = await getCurrentUserContext();

  if (!context) {
    redirect("/login");
  }

  return context;
}
