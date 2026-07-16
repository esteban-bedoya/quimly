import "server-only";

import { logServerError, logServerInfo } from "@/lib/server/logging";
import { sendTelegramInboundWhatsAppSupportAlert } from "@/lib/support-notifications/telegram.service.server";
import type { InboundWhatsAppSupportAlert } from "@/lib/support-notifications/types";

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
