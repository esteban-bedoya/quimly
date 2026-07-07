import "server-only";

import { getTwilioClient, getTwilioWhatsAppFrom } from "@/lib/notifications/twilio.client";
import type { PhoneNumber, WhatsAppMessageInput } from "@/lib/notifications/types";
import { formatPhoneForWhatsApp } from "@/lib/phone";

function normalizeWhatsAppPhoneNumber(phone: PhoneNumber) {
  const normalizedPhone = formatPhoneForWhatsApp(phone);

  if (!normalizedPhone) {
    throw new Error("Twilio WhatsApp requires a valid E.164 phone number.");
  }

  return normalizedPhone;
}

export async function sendWhatsAppMessage({ to, body }: WhatsAppMessageInput) {
  const message = await getTwilioClient().messages.create({
    from: getTwilioWhatsAppFrom(),
    to: normalizeWhatsAppPhoneNumber(to),
    body,
  });

  return {
    sid: message.sid,
    status: message.status,
    to: message.to,
    from: message.from,
    body: message.body,
  };
}
