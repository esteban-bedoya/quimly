import twilio from "twilio";

import { revalidatePath } from "next/cache";

import { getTwilioAuthToken } from "@/lib/notifications/twilio.client";
import { SCHEDULED_WHATSAPP_MAX_ATTEMPTS, getScheduledWhatsAppRetryDelayMinutes } from "@/lib/notifications/scheduled-whatsapp-policy";
import { logServerError, logServerInfo } from "@/lib/server/logging";
import { dispatchAutomatedWhatsAppSupportAlert, dispatchChatWhatsAppSupportAlert } from "@/lib/support-notifications/dispatch.server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getCanonicalTwilioWebhookUrl,
  recordWhatsAppInboxEventBestEffort,
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

type NotificationDeliveryRow = {
  id: string;
  notification_type: string;
  attempt_count: number;
  payload: unknown;
};

type WhatsAppMessageStatusRow = {
  id: string;
  conversation_id: string;
  message_origin: string | null;
  body: string;
  to_address: string;
};

function getTelegramAlertPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = payload as {
    fallbackBody?: unknown;
    telegram?: {
      recipientName?: unknown;
      recipientPhone?: unknown;
      restaurantName?: unknown;
      branchName?: unknown;
    };
  };
  const telegram = value.telegram;

  if (
    typeof value.fallbackBody !== "string" ||
    !telegram ||
    typeof telegram.recipientPhone !== "string" ||
    typeof telegram.restaurantName !== "string" ||
    typeof telegram.branchName !== "string"
  ) {
    return null;
  }

  return {
    body: value.fallbackBody,
    recipientName: typeof telegram.recipientName === "string" ? telegram.recipientName : null,
    recipientPhone: telegram.recipientPhone,
    restaurantName: telegram.restaurantName,
    branchName: telegram.branchName,
  };
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
  const { data: updatedMessages, error } = await adminClient
    .from("whatsapp_messages")
    .update({
      twilio_status: messageStatus,
      twilio_error_code: errorCode,
      twilio_error_message: errorMessage,
      twilio_status_updated_at: new Date().toISOString(),
    })
    .eq("twilio_message_sid", messageSid)
    .eq("direction", "outbound")
    .select("id, conversation_id, message_origin, body, to_address")
    .returns<WhatsAppMessageStatusRow[]>();

  if (error) {
    logServerError("whatsapp.status_update_failed", error, { twilioMessageSid: messageSid, messageStatus });
    return Response.json({ error: "Unable to process webhook." }, { status: 500 });
  }

  const normalizedStatus = messageStatus.toLowerCase();
  const isFinalFailure = normalizedStatus === "failed" || normalizedStatus === "undelivered";
  const isDelivered = normalizedStatus === "delivered" || normalizedStatus === "read";
  const { data: notificationDeliveries, error: notificationDeliveryLookupError } = await adminClient
    .from("whatsapp_notification_deliveries")
    .select("id, notification_type, attempt_count, payload")
    .eq("twilio_message_sid", messageSid)
    .returns<NotificationDeliveryRow[]>();

  if (notificationDeliveryLookupError) {
    logServerError("whatsapp.notification_delivery_status_lookup_failed", notificationDeliveryLookupError, { twilioMessageSid: messageSid, messageStatus });
  } else if (isFinalFailure) {
    await Promise.all(
      (notificationDeliveries ?? []).map(async (delivery) => {
        const terminal = delivery.attempt_count >= SCHEDULED_WHATSAPP_MAX_ATTEMPTS;
        const nextAttemptAt = new Date(Date.now() + getScheduledWhatsAppRetryDelayMinutes(delivery.attempt_count) * 60_000).toISOString();
        const { data: notifiedDelivery, error: updateError } = await adminClient
          .from("whatsapp_notification_deliveries")
          .update({
            status: terminal ? "failed" : "pending",
            twilio_status: messageStatus,
            error_message: errorMessage ?? `Twilio reportó ${messageStatus}.`,
            next_attempt_at: terminal ? new Date().toISOString() : nextAttemptAt,
            telegram_failure_notified_for_sid: messageSid,
          })
          .eq("id", delivery.id)
          .is("telegram_failure_notified_for_sid", null)
          .select("id")
          .maybeSingle<{ id: string }>();

        if (updateError) {
          logServerError("whatsapp.notification_delivery_failure_update_failed", updateError, { deliveryId: delivery.id, twilioMessageSid: messageSid });
          return;
        }

        if (!notifiedDelivery) {
          return;
        }

        const alert = getTelegramAlertPayload(delivery.payload);
        if (alert) {
          await dispatchAutomatedWhatsAppSupportAlert({
            notificationType: delivery.notification_type,
            ...alert,
            status: terminal ? "failed" : "retry_scheduled",
            errorMessage: errorMessage ?? `Twilio reportó ${messageStatus}.`,
          });
        }
      }),
    );
  } else {
    const { error: notificationDeliveryError } = await adminClient
      .from("whatsapp_notification_deliveries")
      .update({
        status: isDelivered ? "delivered" : "sent",
        twilio_status: messageStatus,
        error_message: errorMessage,
        ...(isDelivered ? { delivered_at: new Date().toISOString() } : {}),
      })
      .eq("twilio_message_sid", messageSid);

    if (notificationDeliveryError) {
      logServerError("whatsapp.notification_delivery_status_update_failed", notificationDeliveryError, { twilioMessageSid: messageSid, messageStatus });
    }
  }

  if (isDelivered && !notificationDeliveryLookupError) {
    await Promise.all(
      (notificationDeliveries ?? []).map(async (delivery) => {
        const { data: notifiedDelivery, error: updateError } = await adminClient
          .from("whatsapp_notification_deliveries")
          .update({ telegram_delivery_notified_for_sid: messageSid })
          .eq("id", delivery.id)
          .is("telegram_delivery_notified_for_sid", null)
          .select("id")
          .maybeSingle<{ id: string }>();

        if (updateError) {
          logServerError("whatsapp.notification_delivery_delivered_notification_update_failed", updateError, {
            deliveryId: delivery.id,
            twilioMessageSid: messageSid,
          });
          return;
        }

        if (!notifiedDelivery) {
          return;
        }

        const alert = getTelegramAlertPayload(delivery.payload);
        if (alert) {
          await dispatchAutomatedWhatsAppSupportAlert({
            notificationType: delivery.notification_type,
            ...alert,
            status: "delivered",
          });
        }
      }),
    );
  }

  if (isDelivered || isFinalFailure) {
    await Promise.all(
      (updatedMessages ?? [])
        .filter((message) => message.message_origin === "manual" || message.message_origin === "acknowledgement")
        .map(async (message) => {
          // Successful manual messages stay in the inbox only. Automatic acknowledgements
          // are also surfaced in Telegram once Twilio confirms delivery.
          if (isDelivered && message.message_origin === "manual") {
            return;
          }

          const markerColumn = isDelivered
            ? "telegram_delivery_notified_for_sid"
            : "telegram_failure_notified_for_sid";
          const { data: notifiedMessage, error: updateError } = await adminClient
            .from("whatsapp_messages")
            .update({ [markerColumn]: messageSid })
            .eq("id", message.id)
            .is(markerColumn, null)
            .select("id")
            .maybeSingle<{ id: string }>();

          if (updateError) {
            logServerError("whatsapp.message_status_telegram_marker_update_failed", updateError, {
              messageId: message.id,
              twilioMessageSid: messageSid,
              messageStatus,
            });
            return;
          }

          if (!notifiedMessage) {
            return;
          }

          await dispatchChatWhatsAppSupportAlert({
            kind: message.message_origin === "manual" ? "manual_reply" : "acknowledgement",
            recipientName: null,
            recipientPhone: message.to_address,
            body: message.body,
            status: isDelivered ? "delivered" : "failed",
            ...(isFinalFailure ? { errorMessage: errorMessage ?? `Twilio reportó ${messageStatus}.` } : {}),
          });
        }),
    );
  }

  await Promise.all(
    (updatedMessages ?? []).map((message) =>
      recordWhatsAppInboxEventBestEffort({
        type: "message_status_updated",
        conversationId: message.conversation_id,
        messageId: message.id,
      }),
    ),
  );

  revalidatePath("/dashboard/whatsapp");
  logServerInfo("whatsapp.status_processed", { twilioMessageSid: messageSid, messageStatus });
  return Response.json({ ok: true });
}
