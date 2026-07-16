export type InboundWhatsAppSupportAlert = {
  conversationId: string;
  messageId: string;
  contactName: string | null;
  contactPhone: string;
  body: string;
  numMedia: number;
  receivedAt: string;
};

export type TelegramSupportAlertResult =
  | { provider: "telegram"; status: "sent" }
  | { provider: "telegram"; status: "skipped"; reason: "not_configured" };
