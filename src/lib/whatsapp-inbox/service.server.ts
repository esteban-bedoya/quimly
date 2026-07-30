import "server-only";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/authorization";
import { formatPhoneForWhatsApp, normalizePhoneNumber, type E164PhoneNumber } from "@/lib/phone";
import { sendWhatsAppMessage } from "@/lib/notifications/whatsapp.service";
import { getTwilioWhatsAppFrom } from "@/lib/notifications/twilio.client";
import { logServerError, logServerInfo } from "@/lib/server/logging";
import { dispatchChatWhatsAppSupportAlert } from "@/lib/support-notifications/dispatch.server";
import type { InboundWhatsAppSupportAlert } from "@/lib/support-notifications/types";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseRlsClient } from "@/lib/supabase/rls-server";
import type { WhatsAppInboxSyncEvent, WhatsAppInboxSyncState } from "@/types/whatsapp-inbox";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_OUTBOUND_BODY_LENGTH = 4_096;
export type WhatsAppMessageOrigin = "scheduled" | "acknowledgement" | "manual" | "template_test";

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

type ConversationReadRow = {
  conversation_id: string;
  last_read_at: string;
};

type InboxEventRow = {
  id: number;
  event_type: "inbound_message" | "outbound_message" | "message_status_updated";
  conversation_id: string;
  message_id: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  message_preview: string | null;
  is_new_conversation: boolean;
  created_at: string;
};

type InboundRecordRow = {
  conversation_id: string;
  message_id: string | null;
  inserted: boolean;
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
  isUnread: boolean;
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
  latestEventId: number;
  unreadConversationCount: number;
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

function isUnreadInbound(lastInboundAt: string | null, lastReadAt: string | null) {
  if (!lastInboundAt) {
    return false;
  }

  if (!lastReadAt) {
    return true;
  }

  return new Date(lastInboundAt).getTime() > new Date(lastReadAt).getTime();
}

function mapConversation(row: ConversationRow, lastReadAt: string | null = null): WhatsAppConversationSummary {
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
    isUnread: isUnreadInbound(row.last_inbound_at, lastReadAt),
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
  const context = await requireRole(["owner"]);
  const supabase = await getRequiredRlsClient();
  const selectedId = selectedConversationId && isUuid(selectedConversationId) ? selectedConversationId : null;

  const [channelsResult, conversationsResult, selectedResult, readsResult, latestEventResult, unreadCountResult] = await Promise.all([
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
    supabase
      .from("whatsapp_conversation_reads")
      .select("conversation_id, last_read_at")
      .eq("user_id", context.profile.userId)
      .returns<ConversationReadRow[]>(),
    supabase
      .from("whatsapp_inbox_events")
      .select("id")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: number }>(),
    supabase.rpc("get_whatsapp_unread_conversation_count").returns<number>(),
  ]);

  const firstError = channelsResult.error ?? conversationsResult.error ?? selectedResult.error ?? readsResult.error ?? latestEventResult.error ?? unreadCountResult.error;

  if (firstError) {
    throw new Error("No fue posible cargar la bandeja de WhatsApp.");
  }

  const readAtByConversationId = new Map(
    (readsResult.data ?? []).map((read) => [read.conversation_id, read.last_read_at]),
  );
  const selectedConversation = selectedResult.data
    ? mapConversation(selectedResult.data, readAtByConversationId.get(selectedResult.data.id) ?? null)
    : null;

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
    conversations: (conversationsResult.data ?? []).map((conversation) =>
      mapConversation(conversation, readAtByConversationId.get(conversation.id) ?? null),
    ),
    selectedConversation,
    messages: (messagesResult.data ?? []).map(mapMessage),
    latestEventId: latestEventResult.data?.id ?? 0,
    unreadConversationCount: Number(unreadCountResult.data) || 0,
  };
}

