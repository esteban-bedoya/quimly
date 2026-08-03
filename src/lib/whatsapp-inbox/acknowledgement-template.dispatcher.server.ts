import "server-only";

import { formatPhoneForWhatsApp, normalizePhoneNumber } from "@/lib/phone";
import { getTwilioClient, getTwilioWhatsAppTemplateSid } from "@/lib/notifications/twilio.client";
import { sendWhatsAppContentTemplate } from "@/lib/notifications/whatsapp.service";
import { logServerError, logServerInfo } from "@/lib/server/logging";
import { dispatchChatWhatsAppSupportAlert } from "@/lib/support-notifications/dispatch.server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getTwilioWhatsAppStatusCallbackUrl,
  recordFailedOutboundMessage,
  recordOutboundWhatsAppMessage,
} from "@/lib/whatsapp-inbox/service.server";

const ACKNOWLEDGEMENT_TEMPLATE_INTERVAL_MS = 24 * 60 * 60 * 1_000;
const ACKNOWLEDGEMENT_TEMPLATE_TRACE_FAILURE_BODY = "No se envió la confirmación automática porque no fue posible recuperar el contenido de la plantilla configurada.";

let cachedAcknowledgementTemplateBody: string | null = null;

type ConversationRow = {
  id: string;
  channel_id: string;
  contact_name: string | null;
  contact_phone: string;
};

type ChannelRow = {
  whatsapp_phone: string;
};

function getAcknowledgementTemplateThreshold() {
  return new Date(Date.now() - ACKNOWLEDGEMENT_TEMPLATE_INTERVAL_MS).toISOString();
}

function extractTemplateBody(types: Record<string, object>) {
  for (const content of Object.values(types)) {
    if ("body" in content && typeof content.body === "string" && content.body.trim()) {
      return content.body;
    }
  }

  return null;
}

function renderTemplateBody(body: string, variables: Record<string, string>) {
  return body.replace(/{{\s*(\d+)\s*}}/g, (placeholder, index: string) => variables[index] ?? placeholder);
}

async function getAcknowledgementTemplateBody(variables: Record<string, string>) {
  try {
    if (!cachedAcknowledgementTemplateBody) {
      const content = await getTwilioClient().content.v1.contents(getTwilioWhatsAppTemplateSid()).fetch();
      cachedAcknowledgementTemplateBody = extractTemplateBody(content.types);
    }

    if (cachedAcknowledgementTemplateBody) {
      return renderTemplateBody(cachedAcknowledgementTemplateBody, variables);
    }
  } catch (error) {
    logServerError("whatsapp.acknowledgement_template_content_lookup_failed", error);
    throw error;
  }

  throw new Error("La plantilla de acuse configurada no tiene un cuerpo de texto compatible.");
}

