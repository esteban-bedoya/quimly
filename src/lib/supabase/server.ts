import { createClient } from "@supabase/supabase-js";

import { getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/supabase/config";

export function getSupabaseServerClient() {
  const supabaseUrl = getSupabaseUrl();
  const supabaseServiceKey = getSupabaseServiceRoleKey();

  if (!supabaseUrl || !supabaseServiceKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
