import "server-only";

import { notificationTemplates } from "@/lib/notifications/templates";
import type { NotificationDeliveryResult, OTPCheckResult, PhoneNumber } from "@/lib/notifications/types";
import { checkOTP as checkVerifyOTP, sendOTP as sendVerifyOTP } from "@/lib/notifications/verify.service";
import { sendWhatsAppMessage } from "@/lib/notifications/whatsapp.service";

export class NotificationService {
  async sendTrialReminder(phone: PhoneNumber, days: number): Promise<NotificationDeliveryResult> {
    const message = await sendWhatsAppMessage({
      to: phone,
      body: notificationTemplates.trial_reminder(days),
    });

    return {
      type: "trial_reminder",
      channel: "whatsapp",
      to: phone,
      sid: message.sid,
      status: message.status,
    };
  }

  async sendSubscriptionExpired(phone: PhoneNumber): Promise<NotificationDeliveryResult> {
    const message = await sendWhatsAppMessage({
      to: phone,
      body: notificationTemplates.subscription_expired(),
    });

    return {
      type: "subscription_expired",
      channel: "whatsapp",
      to: phone,
      sid: message.sid,
      status: message.status,
    };
  }

  async sendOTP(phone: PhoneNumber): Promise<NotificationDeliveryResult> {
    const verification = await sendVerifyOTP(phone);

    return {
      type: "otp",
      channel: "verify",
      to: phone,
      sid: verification.sid,
      status: verification.status,
    };
  }

  async checkOTP(phone: PhoneNumber, code: string): Promise<OTPCheckResult> {
    return checkVerifyOTP(phone, code);
  }
}

export const notificationService = new NotificationService();
