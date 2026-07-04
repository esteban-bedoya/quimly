import "server-only";

import { getTwilioClient, getTwilioVerifyServiceSid } from "@/lib/notifications/twilio.client";
import type { OTPCheckResult, PhoneNumber } from "@/lib/notifications/types";
import { normalizePhoneNumber } from "@/lib/phone";

function normalizeVerifyPhoneNumber(phone: PhoneNumber) {
  const normalizedPhone = normalizePhoneNumber(phone);

  if (!normalizedPhone) {
    throw new Error("Verify phone number must be E.164 or a Colombian mobile number.");
  }

  return normalizedPhone;
}

export async function sendOTP(phone: PhoneNumber) {
  const to = normalizeVerifyPhoneNumber(phone);
  const verifyServiceSid = getTwilioVerifyServiceSid();

  const verification = await getTwilioClient().verify.v2.services(verifyServiceSid).verifications.create({
    to,
    channel: "whatsapp",
    locale: "en",
  });

  return {
    sid: verification.sid,
    status: verification.status,
    to,
  };
}

export async function checkOTP(phone: PhoneNumber, code: string): Promise<OTPCheckResult> {
  const to = normalizeVerifyPhoneNumber(phone);
  const verificationCheck = await getTwilioClient().verify.v2.services(getTwilioVerifyServiceSid()).verificationChecks.create({
    to,
    code,
  });

  return {
    sid: verificationCheck.sid,
    status: verificationCheck.status,
    approved: verificationCheck.status === "approved",
    to,
  };
}
