import { cache } from "react";

import { redirect } from "next/navigation";

import { resolveUserIdentity } from "@/lib/auth/identity";
import { readSessionTokens } from "@/lib/auth/session";
import { getSupabaseAuthClient } from "@/lib/supabase/auth";
import type { AuthenticatedUserContext, UserProfile } from "@/types/auth";

type BaseProfileRow = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  global_role: UserProfile["globalRole"];
  is_active: boolean;
  default_company_id: string | null;
};

type ProfileRow = BaseProfileRow & {
  phone: string;
  phone_verified: boolean | null;
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
    .select("user_id, email, phone, phone_verified, full_name, global_role, is_active, default_company_id")
    .eq("user_id", user.id)
    .maybeSingle<ProfileRow>();

  if (profileError || !profileRow || !profileRow.is_active || !profileRow.phone) {
    return null;
  }

  const profile = {
    userId: profileRow.user_id,
    email: profileRow.email,
    phone: profileRow.phone,
    phoneVerified: profileRow.phone_verified ?? false,
    fullName: profileRow.full_name,
    globalRole: profileRow.global_role,
    isActive: profileRow.is_active,
    defaultCompanyId: profileRow.default_company_id,
  } satisfies UserProfile;

  return {
    profile,
    identity: resolveUserIdentity(profile),
  };
});

export async function requireUserContext() {
  const context = await getCurrentUserContext();

  if (!context) {
    redirect("/login");
  }

  return context;
}
