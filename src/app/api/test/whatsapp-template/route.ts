import { getCurrentUserContext } from "@/lib/auth/user-context";
import { isE164PhoneNumber } from "@/lib/phone";
import {
  getWhatsAppTemplateErrorDetails,
  sendWhatsAppTemplate,
  type WhatsAppTemplateVariables,
} from "@/lib/notifications/whatsapp-template.service";
import { logServerError } from "@/lib/server/logging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WhatsAppTemplateTestPayload = {
  phone: string;
  variables: WhatsAppTemplateVariables;
};

function isWhatsAppTemplateTestPayload(value: unknown): value is WhatsAppTemplateTestPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const payload = value as { phone?: unknown; variables?: unknown };

  if (typeof payload.phone !== "string" || !payload.variables || typeof payload.variables !== "object" || Array.isArray(payload.variables)) {
    return false;
  }

  return Object.entries(payload.variables).every(([key, variable]) => key.trim().length > 0 && typeof variable === "string");
}

export async function POST(request: Request) {
  const context = await getCurrentUserContext();

  if (!context) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (context.profile.globalRole !== "owner") {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  if (!isWhatsAppTemplateTestPayload(body)) {
    return Response.json(
      { error: "Expected a phone string and a variables object containing string values." },
      { status: 400 },
    );
  }

  const phone = body.phone.trim();

  if (!isE164PhoneNumber(phone)) {
    return Response.json({ error: "phone must be a valid E.164 number, for example +573241234567." }, { status: 400 });
  }

  try {
    const message = await sendWhatsAppTemplate({ to: phone, variables: body.variables });

    return Response.json(
      {
        sid: message.sid,
        status: message.status,
      },
      { status: 201 },
    );
  } catch (error) {
    const twilioError = getWhatsAppTemplateErrorDetails(error);

    logServerError("[WHATSAPP TEMPLATE] test_endpoint.failed", new Error(twilioError.message), {
      requestedBy: context.profile.userId,
      twilioError,
    });

    return Response.json(
      {
        error: twilioError.message,
        twilioError,
      },
      { status: 502 },
    );
  }
}
