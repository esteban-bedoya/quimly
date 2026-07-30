import "server-only";

import { formatPhoneForWhatsApp, normalizePhoneNumber } from "@/lib/phone";
import { getTwilioClient } from "@/lib/notifications/twilio.client";
import { sendWhatsAppContentTemplate } from "@/lib/notifications/whatsapp.service";
import { logServerError, logServerInfo } from "@/lib/server/logging";
import { dispatchChatWhatsAppSupportAlert } from "@/lib/support-notifications/dispatch.server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getTwilioWhatsAppStatusCallbackUrl,
  recordFailedOutboundMessage,
  recordOutboundWhatsAppMessage,
} from "@/lib/whatsapp-inbox/service.server";

const ACKNOWLEDGEMENT_TEMPLATE_CONTENT_SID = "HXde19a620325c1cd755fb5f557faeb104";
const ACKNOWLEDGEMENT_TEMPLATE_INTERVAL_MS = 24 * 60 * 60 * 1_000;
const ACKNOWLEDGEMENT_TEMPLATE_FALLBACK_BODY = "Plantilla automática de atención enviada.";

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
      const content = await getTwilioClient().content.v1.contents(ACKNOWLEDGEMENT_TEMPLATE_CONTENT_SID).fetch();
      cachedAcknowledgementTemplateBody = extractTemplateBody(content.types);
    }

    if (cachedAcknowledgementTemplateBody) {
      return renderTemplateBody(cachedAcknowledgementTemplateBody, variables);
    }
  } catch (error) {
    logServerError("whatsapp.acknowledgement_template_content_lookup_failed", error);
  }

  return ACKNOWLEDGEMENT_TEMPLATE_FALLBACK_BODY;
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

    const to = normalizePhoneNumber(conversation.contact_phone);
    const from = formatPhoneForWhatsApp(channel.whatsapp_phone);

    if (!to || !from) {
      throw new Error("La conversación no tiene números de WhatsApp válidos.");
    }

    const contactName = conversation.contact_name?.trim() || "Cliente";
    const fallbackBody = await getAcknowledgementTemplateBody({ "1": contactName });
    let sentMessage: Awaited<ReturnType<typeof sendWhatsAppContentTemplate>>;

    try {
      sentMessage = await sendWhatsAppContentTemplate({
        from,
        to,
        contentSid: ACKNOWLEDGEMENT_TEMPLATE_CONTENT_SID,
        contentVariables: { "1": contactName },
        statusCallback: getTwilioWhatsAppStatusCallbackUrl(),
      });
    } catch (error) {
      try {
        await recordFailedOutboundMessage({
          conversationId: conversation.id,
          from,
          to: formatPhoneForWhatsApp(to)!,
          body: fallbackBody,
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
        body: fallbackBody,
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

    const { data: updatedConversation, error: updateError } = await adminClient
      .from("whatsapp_conversations")
      .update({ last_ack_template_sent_at: new Date().toISOString() })
      .eq("id", conversation.id)
      .or(`last_ack_template_sent_at.is.null,last_ack_template_sent_at.lte.${threshold}`)
      .select("id")
      .maybeSingle<{ id: string }>();

    if (updateError || !updatedConversation) {
      throw updateError ?? new Error("No fue posible registrar el envío de la plantilla.");
    }

    logServerInfo("whatsapp.acknowledgement_template_sent", {
      conversationId: conversation.id,
      twilioMessageSid: sentMessage.sid,
    });
  } catch (error) {
    logServerError("whatsapp.acknowledgement_template_failed", error, { conversationId });
  }
}
