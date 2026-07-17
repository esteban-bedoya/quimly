import twilio from "twilio";
import { after } from "next/server";

import { getTwilioAuthToken } from "@/lib/notifications/twilio.client";
import { logServerError, logServerInfo } from "@/lib/server/logging";
import { dispatchInboundWhatsAppSupportAlert } from "@/lib/support-notifications/dispatch.server";
import { sendAcknowledgementTemplateIfNeeded } from "@/lib/whatsapp-inbox/acknowledgement-template.dispatcher.server";
import {
  getCanonicalTwilioWebhookUrl,
  recordTwilioInboundWhatsAppMessage,
} from "@/lib/whatsapp-inbox/service.server";

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

function getNonNegativeInteger(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function twimlResponse() {
  return new Response("<Response />", {
    status: 200,
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
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
    logServerError("whatsapp.inbound_signature_validation_failed", error);
  }

  if (!signatureValid) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const messageSid = getString(params, "MessageSid").trim();
  const from = getString(params, "From");
  const to = getString(params, "To");

  if (!messageSid || !from || !to) {
    return Response.json({ error: "Missing message fields." }, { status: 400 });
  }

  try {
    const result = await recordTwilioInboundWhatsAppMessage({
      messageSid,
      from,
      to,
      body: getString(params, "Body"),
      profileName: getString(params, "ProfileName").trim() || null,
      numMedia: getNonNegativeInteger(getString(params, "NumMedia")),
      status: getString(params, "SmsStatus").trim() || "received",
      receivedAt: new Date().toISOString(),
    });

    logServerInfo("whatsapp.inbound_processed", {
      twilioMessageSid: messageSid,
      inserted: result.inserted,
    });

    const inboundAlert = result.inboundAlert;

    if (inboundAlert) {
      after(() =>
        Promise.all([
          dispatchInboundWhatsAppSupportAlert(inboundAlert),
          sendAcknowledgementTemplateIfNeeded({ conversationId: inboundAlert.conversationId }),
        ]),
      );
    }

    return twimlResponse();
  } catch (error) {
    logServerError("whatsapp.inbound_processing_failed", error, { twilioMessageSid: messageSid });
    return Response.json({ error: "Unable to process webhook." }, { status: 500 });
  }
}
