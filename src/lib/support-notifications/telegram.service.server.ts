import "server-only";

import { getTelegramSupportAlertConfig } from "@/lib/support-notifications/telegram.config.server";
import type {
  AutomatedWhatsAppSupportAlert,
  InboundWhatsAppSupportAlert,
  TelegramSupportAlertResult,
} from "@/lib/support-notifications/types";

function formatMessageText(alert: InboundWhatsAppSupportAlert) {
  if (alert.body.trim()) {
    return alert.body.trim();
  }

  return alert.numMedia > 0 ? `Mensaje multimedia (${alert.numMedia})` : "Mensaje sin texto";
}

function formatTelegramMessage(alert: InboundWhatsAppSupportAlert) {
  const contactName = alert.contactName?.trim() || "Cliente sin nombre";
  const text = formatMessageText(alert).slice(0, 3_500);

  return [
    "🔔 Nuevo mensaje de WhatsApp",
    "",
    `Cliente: ${contactName}`,
    `Teléfono: ${alert.contactPhone}`,
    "",
    "Mensaje:",
    text,
  ].join("\n");
}

async function sendTelegramMessage(text: string): Promise<TelegramSupportAlertResult> {
  const config = getTelegramSupportAlertConfig();

  if (!config) {
    return { provider: "telegram", status: "skipped", reason: "not_configured" };
  }

  const response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({
      chat_id: config.chatId,
      text,
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Telegram respondió con estado ${response.status}.`);
  }

  return { provider: "telegram", status: "sent" };
}

export async function sendTelegramInboundWhatsAppSupportAlert(
  alert: InboundWhatsAppSupportAlert,
): Promise<TelegramSupportAlertResult> {
  return sendTelegramMessage(formatTelegramMessage(alert));
}

export async function sendTelegramAutomatedWhatsAppSupportAlert(alert: AutomatedWhatsAppSupportAlert) {
  const recipientName = alert.recipientName?.trim() || "Cliente sin nombre";
  const statusLabel = alert.status === "sent" ? "enviado" : "falló";
  const lines = [
    `📤 Mensaje automático de WhatsApp ${statusLabel}`,
    "",
    `Tipo: ${alert.notificationType}`,
    `Cliente: ${recipientName}`,
    `Teléfono: ${alert.recipientPhone}`,
    `Restaurante: ${alert.restaurantName}`,
    `Sede: ${alert.branchName}`,
    "",
    "Mensaje:",
    alert.body.slice(0, 3_000),
  ];

  if (alert.errorMessage) {
    lines.push("", `Error: ${alert.errorMessage.slice(0, 500)}`);
  }

  return sendTelegramMessage(lines.join("\n"));
}
