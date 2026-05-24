"use server";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { LeadPayload } from "@/types/lead";

function readString(formData: FormData, key: keyof LeadPayload) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

export async function requestDemo(formData: FormData) {
  const payload: LeadPayload = {
    name: readString(formData, "name"),
    email: readString(formData, "email"),
    role: readString(formData, "role"),
    companyType: readString(formData, "companyType"),
    message: readString(formData, "message"),
  };

  if (!payload.name || !payload.email || !payload.role || !payload.companyType) {
    throw new Error("Missing required lead fields.");
  }

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    console.info("Supabase is not configured yet. Lead payload:", payload);
    return;
  }

  const { error } = await supabase.from("demo_requests").insert({
    name: payload.name,
    email: payload.email,
    role: payload.role,
    company_type: payload.companyType,
    message: payload.message,
  });

  if (error) {
    throw new Error(error.message);
  }
}
