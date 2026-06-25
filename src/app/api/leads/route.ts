import { normalizeLeadPayload, submitDemoLead } from "@/lib/leads";
import type { LeadPayload } from "@/types/lead";

function isLeadPayload(value: unknown): value is LeadPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Partial<LeadPayload>;

  return Boolean(
    payload.name &&
      payload.email &&
      payload.role &&
      payload.companyType &&
      typeof payload.name === "string" &&
      typeof payload.email === "string" &&
      typeof payload.role === "string" &&
      typeof payload.companyType === "string" &&
      (payload.message === undefined || typeof payload.message === "string"),
  );
}

export async function POST(request: Request) {
  const body = (await request.json()) as unknown;

  if (!isLeadPayload(body)) {
    return Response.json({ error: "Invalid lead payload." }, { status: 400 });
  }

  const normalized = normalizeLeadPayload(body);

  if (!normalized.ok) {
    return Response.json({ error: normalized.error }, { status: 400 });
  }

  try {
    await submitDemoLead(normalized.payload);
  } catch {
    return Response.json({ error: "Unable to submit lead." }, { status: 500 });
  }

  return Response.json({ ok: true }, { status: 201 });
}
