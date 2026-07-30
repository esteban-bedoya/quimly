import "server-only";

import { logServerError, logServerInfo } from "@/lib/server/logging";
import {
  sendTelegramAutomatedWhatsAppSupportAlert,
  sendTelegramChatWhatsAppSupportAlert,
  sendTelegramInboundWhatsAppSupportAlert,
} from "@/lib/support-notifications/telegram.service.server";
import type { AutomatedWhatsAppSupportAlert, ChatWhatsAppSupportAlert, InboundWhatsAppSupportAlert } from "@/lib/support-notifications/types";

export async function dispatchInboundWhatsAppSupportAlert(alert: InboundWhatsAppSupportAlert) {
  try {
    const result = await sendTelegramInboundWhatsAppSupportAlert(alert);

    if (result.status === "sent") {
      logServerInfo("support_alert.telegram_sent", {
        conversationId: alert.conversationId,
        messageId: alert.messageId,
      });
    }
  } catch (error) {
    logServerError("support_alert.telegram_failed", error, {
      conversationId: alert.conversationId,
      messageId: alert.messageId,
    });
  }
}

export async function dispatchAutomatedWhatsAppSupportAlert(alert: AutomatedWhatsAppSupportAlert) {
  try {
    const result = await sendTelegramAutomatedWhatsAppSupportAlert(alert);

    if (result.status === "sent") {
      logServerInfo("support_alert.telegram_automated_message_sent", {
        notificationType: alert.notificationType,
        status: alert.status,
      });
    }
  } catch (error) {
    logServerError("support_alert.telegram_automated_message_failed", error, {
      notificationType: alert.notificationType,
      status: alert.status,
    });
  }
}

export async function dispatchChatWhatsAppSupportAlert(alert: ChatWhatsAppSupportAlert) {
  try {
    const result = await sendTelegramChatWhatsAppSupportAlert(alert);

    if (result.status === "sent") {
      logServerInfo("support_alert.telegram_chat_message_sent", { kind: alert.kind, status: alert.status });
    }
  } catch (error) {
    logServerError("support_alert.telegram_chat_message_failed", error, { kind: alert.kind, status: alert.status });
  }
}
