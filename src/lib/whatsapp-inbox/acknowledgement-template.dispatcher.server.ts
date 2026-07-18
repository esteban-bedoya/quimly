import "server-only";

import { formatPhoneForWhatsApp, normalizePhoneNumber } from "@/lib/phone";
import { sendWhatsAppContentTemplate } from "@/lib/notifications/whatsapp.service";
import { logServerError, logServerInfo } from "@/lib/server/logging";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getTwilioWhatsAppStatusCallbackUrl,
  recordOutboundWhatsAppMessage,
} from "@/lib/whatsapp-inbox/service.server";

const ACKNOWLEDGEMENT_TEMPLATE_CONTENT_SID = "HXde19a620325c1cd755fb5f557faeb104";
const ACKNOWLEDGEMENT_TEMPLATE_INTERVAL_MS = 24 * 60 * 60 * 1_000;

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
    const sentMessage = await sendWhatsAppContentTemplate({
      from,
      to,
      contentSid: ACKNOWLEDGEMENT_TEMPLATE_CONTENT_SID,
      contentVariables: { "1": contactName },
      statusCallback: getTwilioWhatsAppStatusCallbackUrl(),
    });

    await recordOutboundWhatsAppMessage({
      conversationId: conversation.id,
      message: sentMessage,
      fallbackBody: "Plantilla automática de atención enviada.",
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
