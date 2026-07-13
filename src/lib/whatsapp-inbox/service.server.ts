import "server-only";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/authorization";
import { formatPhoneForWhatsApp, normalizePhoneNumber, type E164PhoneNumber } from "@/lib/phone";
import { sendWhatsAppMessage } from "@/lib/notifications/whatsapp.service";
import { logServerError, logServerInfo } from "@/lib/server/logging";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseRlsClient } from "@/lib/supabase/rls-server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_OUTBOUND_BODY_LENGTH = 4_096;

type ChannelRow = {
  id: string;
  whatsapp_phone: string;
};

type ConversationRow = {
  id: string;
  channel_id: string;
  contact_phone: string;
  contact_name: string | null;
  status: "open" | "closed";
  last_message_at: string;
  last_message_preview: string | null;
  last_message_direction: "inbound" | "outbound" | null;
  last_inbound_at: string | null;
};

type MessageRow = {
  id: string;
  direction: "inbound" | "outbound";
  twilio_message_sid: string | null;
  twilio_status: string;
  body: string;
  num_media: number;
  twilio_error_code: string | null;
  twilio_error_message: string | null;
  received_at: string | null;
  sent_at: string | null;
  created_at: string;
};

export type WhatsAppChannelSummary = {
  id: string;
  whatsappPhone: string;
};

export type WhatsAppConversationSummary = {
  id: string;
  channelId: string;
  contactPhone: string;
  contactName: string | null;
  status: "open" | "closed";
  lastMessageAt: string;
  lastMessagePreview: string | null;
  lastMessageDirection: "inbound" | "outbound" | null;
  lastInboundAt: string | null;
};

export type WhatsAppMessageSummary = {
  id: string;
  direction: "inbound" | "outbound";
  twilioMessageSid: string | null;
  twilioStatus: string;
  body: string;
  numMedia: number;
  errorCode: string | null;
  errorMessage: string | null;
  occurredAt: string;
};

export type OwnerWhatsAppInboxData = {
  channels: WhatsAppChannelSummary[];
  conversations: WhatsAppConversationSummary[];
  selectedConversation: WhatsAppConversationSummary | null;
  messages: WhatsAppMessageSummary[];
};

type TwilioInboundMessage = {
  messageSid: string;
  from: string;
  to: string;
  body: string;
  profileName: string | null;
  numMedia: number;
  status: string;
  receivedAt: string;
};

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

function getRequiredAdminClient() {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error("No fue posible acceder a la configuración interna de WhatsApp.");
  }

  return supabase;
}

async function getRequiredRlsClient() {
  const supabase = await getSupabaseRlsClient();

  if (!supabase) {
    throw new Error("No fue posible validar tu sesión para WhatsApp.");
  }

  return supabase;
}

