import "server-only";

import { logServerError, logServerInfo } from "@/lib/server/logging";
import {
  sendTelegramAutomatedWhatsAppSupportAlert,
  sendTelegramInboundWhatsAppSupportAlert,
} from "@/lib/support-notifications/telegram.service.server";
import type { AutomatedWhatsAppSupportAlert, InboundWhatsAppSupportAlert } from "@/lib/support-notifications/types";

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
