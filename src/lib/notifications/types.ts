import type { E164PhoneNumber } from "@/lib/phone";

export type PhoneNumber = E164PhoneNumber;

export type NotificationType = "otp" | "trial_reminder" | "subscription_expired";

export const scheduledWhatsAppTemplateKeys = [
  "document_expiry_reminder",
  "weekly_operational_summary",
  "trial_welcome",
  "trial_midpoint",
  "trial_expired",
  "founder_benefit_assigned",
] as const;

export type ScheduledWhatsAppTemplateKey = (typeof scheduledWhatsAppTemplateKeys)[number];

export type NotificationChannel = "whatsapp" | "verify";

export type NotificationDeliveryResult = {
  type: NotificationType;
  channel: NotificationChannel;
  to: PhoneNumber;
  sid: string;
  status?: string;
};

export type WhatsAppMessageInput = {
  to: PhoneNumber;
  body: string;
  from?: string;
  statusCallback?: string;
};

export type WhatsAppContentTemplateInput = {
  to: PhoneNumber;
  contentSid: string;
  contentVariables: Record<string, string>;
  from?: string;
  statusCallback?: string;
};

export type OTPCheckResult = {
  to: PhoneNumber;
  sid: string;
  status: string;
  approved: boolean;
};
