const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function getSupabaseUrl() {
  return supabaseUrl ?? null;
}

export function getSupabaseAnonKey() {
  return supabaseAnonKey ?? null;
}

export function getSupabaseServiceRoleKey() {
  return supabaseServiceKey ?? null;
}

export function getMissingSupabaseAdminConfigKeys() {
  return [
    !supabaseUrl ? "NEXT_PUBLIC_SUPABASE_URL" : null,
    !supabaseServiceKey ? "SUPABASE_SERVICE_ROLE_KEY" : null,
  ].filter((key): key is string => Boolean(key));
}
