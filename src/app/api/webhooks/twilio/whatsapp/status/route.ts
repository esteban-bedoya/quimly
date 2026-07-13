import twilio from "twilio";

import { revalidatePath } from "next/cache";

import { getTwilioAuthToken } from "@/lib/notifications/twilio.client";
import { logServerError, logServerInfo } from "@/lib/server/logging";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCanonicalTwilioWebhookUrl } from "@/lib/whatsapp-inbox/service.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asTwilioParams(formData: FormData) {
  const params: Record<string, string> = {};

  formData.forEach((value, key) => {
    if (typeof value === "string") {
      params[key] = value;
    }
  });

  return params;
}

function getString(params: Record<string, string>, key: string) {
  return params[key] ?? "";
}

export async function POST(request: Request) {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Invalid webhook payload." }, { status: 400 });
  }

  const params = asTwilioParams(formData);
  const signature = request.headers.get("x-twilio-signature") ?? "";
  let signatureValid = false;

  try {
    signatureValid = Boolean(
      signature && twilio.validateRequest(getTwilioAuthToken(), signature, getCanonicalTwilioWebhookUrl(request), params),
    );
  } catch (error) {
    logServerError("whatsapp.status_signature_validation_failed", error);
  }

  if (!signatureValid) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const messageSid = getString(params, "MessageSid").trim();
  const messageStatus = getString(params, "MessageStatus").trim();

  if (!messageSid || !messageStatus) {
    return Response.json({ error: "Missing status fields." }, { status: 400 });
  }

  const adminClient = getSupabaseAdminClient();

  if (!adminClient) {
    logServerError("whatsapp.status_admin_client_missing", new Error("Supabase Admin no configurado."), {
      twilioMessageSid: messageSid,
    });
    return Response.json({ error: "Unable to process webhook." }, { status: 500 });
  }

  const errorCode = getString(params, "ErrorCode").trim() || null;
  const errorMessage = getString(params, "ErrorMessage").trim().slice(0, 1_000) || null;
  const { error } = await adminClient
    .from("whatsapp_messages")
    .update({
      twilio_status: messageStatus,
      twilio_error_code: errorCode,
      twilio_error_message: errorMessage,
      twilio_status_updated_at: new Date().toISOString(),
    })
    .eq("twilio_message_sid", messageSid)
    .eq("direction", "outbound");

  if (error) {
    logServerError("whatsapp.status_update_failed", error, { twilioMessageSid: messageSid, messageStatus });
    return Response.json({ error: "Unable to process webhook." }, { status: 500 });
  }

  revalidatePath("/dashboard/whatsapp");
  logServerInfo("whatsapp.status_processed", { twilioMessageSid: messageSid, messageStatus });
  return Response.json({ ok: true });
}
