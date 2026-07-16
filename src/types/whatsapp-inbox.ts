export type WhatsAppInboxSyncEvent = {
  id: number;
  type: "inbound_message" | "outbound_message" | "message_status_updated";
  conversationId: string;
  messageId: string | null;
  contactName: string | null;
  contactPhone: string | null;
  messagePreview: string | null;
  isNewConversation: boolean;
  occurredAt: string;
};

export type WhatsAppInboxSyncState = {
  latestEventId: number;
  events: WhatsAppInboxSyncEvent[];
};
