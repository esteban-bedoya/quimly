"use server";

import { normalizeLeadPayload, submitDemoLead } from "@/lib/leads";
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

  const normalized = normalizeLeadPayload(payload);

  if (!normalized.ok) {
    throw new Error(normalized.error);
  }

  await submitDemoLead(normalized.payload);
}
