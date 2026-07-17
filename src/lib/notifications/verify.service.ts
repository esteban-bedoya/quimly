import "server-only";

import { getTwilioClient, getTwilioVerifyServiceSid } from "@/lib/notifications/twilio.client";
import type { OTPCheckResult, PhoneNumber } from "@/lib/notifications/types";
import { normalizePhoneNumber } from "@/lib/phone";
import { logServerError, logServerInfo } from "@/lib/server/logging";

const VERIFY_DEBUG_PREFIX = "[VERIFY DEBUG]";

function maskPhoneNumber(phone: string) {
  if (phone.length <= 5) {
    return "*".repeat(phone.length);
  }

  const visiblePrefixLength = Math.min(6, phone.length - 3);
  const visibleSuffixLength = Math.min(3, phone.length - visiblePrefixLength);
  const maskedLength = Math.max(1, phone.length - visiblePrefixLength - visibleSuffixLength);

  return `${phone.slice(0, visiblePrefixLength)}${"*".repeat(maskedLength)}${phone.slice(-visibleSuffixLength)}`;
}

function maskPhoneNumbersInText(value: string) {
  return value.replace(/\+[1-9]\d{6,14}/g, maskPhoneNumber);
}

function makeVerifyDebugSerializable(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return maskPhoneNumbersInText(value);
  }

  if (value === undefined) {
    return "[undefined]";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "function" || typeof value === "symbol") {
    return `[${typeof value}]`;
  }

  if (Array.isArray(value)) {
    return value.map((item) => makeVerifyDebugSerializable(item, seen));
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      return "[circular]";
    }

    seen.add(value);

    const record = value as Record<string, unknown>;
    const serialized = Object.fromEntries(
      Object.getOwnPropertyNames(record).map((key) => [
        key,
        key === "to" && typeof record[key] === "string"
          ? maskPhoneNumber(record[key])
          : makeVerifyDebugSerializable(record[key], seen),
      ]),
    );

    seen.delete(value);
    return serialized;
  }

  return String(value);
}

function getVerifyErrorDebugDetails(error: unknown) {
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : null;

  return {
    code: record?.code,
    status: record?.status,
    message: error instanceof Error ? error.message : record?.message ?? String(error),
    moreInfo: record?.moreInfo,
    details: makeVerifyDebugSerializable(record?.details),
    allProperties: makeVerifyDebugSerializable(error),
  };
}

function normalizeVerifyPhoneNumber(phone: PhoneNumber) {
  const normalizedPhone = normalizePhoneNumber(phone);

  if (!normalizedPhone) {
    throw new Error("Twilio Verify requires a valid E.164 phone number.");
  }

  return normalizedPhone;
}

export async function sendOTP(phone: PhoneNumber) {
  const to = normalizeVerifyPhoneNumber(phone);
  const verifyServiceSid = getTwilioVerifyServiceSid();
  const verificationRequest = {
    to,
    channel: "whatsapp",
    locale: "es",
  };

  logServerInfo(`${VERIFY_DEBUG_PREFIX} verify.create.request`, {
    destination: maskPhoneNumber(to),
    verifyServiceSid,
    requestedChannel: verificationRequest.channel,
    requestParameters: makeVerifyDebugSerializable(verificationRequest),
    relevantConfiguration: {
      twilioAccountSid: process.env.TWILIO_ACCOUNT_SID?.trim() || null,
      verifyServiceSid,
      verifyServiceSidEnvironmentVariableConfigured: Boolean(process.env.TWILIO_VERIFY_SERVICE_SID?.trim()),
      whatsappFromEnvironmentVariableConfigured: Boolean(process.env.TWILIO_WHATSAPP_FROM?.trim()),
      whatsappFromUsedByVerify: false,
      requestedChannel: verificationRequest.channel,
      requestedLocale: verificationRequest.locale,
    },
  });

  try {
    const verification = await getTwilioClient().verify.v2.services(verifyServiceSid).verifications.create(verificationRequest);
    const verificationResponse = makeVerifyDebugSerializable(verification.toJSON()) as Record<string, unknown>;

    logServerInfo(`${VERIFY_DEBUG_PREFIX} verify.create.response`, {
      destination: maskPhoneNumber(to),
      verificationResponse,
      verificationSid: verification.sid,
      status: verification.status,
      returnedChannel: verification.channel,
      whatsapp: {
        returnedChannelIsWhatsApp: verification.channel === "whatsapp",
      },
      sms: {
        returnedChannelIsSms: verification.channel === "sms",
      },
      fallback: {
        responseHasFallbackField: Object.prototype.hasOwnProperty.call(verificationResponse, "fallback"),
        responseFallback: verificationResponse.fallback ?? null,
      },
      metadata: {
        sendCodeAttempts: verificationResponse.sendCodeAttempts ?? null,
        lookup: verificationResponse.lookup ?? null,
        sna: verificationResponse.sna ?? null,
        url: verificationResponse.url ?? null,
        accountSid: verificationResponse.accountSid ?? null,
        serviceSid: verificationResponse.serviceSid ?? null,
        dateCreated: verificationResponse.dateCreated ?? null,
        dateUpdated: verificationResponse.dateUpdated ?? null,
      },
    });

    return {
      sid: verification.sid,
      status: verification.status,
      to,
    };
  } catch (error) {
    logServerError(`${VERIFY_DEBUG_PREFIX} verify.create.failed`, error, {
      destination: maskPhoneNumber(to),
      verifyServiceSid,
      requestedChannel: verificationRequest.channel,
      requestParameters: makeVerifyDebugSerializable(verificationRequest),
      twilioError: getVerifyErrorDebugDetails(error),
    });

    throw error;
  }
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
