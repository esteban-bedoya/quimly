import { readSessionTokens } from "@/lib/auth/session";
import { getSupabaseAuthClient } from "@/lib/supabase/auth";

export async function getSupabaseRlsClient() {
  const session = await readSessionTokens();

  if (!session) {
    return null;
  }

  return getSupabaseAuthClient(session.accessToken);
}
