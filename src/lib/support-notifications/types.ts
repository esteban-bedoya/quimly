export type InboundWhatsAppSupportAlert = {
  conversationId: string;
  messageId: string;
  contactName: string | null;
  contactPhone: string;
  body: string;
  numMedia: number;
  receivedAt: string;
};

export type AutomatedWhatsAppSupportAlert = {
  notificationType: string;
  recipientName: string | null;
  recipientPhone: string;
  restaurantName: string;
  branchName: string;
  body: string;
  status: "accepted" | "retry_scheduled" | "failed";
  errorMessage?: string | null;
};

export type TelegramSupportAlertResult =
  | { provider: "telegram"; status: "sent" }
  | { provider: "telegram"; status: "skipped"; reason: "not_configured" };
