import type { E164PhoneNumber } from "@/lib/phone";

export type PhoneNumber = E164PhoneNumber;

export type NotificationType = "otp" | "trial_reminder" | "subscription_expired";

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
};

export type OTPCheckResult = {
  to: PhoneNumber;
  sid: string;
  status: string;
  approved: boolean;
};
