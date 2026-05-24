import { getSupabaseServerClient } from "@/lib/supabase/server";
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
      typeof payload.companyType === "string",
  );
}

export async function POST(request: Request) {
  const body = (await request.json()) as unknown;

  if (!isLeadPayload(body)) {
    return Response.json({ error: "Invalid lead payload." }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return Response.json(
      { error: "Supabase environment variables are not configured." },
      { status: 503 },
    );
  }

  const { error } = await supabase.from("demo_requests").insert({
    name: body.name.trim(),
    email: body.email.trim(),
    role: body.role.trim(),
    company_type: body.companyType.trim(),
    message: body.message?.trim() ?? "",
  });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true }, { status: 201 });
}
