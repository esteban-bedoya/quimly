import "server-only";

import { formatPhoneForWhatsApp } from "@/lib/phone";
import {
  getTwilioClient,
  getTwilioScheduledWhatsAppTemplateSid,
  getTwilioWhatsAppFrom,
  getTwilioWhatsAppTemplateSid,
} from "@/lib/notifications/twilio.client";
import type { PhoneNumber, ScheduledWhatsAppTemplateKey } from "@/lib/notifications/types";
import { logServerError, logServerInfo } from "@/lib/server/logging";

const WHATSAPP_TEMPLATE_LOG_PREFIX = "[WHATSAPP TEMPLATE]";
const SENSITIVE_LOG_KEY = /(?:authorization|auth|token|password|secret)/i;

const scheduledTemplateVariableKeys: Record<ScheduledWhatsAppTemplateKey, readonly string[]> = {
  document_expiry_reminder: ["1", "2", "3", "4", "5"],
  weekly_operational_summary: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
  trial_welcome: ["1", "2", "4"],
  trial_midpoint: ["1", "2", "4"],
  trial_expired: ["1", "2", "3"],
  founder_benefit_assigned: ["1", "2"],
};

export type WhatsAppTemplateVariables = Record<string, string>;

type SendWhatsAppTemplateInput = {
  to: PhoneNumber;
  variables: WhatsAppTemplateVariables;
  templateKey?: ScheduledWhatsAppTemplateKey;
  statusCallback?: string;
};

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

function makeSafeSerializable(value: unknown, seen = new WeakSet<object>()): unknown {
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
    return value.map((item) => makeSafeSerializable(item, seen));
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
        SENSITIVE_LOG_KEY.test(key) ? "[redacted]" : makeSafeSerializable(record[key], seen),
      ]),
    );
    seen.delete(value);
    return serialized;
  }

  return String(value);
}

export function getWhatsAppTemplateErrorDetails(error: unknown) {
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : null;
  const message = error instanceof Error
    ? error.message
    : typeof record?.message === "string"
      ? record.message
      : String(error);

  return {
    code: record?.code,
    status: record?.status,
    message: maskPhoneNumbersInText(message),
    moreInfo: record?.moreInfo,
    details: makeSafeSerializable(record?.details),
    allProperties: makeSafeSerializable(error),
  };
}

function getTemplateVariables(templateKey: ScheduledWhatsAppTemplateKey | undefined, variables: WhatsAppTemplateVariables) {
  if (!templateKey) return variables;

  const expectedKeys = scheduledTemplateVariableKeys[templateKey];
  const selectedVariables = Object.fromEntries(expectedKeys.flatMap((key) => (variables[key] === undefined ? [] : [[key, variables[key]]])));

  // Deliveries already queued before the template replacement did not include
  // the new weekly "documentos vencidos" variable. Default it safely while
  // omitting variables that no longer exist in the approved templates.
  if (templateKey === "weekly_operational_summary" && !selectedVariables["9"]) {
    selectedVariables["9"] = "Ninguno";
  }

  return selectedVariables;
}

export async function sendWhatsAppTemplate({ to, variables, templateKey, statusCallback }: SendWhatsAppTemplateInput) {
  const whatsappTo = formatPhoneForWhatsApp(to);

  if (!whatsappTo) {
    throw new Error("Twilio WhatsApp requires a valid E.164 phone number.");
  }

  const from = getTwilioWhatsAppFrom();
  const contentSid = templateKey ? getTwilioScheduledWhatsAppTemplateSid(templateKey) : getTwilioWhatsAppTemplateSid();
  const contentVariables = getTemplateVariables(templateKey, variables);

  logServerInfo(`${WHATSAPP_TEMPLATE_LOG_PREFIX} send.request`, {
    destination: maskPhoneNumber(to),
    contentSid,
    variableKeys: Object.keys(contentVariables),
  });

  try {
    const message = await getTwilioClient().messages.create({
      from,
      to: whatsappTo,
      contentSid,
      contentVariables: JSON.stringify(contentVariables),
      ...(statusCallback ? { statusCallback } : {}),
    });

    logServerInfo(`${WHATSAPP_TEMPLATE_LOG_PREFIX} send.response`, {
      destination: maskPhoneNumber(to),
      contentSid,
      messageSid: message.sid,
      status: message.status,
    });

    return {
      sid: message.sid,
      status: message.status,
      to: message.to,
      from: message.from,
    };
  } catch (error) {
    const twilioError = getWhatsAppTemplateErrorDetails(error);

    logServerError(`${WHATSAPP_TEMPLATE_LOG_PREFIX} send.failed`, new Error(twilioError.message), {
      destination: maskPhoneNumber(to),
      contentSid,
      twilioError,
    });

    throw error;
  }
}