export async function getOwnerWhatsAppInboxSyncState(afterEventId: number): Promise<WhatsAppInboxSyncState> {
  await requireRole(["owner"]);
  const supabase = await getRequiredRlsClient();
  const safeAfterEventId = Number.isSafeInteger(afterEventId) && afterEventId >= 0 ? afterEventId : 0;
  const { data, error } = await supabase
    .from("whatsapp_inbox_events")
    .select("id, event_type, conversation_id, message_id, contact_name, contact_phone, message_preview, is_new_conversation, created_at")
    .gt("id", safeAfterEventId)
    .order("id", { ascending: true })
    .limit(50)
    .returns<InboxEventRow[]>();

  if (error) {
    throw new Error("No fue posible sincronizar la bandeja de WhatsApp.");
  }

  const events: WhatsAppInboxSyncEvent[] = (data ?? []).map((event) => ({
    id: event.id,
    type: event.event_type,
    conversationId: event.conversation_id,
    messageId: event.message_id,
    contactName: event.contact_name,
    contactPhone: event.contact_phone,
    messagePreview: event.message_preview,
    isNewConversation: event.is_new_conversation,
    occurredAt: event.created_at,
  }));

  return {
    latestEventId: events.at(-1)?.id ?? safeAfterEventId,
    events,
  };
}

export async function markOwnerWhatsAppConversationRead({
  conversationId,
  readThrough,
}: {
  conversationId: string;
  readThrough: string;
}) {
  await requireRole(["owner"]);

  if (!isUuid(conversationId) || Number.isNaN(new Date(readThrough).getTime())) {
    throw new Error("La conversación que quieres marcar como leída no es válida.");
  }

  const supabase = await getRequiredRlsClient();
  const { error } = await supabase.rpc("mark_whatsapp_conversation_read", {
    p_conversation_id: conversationId,
    p_read_through: readThrough,
  });

  if (error) {
    throw new Error("No fue posible marcar la conversación como leída.");
  }

  revalidatePath("/dashboard/whatsapp");
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

  const { data, error } = await adminClient
    .rpc("record_whatsapp_inbound_message", {
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
    })
    .returns<InboundRecordRow[]>();

  if (error) {
    throw new Error("No fue posible guardar el mensaje entrante de WhatsApp.");
  }

  const records = data as unknown as InboundRecordRow[] | null;
  const record = records?.[0] ?? null;
  const inserted = Boolean(record?.inserted);
  const inboundAlert: InboundWhatsAppSupportAlert | null =
    inserted && record?.conversation_id && record.message_id
      ? {
          conversationId: record.conversation_id,
          messageId: record.message_id,
          contactName: input.profileName,
          contactPhone,
          body: input.body,
          numMedia: input.numMedia,
          receivedAt: input.receivedAt,
        }
      : null;

  revalidatePath("/dashboard/whatsapp");
  return {
    inserted,
    inboundAlert,
  };
}