export async function sendAcknowledgementTemplateIfNeeded({ conversationId }: { conversationId: string }) {
  try {
    const adminClient = getSupabaseAdminClient();

    if (!adminClient) {
      throw new Error("Supabase Admin no configurado.");
    }

    const threshold = getAcknowledgementTemplateThreshold();
    const { data: conversation, error: conversationError } = await adminClient
      .from("whatsapp_conversations")
      .select("id, channel_id, contact_name, contact_phone")
      .eq("id", conversationId)
      .or(`last_ack_template_sent_at.is.null,last_ack_template_sent_at.lte.${threshold}`)
      .maybeSingle<ConversationRow>();

    if (conversationError) {
      throw conversationError;
    }

    if (!conversation) {
      return;
    }

    const { data: channel, error: channelError } = await adminClient
      .from("whatsapp_channels")
      .select("whatsapp_phone")
      .eq("id", conversation.channel_id)
      .maybeSingle<ChannelRow>();

    if (channelError || !channel) {
      throw channelError ?? new Error("Canal de WhatsApp no disponible.");
    }

    if (conversation.contact_phone === channel.whatsapp_phone) {
      return;
    }

    // Claim the 24-hour acknowledgement slot before calling Twilio. Two inbound
    // webhooks can arrive together, and only the caller that wins this atomic
    // update is allowed to send the template.
    const acknowledgementClaimedAt = new Date().toISOString();
    const { data: claimedConversation, error: claimError } = await adminClient
      .from("whatsapp_conversations")
      .update({ last_ack_template_sent_at: acknowledgementClaimedAt })
      .eq("id", conversation.id)
      .or(`last_ack_template_sent_at.is.null,last_ack_template_sent_at.lte.${threshold}`)
      .select("id")
      .maybeSingle<{ id: string }>();

    if (claimError) {
      throw claimError;
    }

    if (!claimedConversation) {
      return;
    }

    const to = normalizePhoneNumber(conversation.contact_phone);
    const from = formatPhoneForWhatsApp(channel.whatsapp_phone);

    if (!to || !from) {
      throw new Error("La conversación no tiene números de WhatsApp válidos.");
    }

    const contactName = conversation.contact_name?.trim() || "Cliente";
    let fallbackBody = "";
    let sentMessage: Awaited<ReturnType<typeof sendWhatsAppContentTemplate>>;

    try {
      // We fetch the body from Twilio before sending so the inbox stores the
      // exact approved text, including the rendered contact-name variable.
      fallbackBody = await getAcknowledgementTemplateBody({ "1": contactName });
      sentMessage = await sendWhatsAppContentTemplate({
        from,
        to,
        contentSid: getTwilioWhatsAppTemplateSid(),
        contentVariables: { "1": contactName },
        statusCallback: getTwilioWhatsAppStatusCallbackUrl(),
      });
    } catch (error) {
      const { error: releaseClaimError } = await adminClient
        .from("whatsapp_conversations")
        .update({ last_ack_template_sent_at: null })
        .eq("id", conversation.id)
        .eq("last_ack_template_sent_at", acknowledgementClaimedAt);

      if (releaseClaimError) {
        logServerError("whatsapp.acknowledgement_template_claim_release_failed", releaseClaimError, {
          conversationId: conversation.id,
        });
      }

      try {
        await recordFailedOutboundMessage({
          conversationId: conversation.id,
          from,
          to: formatPhoneForWhatsApp(to)!,
          body: fallbackBody || ACKNOWLEDGEMENT_TEMPLATE_TRACE_FAILURE_BODY,
          origin: "acknowledgement",
          error,
        });
      } catch (persistenceError) {
        logServerError("whatsapp.acknowledgement_template_failure_persistence_failed", persistenceError, {
          conversationId: conversation.id,
        });
      }
      await dispatchChatWhatsAppSupportAlert({
        kind: "acknowledgement",
        recipientName: conversation.contact_name,
        recipientPhone: conversation.contact_phone,
        body: fallbackBody || ACKNOWLEDGEMENT_TEMPLATE_TRACE_FAILURE_BODY,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Twilio no pudo aceptar el acuse automático.",
      });
      throw error;
    }

    try {
      await recordOutboundWhatsAppMessage({
        conversationId: conversation.id,
        message: sentMessage,
        fallbackBody,
        origin: "acknowledgement",
      });
    } catch (error) {
      logServerError("whatsapp.acknowledgement_template_persistence_failed", error, {
        conversationId: conversation.id,
        twilioMessageSid: sentMessage.sid,
      });
      throw error;
    }

    await dispatchChatWhatsAppSupportAlert({
      kind: "acknowledgement",
      recipientName: conversation.contact_name,
      recipientPhone: conversation.contact_phone,
      body: fallbackBody,
      status: "accepted",
    });

    logServerInfo("whatsapp.acknowledgement_template_sent", {
      conversationId: conversation.id,
      twilioMessageSid: sentMessage.sid,
    });
  } catch (error) {
    logServerError("whatsapp.acknowledgement_template_failed", error, { conversationId });
  }
}