function getUserSafeError(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

function getPublicApplicationOrigin() {
  const rawUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim();

  if (!rawUrl) {
    throw new Error("Falta configurar NEXT_PUBLIC_APP_URL para enviar respuestas de WhatsApp.");
  }

  try {
    return new URL(rawUrl).origin;
  } catch {
    throw new Error("NEXT_PUBLIC_APP_URL debe contener una URL válida.");
  }
}

export function getCanonicalTwilioWebhookUrl(request: Request) {
  const requestUrl = new URL(request.url);
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim();

  if (!configuredUrl) {
    return request.url;
  }

  try {
    return `${new URL(configuredUrl).origin}${requestUrl.pathname}${requestUrl.search}`;
  } catch {
    return request.url;
  }
}

export function getTwilioWhatsAppStatusCallbackUrl() {
  return new URL("/api/webhooks/twilio/whatsapp/status", getPublicApplicationOrigin()).toString();
}

function mapConversation(row: ConversationRow): WhatsAppConversationSummary {
  return {
    id: row.id,
    channelId: row.channel_id,
    contactPhone: row.contact_phone,
    contactName: row.contact_name,
    status: row.status,
    lastMessageAt: row.last_message_at,
    lastMessagePreview: row.last_message_preview,
    lastMessageDirection: row.last_message_direction,
    lastInboundAt: row.last_inbound_at,
  };
}

function mapMessage(row: MessageRow): WhatsAppMessageSummary {
  return {
    id: row.id,
    direction: row.direction,
    twilioMessageSid: row.twilio_message_sid,
    twilioStatus: row.twilio_status,
    body: row.body,
    numMedia: row.num_media,
    errorCode: row.twilio_error_code,
    errorMessage: row.twilio_error_message,
    occurredAt: row.received_at ?? row.sent_at ?? row.created_at,
  };
}

export async function getOwnerWhatsAppInboxData(selectedConversationId: string | null): Promise<OwnerWhatsAppInboxData> {
  await requireRole(["owner"]);
  const supabase = await getRequiredRlsClient();
  const selectedId = selectedConversationId && isUuid(selectedConversationId) ? selectedConversationId : null;

  const [channelsResult, conversationsResult, selectedResult] = await Promise.all([
    supabase
      .from("whatsapp_channels")
      .select("id, whatsapp_phone")
      .order("created_at", { ascending: true })
      .returns<ChannelRow[]>(),
    supabase
      .from("whatsapp_conversations")
      .select("id, channel_id, contact_phone, contact_name, status, last_message_at, last_message_preview, last_message_direction, last_inbound_at")
      .order("last_message_at", { ascending: false })
      .limit(100)
      .returns<ConversationRow[]>(),
    selectedId
      ? supabase
          .from("whatsapp_conversations")
          .select("id, channel_id, contact_phone, contact_name, status, last_message_at, last_message_preview, last_message_direction, last_inbound_at")
          .eq("id", selectedId)
          .maybeSingle<ConversationRow>()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const firstError = channelsResult.error ?? conversationsResult.error ?? selectedResult.error;

  if (firstError) {
    throw new Error("No fue posible cargar la bandeja de WhatsApp.");
  }

  const selectedConversation = selectedResult.data ? mapConversation(selectedResult.data) : null;

  const messagesResult = selectedConversation
    ? await supabase
        .from("whatsapp_messages")
        .select("id, direction, twilio_message_sid, twilio_status, body, num_media, twilio_error_code, twilio_error_message, received_at, sent_at, created_at")
        .eq("conversation_id", selectedConversation.id)
        .order("created_at", { ascending: true })
        .limit(250)
        .returns<MessageRow[]>()
    : { data: [], error: null };

  if (messagesResult.error) {
    throw new Error("No fue posible cargar el historial de WhatsApp.");
  }

  return {
    channels: (channelsResult.data ?? []).map((channel) => ({
      id: channel.id,
      whatsappPhone: channel.whatsapp_phone,
    })),
    conversations: (conversationsResult.data ?? []).map(mapConversation),
    selectedConversation,
    messages: (messagesResult.data ?? []).map(mapMessage),
  };
}

export async function recordTwilioInboundWhatsAppMessage(input: TwilioInboundMessage) {
  const contactPhone = normalizePhoneNumber(input.from);
  const whatsappPhone = normalizePhoneNumber(input.to);

  if (!contactPhone || !whatsappPhone || !input.messageSid.trim()) {
    throw new Error("Evento entrante de WhatsApp inválido.");
  }

  if (input.body.length > 10_000 || input.profileName && input.profileName.length > 1_000) {
    throw new Error("Evento entrante de WhatsApp excede los límites permitidos.");
  }

  const adminClient = getRequiredAdminClient();
  const { data: channel, error: channelError } = await adminClient
    .from("whatsapp_channels")
    .upsert({ whatsapp_phone: whatsappPhone }, { onConflict: "whatsapp_phone" })
    .select("id, whatsapp_phone")
    .single<ChannelRow>();

  if (channelError || !channel) {
    throw new Error("No fue posible resolver el canal de WhatsApp entrante.");
  }

  const { data, error } = await adminClient.rpc("record_whatsapp_inbound_message", {
    p_channel_id: channel.id,
    p_contact_phone: contactPhone,
    p_contact_name: input.profileName,
    p_twilio_message_sid: input.messageSid.trim(),
    p_from_address: input.from,
    p_to_address: input.to,
    p_body: input.body,
    p_num_media: input.numMedia,
    p_twilio_status: input.status,
    p_received_at: input.receivedAt,
  });

  if (error) {
    throw new Error("No fue posible guardar el mensaje entrante de WhatsApp.");
  }

  revalidatePath("/dashboard/whatsapp");
  return {
    inserted: Array.isArray(data) ? Boolean(data[0]?.inserted) : false,
  };
}

async function updateConversationAfterOutboundMessage({
  conversationId,
  sentAt,
  body,
}: {
  conversationId: string;
  sentAt: string;
  body: string;
}) {
  const adminClient = getRequiredAdminClient();
  const { error } = await adminClient
    .from("whatsapp_conversations")
    .update({
      last_message_at: sentAt,
      last_message_preview: body.slice(0, 500),
      last_message_direction: "outbound",
    })
    .eq("id", conversationId)
    .lte("last_message_at", sentAt);

  if (error) {
    throw new Error("No fue posible actualizar la conversación de WhatsApp.");
  }
}

async function recordFailedOutboundMessage({
  conversationId,
  from,
  to,
  body,
  error,
}: {
  conversationId: string;
  from: string;
  to: string;
  body: string;
  error: unknown;
}) {
  const adminClient = getRequiredAdminClient();
  const errorCode = error && typeof error === "object" && "code" in error ? String(error.code) : null;
  const errorMessage = error instanceof Error ? error.message.slice(0, 1_000) : "Twilio no aceptó el mensaje.";
  const attemptedAt = new Date().toISOString();

  const { error: persistenceError } = await adminClient.from("whatsapp_messages").insert({
    conversation_id: conversationId,
    direction: "outbound",
    twilio_status: "failed",
    from_address: from,
    to_address: to,
    body,
    num_media: 0,
    twilio_error_code: errorCode,
    twilio_error_message: errorMessage,
    twilio_status_updated_at: attemptedAt,
  });

  if (!persistenceError) {
    await updateConversationAfterOutboundMessage({ conversationId, sentAt: attemptedAt, body });
  }
}

export async function sendOwnerWhatsAppReply({
  conversationId,
  body,
}: {
  conversationId: string;
  body: string;
}) {
  await requireRole(["owner"]);

  if (!isUuid(conversationId)) {
    throw new Error("La conversación seleccionada no es válida.");
  }

  const normalizedBody = body.trim();

  if (!normalizedBody) {
    throw new Error("Escribe un mensaje antes de enviarlo.");
  }

  if (normalizedBody.length > MAX_OUTBOUND_BODY_LENGTH) {
    throw new Error(`La respuesta no puede superar ${MAX_OUTBOUND_BODY_LENGTH} caracteres.`);
  }

  const rlsClient = await getRequiredRlsClient();
  const { data: conversation, error: conversationError } = await rlsClient
    .from("whatsapp_conversations")
    .select("id, channel_id, contact_phone")
    .eq("id", conversationId)
    .maybeSingle<{ id: string; channel_id: string; contact_phone: string }>();

  if (conversationError || !conversation) {
    throw new Error("No tienes acceso a esta conversación.");
  }

  const { data: channel, error: channelError } = await rlsClient
    .from("whatsapp_channels")
    .select("id, whatsapp_phone")
    .eq("id", conversation.channel_id)
    .maybeSingle<ChannelRow>();

  if (channelError || !channel) {
    throw new Error("El canal interno de WhatsApp de esta conversación no está disponible.");
  }

  const from = formatPhoneForWhatsApp(channel.whatsapp_phone);
  const to = normalizePhoneNumber(conversation.contact_phone) as E164PhoneNumber | null;

  if (!from || !to) {
    throw new Error("La conversación no tiene números de WhatsApp válidos.");
  }

  let sentMessage: Awaited<ReturnType<typeof sendWhatsAppMessage>>;

  try {
    sentMessage = await sendWhatsAppMessage({
      from,
      to,
      body: normalizedBody,
      statusCallback: getTwilioWhatsAppStatusCallbackUrl(),
    });
  } catch (error) {
    try {
      await recordFailedOutboundMessage({
        conversationId: conversation.id,
        from,
        to: formatPhoneForWhatsApp(to)!,
        body: normalizedBody,
        error,
      });
    } catch (persistenceError) {
      logServerError("whatsapp.outbound_failure_persistence_failed", persistenceError, {
        conversationId: conversation.id,
      });
    }

    logServerError("whatsapp.outbound_send_failed", error, { conversationId: conversation.id });
    throw new Error("Twilio no pudo enviar el mensaje. El intento quedó registrado en el historial.");
  }

  const sentAt = new Date().toISOString();
  const adminClient = getRequiredAdminClient();
  const { error: messageError } = await adminClient.from("whatsapp_messages").insert({
    conversation_id: conversation.id,
    direction: "outbound",
    twilio_message_sid: sentMessage.sid,
    twilio_status: sentMessage.status ?? "queued",
    from_address: sentMessage.from ?? from,
    to_address: sentMessage.to ?? formatPhoneForWhatsApp(to)!,
    body: sentMessage.body ?? normalizedBody,
    num_media: 0,
    sent_at: sentAt,
    twilio_status_updated_at: sentAt,
  });

  if (messageError) {
    logServerError("whatsapp.outbound_persistence_failed", messageError, {
      conversationId: conversation.id,
      twilioMessageSid: sentMessage.sid,
    });
    throw new Error("Twilio aceptó el mensaje, pero no fue posible guardarlo. No lo reenvíes; revisa Twilio antes de intentarlo de nuevo.");
  }

  await updateConversationAfterOutboundMessage({
    conversationId: conversation.id,
    sentAt,
    body: sentMessage.body ?? normalizedBody,
  });

  revalidatePath("/dashboard/whatsapp");
  logServerInfo("whatsapp.outbound_sent", { conversationId: conversation.id, twilioMessageSid: sentMessage.sid });
}

export function getSafeWhatsAppActionError(error: unknown, fallback: string) {
  return getUserSafeError(error, fallback);
}