export async function recordWhatsAppInboxEventBestEffort({
  type,
  conversationId,
  messageId = null,
}: {
  type: "outbound_message" | "message_status_updated";
  conversationId: string;
  messageId?: string | null;
}) {
  try {
    const adminClient = getRequiredAdminClient();
    const { error } = await adminClient.from("whatsapp_inbox_events").insert({
      event_type: type,
      conversation_id: conversationId,
      message_id: messageId,
    });

    if (error) {
      logServerError("whatsapp.inbox_event_persistence_failed", error, {
        eventType: type,
        conversationId,
        messageId,
      });
    }
  } catch (error) {
    logServerError("whatsapp.inbox_event_persistence_failed", error, {
      eventType: type,
      conversationId,
      messageId,
    });
  }
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

export async function recordFailedOutboundMessage({
  conversationId,
  from,
  to,
  body,
  origin,
  error,
}: {
  conversationId: string;
  from: string;
  to: string;
  body: string;
  origin: WhatsAppMessageOrigin;
  error: unknown;
}) {
  const adminClient = getRequiredAdminClient();
  const errorCode = error && typeof error === "object" && "code" in error ? String(error.code) : null;
  const errorMessage = error instanceof Error ? error.message.slice(0, 1_000) : "Twilio no aceptó el mensaje.";
  const attemptedAt = new Date().toISOString();

  const { data: persistedMessage, error: persistenceError } = await adminClient
    .from("whatsapp_messages")
    .insert({
      conversation_id: conversationId,
      direction: "outbound",
      twilio_status: "failed",
      from_address: from,
      to_address: to,
      body,
      message_origin: origin,
      num_media: 0,
      twilio_error_code: errorCode,
      twilio_error_message: errorMessage,
      twilio_status_updated_at: attemptedAt,
    })
    .select("id")
    .single<{ id: string }>();

  if (!persistenceError && persistedMessage) {
    await updateConversationAfterOutboundMessage({ conversationId, sentAt: attemptedAt, body });
    await recordWhatsAppInboxEventBestEffort({
      type: "outbound_message",
      conversationId,
      messageId: persistedMessage.id,
    });
  }
}

type OutboundWhatsAppMessage = {
  sid: string;
  status?: string | null;
  to?: string | null;
  from?: string | null;
  body?: string | null;
};

export async function recordOutboundWhatsAppMessage({
  conversationId,
  message,
  fallbackBody,
  origin,
}: {
  conversationId: string;
  message: OutboundWhatsAppMessage;
  fallbackBody: string;
  origin: WhatsAppMessageOrigin;
}) {
  const sentAt = new Date().toISOString();
  const body = message.body?.trim() || fallbackBody;
  const adminClient = getRequiredAdminClient();
  const { data: persistedMessage, error: messageError } = await adminClient
    .from("whatsapp_messages")
    .insert({
      conversation_id: conversationId,
      direction: "outbound",
      twilio_message_sid: message.sid,
      twilio_status: message.status ?? "queued",
      from_address: message.from,
      to_address: message.to,
      body,
      message_origin: origin,
      num_media: 0,
      sent_at: sentAt,
      twilio_status_updated_at: sentAt,
    })
    .select("id")
    .single<{ id: string }>();

  if (messageError || !persistedMessage) {
    throw new Error("Twilio aceptó el mensaje, pero no fue posible guardarlo. No lo reenvíes; revisa Twilio antes de intentarlo de nuevo.");
  }

  await updateConversationAfterOutboundMessage({
    conversationId,
    sentAt,
    body,
  });

  await recordWhatsAppInboxEventBestEffort({
    type: "outbound_message",
    conversationId,
    messageId: persistedMessage.id,
  });

  revalidatePath("/dashboard/whatsapp");
  return persistedMessage.id;
}

export async function recordWhatsAppTemplateTestMessage({
  to,
  message,
}: {
  to: E164PhoneNumber;
  message: OutboundWhatsAppMessage;
}) {
  const senderPhone = message.from ? normalizePhoneNumber(message.from) : null;

  if (!senderPhone) {
    throw new Error("Twilio no devolvió un WhatsApp Sender válido para guardar el mensaje de prueba.");
  }

  const adminClient = getRequiredAdminClient();
  const { data: channel, error: channelError } = await adminClient
    .from("whatsapp_channels")
    .upsert({ whatsapp_phone: senderPhone }, { onConflict: "whatsapp_phone" })
    .select("id")
    .single<{ id: string }>();

  if (channelError || !channel) {
    throw new Error("No fue posible resolver el sender de WhatsApp para guardar el mensaje de prueba.");
  }

  const { data: conversation, error: conversationError } = await adminClient
    .from("whatsapp_conversations")
    .upsert(
      {
        channel_id: channel.id,
        contact_phone: to,
        last_message_at: new Date().toISOString(),
        last_message_direction: "outbound",
      },
      { onConflict: "channel_id,contact_phone" },
    )
    .select("id")
    .single<{ id: string }>();

  if (conversationError || !conversation) {
    throw new Error("No fue posible crear la conversación de WhatsApp para el mensaje de prueba.");
  }

  await recordOutboundWhatsAppMessage({
    conversationId: conversation.id,
    message,
    fallbackBody: "Plantilla de prueba de WhatsApp enviada.",
    origin: "template_test",
  });

  return conversation.id;
}

export async function recordAutomatedWhatsAppTemplateMessage({
  to,
  message,
  fallbackBody,
  origin = "scheduled",
}: {
  to: E164PhoneNumber;
  message: OutboundWhatsAppMessage;
  fallbackBody: string;
  origin?: "scheduled";
}) {
  const senderPhone = message.from ? normalizePhoneNumber(message.from) : null;

  if (!senderPhone) {
    throw new Error("Twilio no devolvió un WhatsApp Sender válido para guardar el mensaje automático.");
  }

  const adminClient = getRequiredAdminClient();
  const { data: channel, error: channelError } = await adminClient
    .from("whatsapp_channels")
    .upsert({ whatsapp_phone: senderPhone }, { onConflict: "whatsapp_phone" })
    .select("id")
    .single<{ id: string }>();

  if (channelError || !channel) {
    throw new Error("No fue posible resolver el sender de WhatsApp para el mensaje automático.");
  }

  const { data: conversation, error: conversationError } = await adminClient
    .from("whatsapp_conversations")
    .upsert(
      {
        channel_id: channel.id,
        contact_phone: to,
        last_message_at: new Date().toISOString(),
        last_message_direction: "outbound",
      },
      { onConflict: "channel_id,contact_phone" },
    )
    .select("id")
    .single<{ id: string }>();

  if (conversationError || !conversation) {
    throw new Error("No fue posible crear la conversación de WhatsApp para el mensaje automático.");
  }

  const messageId = await recordOutboundWhatsAppMessage({
    conversationId: conversation.id,
    message,
    fallbackBody,
    origin,
  });

  return { conversationId: conversation.id, messageId };
}

export async function recordFailedAutomatedWhatsAppTemplateMessage({
  to,
  fallbackBody,
  error,
}: {
  to: E164PhoneNumber;
  fallbackBody: string;
  error: unknown;
}) {
  const senderPhone = normalizePhoneNumber(getTwilioWhatsAppFrom());

  if (!senderPhone) {
    throw new Error("El WhatsApp Sender configurado no es válido para guardar el fallo automático.");
  }

  const adminClient = getRequiredAdminClient();
  const { data: channel, error: channelError } = await adminClient
    .from("whatsapp_channels")
    .upsert({ whatsapp_phone: senderPhone }, { onConflict: "whatsapp_phone" })
    .select("id")
    .single<{ id: string }>();

  if (channelError || !channel) {
    throw new Error("No fue posible resolver el sender de WhatsApp para guardar el fallo automático.");
  }

  const { data: conversation, error: conversationError } = await adminClient
    .from("whatsapp_conversations")
    .upsert(
      { channel_id: channel.id, contact_phone: to, last_message_at: new Date().toISOString(), last_message_direction: "outbound" },
      { onConflict: "channel_id,contact_phone" },
    )
    .select("id")
    .single<{ id: string }>();

  if (conversationError || !conversation) {
    throw new Error("No fue posible crear la conversación de WhatsApp para guardar el fallo automático.");
  }

  await recordFailedOutboundMessage({
    conversationId: conversation.id,
    from: getTwilioWhatsAppFrom(),
    to: `whatsapp:${to}`,
    body: fallbackBody,
    origin: "scheduled",
    error,
  });
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
    .select("id, channel_id, contact_phone, contact_name")
    .eq("id", conversationId)
    .maybeSingle<{ id: string; channel_id: string; contact_phone: string; contact_name: string | null }>();

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
        origin: "manual",
        error,
      });
    } catch (persistenceError) {
      logServerError("whatsapp.outbound_failure_persistence_failed", persistenceError, {
        conversationId: conversation.id,
      });
    }

    logServerError("whatsapp.outbound_send_failed", error, { conversationId: conversation.id });
    await dispatchChatWhatsAppSupportAlert({
      kind: "manual_reply",
      recipientName: conversation.contact_name,
      recipientPhone: to,
      body: normalizedBody,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Twilio no pudo aceptar la respuesta manual.",
    });
    throw new Error("Twilio no pudo enviar el mensaje. El intento quedó registrado en el historial.");
  }

  try {
    await recordOutboundWhatsAppMessage({
      conversationId: conversation.id,
      message: sentMessage,
      fallbackBody: normalizedBody,
      origin: "manual",
    });
  } catch (error) {
    logServerError("whatsapp.outbound_persistence_failed", error, {
      conversationId: conversation.id,
      twilioMessageSid: sentMessage.sid,
    });
    throw new Error("Twilio aceptó el mensaje, pero no fue posible guardarlo. No lo reenvíes; revisa Twilio antes de intentarlo de nuevo.");
  }

  logServerInfo("whatsapp.outbound_sent", { conversationId: conversation.id, twilioMessageSid: sentMessage.sid });
}

export function getSafeWhatsAppActionError(error: unknown, fallback: string) {
  return getUserSafeError(error, fallback);
}
