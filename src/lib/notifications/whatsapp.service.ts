import "server-only";

import { getTwilioClient, getTwilioWhatsAppFrom } from "@/lib/notifications/twilio.client";
import type { PhoneNumber, WhatsAppContentTemplateInput, WhatsAppMessageInput } from "@/lib/notifications/types";
import { formatPhoneForWhatsApp } from "@/lib/phone";

function normalizeWhatsAppPhoneNumber(phone: PhoneNumber) {
  const normalizedPhone = formatPhoneForWhatsApp(phone);

  if (!normalizedPhone) {
    throw new Error("Twilio WhatsApp requires a valid E.164 phone number.");
  }

  return normalizedPhone;
}

export async function sendWhatsAppMessage({ to, body, from, statusCallback }: WhatsAppMessageInput) {
  const message = await getTwilioClient().messages.create({
    from: from ?? getTwilioWhatsAppFrom(),
    to: normalizeWhatsAppPhoneNumber(to),
    body,
    ...(statusCallback ? { statusCallback } : {}),
  });

  return {
    sid: message.sid,
    status: message.status,
    to: message.to,
    from: message.from,
    body: message.body,
  };
}

export async function sendWhatsAppContentTemplate({
  to,
  contentSid,
  contentVariables,
  from,
  statusCallback,
}: WhatsAppContentTemplateInput) {
  const message = await getTwilioClient().messages.create({
    from: from ?? getTwilioWhatsAppFrom(),
    to: normalizeWhatsAppPhoneNumber(to),
    contentSid,
    contentVariables: JSON.stringify(contentVariables),
    ...(statusCallback ? { statusCallback } : {}),
  });

  return {
    sid: message.sid,
    status: message.status,
    to: message.to,
    from: message.from,
    body: message.body,
  };
}
