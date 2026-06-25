import "server-only";

import { getSupabasePublicClient } from "@/lib/supabase/public";
import type { LeadPayload } from "@/types/lead";

const leadFieldLimits = {
  name: 160,
  email: 254,
  role: 120,
  companyType: 120,
  message: 2000,
} as const;

const publicLeadErrorMessage = "No fue posible registrar la solicitud. Intenta nuevamente.";

type NormalizedLeadPayload = Required<LeadPayload>;

function getEmailDomain(email: string) {
  const atIndex = email.lastIndexOf("@");

  if (atIndex === -1) {
    return null;
  }

  return email.slice(atIndex + 1, atIndex + 129) || null;
}

function sanitizeLogText(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  return value.slice(0, 240);
}

function logLeadSubmissionError(error: unknown, payload?: NormalizedLeadPayload) {
  const supabaseError = error as { code?: unknown; message?: unknown; status?: unknown };

  console.error("submit_demo_lead failed", {
    code: sanitizeLogText(supabaseError.code),
    message: sanitizeLogText(supabaseError.message),
    status: typeof supabaseError.status === "number" ? supabaseError.status : undefined,
    nameLength: payload?.name.length,
    emailDomain: payload ? getEmailDomain(payload.email) : undefined,
    roleLength: payload?.role.length,
    companyTypeLength: payload?.companyType.length,
    messageLength: payload?.message.length,
  });
}

export function normalizeLeadPayload(payload: Partial<LeadPayload>) {
  const normalized: NormalizedLeadPayload = {
    name: payload.name?.trim() ?? "",
    email: payload.email?.trim().toLowerCase() ?? "",
    role: payload.role?.trim() ?? "",
    companyType: payload.companyType?.trim() ?? "",
    message: payload.message?.trim() ?? "",
  };

  if (!normalized.name || !normalized.email || !normalized.role || !normalized.companyType) {
    return { ok: false as const, error: publicLeadErrorMessage };
  }

  const tooLong = Object.entries(normalized).some(([key, value]) => {
    const limit = leadFieldLimits[key as keyof typeof leadFieldLimits];
    return value.length > limit;
  });

  if (tooLong) {
    return { ok: false as const, error: publicLeadErrorMessage };
  }

  return { ok: true as const, payload: normalized };
}

export async function submitDemoLead(payload: NormalizedLeadPayload) {
  const supabase = getSupabasePublicClient();

  if (!supabase) {
    logLeadSubmissionError(new Error("Supabase public client is not configured."), payload);
    throw new Error(publicLeadErrorMessage);
  }

  const { error } = await supabase.rpc("submit_demo_lead", {
    p_name: payload.name,
    p_email: payload.email,
    p_role: payload.role,
    p_company_type: payload.companyType,
    p_message: payload.message,
  });

  if (error) {
    logLeadSubmissionError(error, payload);
    throw new Error(publicLeadErrorMessage);
  }
}
