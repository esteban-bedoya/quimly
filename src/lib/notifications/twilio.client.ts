import "server-only";

import twilio from "twilio";

import type { ScheduledWhatsAppTemplateKey } from "@/lib/notifications/types";

type TwilioClient = ReturnType<typeof twilio>;

let cachedClient: TwilioClient | null = null;

const twilioConfigKeys = {
  accountSid: "TWILIO_ACCOUNT_SID",
  authToken: "TWILIO_AUTH_TOKEN",
  whatsappFrom: "TWILIO_WHATSAPP_FROM",
  whatsappTemplateSid: "TWILIO_WHATSAPP_TEMPLATE_SID",
  verifyServiceSid: "TWILIO_VERIFY_SERVICE_SID",
} as const;

type TwilioConfigKey = keyof typeof twilioConfigKeys;
type TwilioEnvKey = (typeof twilioConfigKeys)[TwilioConfigKey];

function readEnv(key: TwilioConfigKey) {
  return process.env[twilioConfigKeys[key]]?.trim() || null;
}

export function getMissingTwilioConfigKeys(keys: TwilioConfigKey[] = Object.keys(twilioConfigKeys) as TwilioConfigKey[]) {
  return keys.map((key) => (!readEnv(key) ? twilioConfigKeys[key] : null)).filter((key): key is TwilioEnvKey => Boolean(key));
}

function requireTwilioConfig(keys: TwilioConfigKey[]) {
  const missingKeys = getMissingTwilioConfigKeys(keys);

  if (missingKeys.length > 0) {
    throw new Error(`Missing Twilio configuration: ${missingKeys.join(", ")}`);
  }
}

export function getTwilioClient() {
  requireTwilioConfig(["accountSid", "authToken"]);

  if (!cachedClient) {
    cachedClient = twilio(readEnv("accountSid")!, readEnv("authToken")!);
  }

  return cachedClient;
}

export function getTwilioWhatsAppFrom() {
  requireTwilioConfig(["whatsappFrom"]);
  return readEnv("whatsappFrom")!;
}

export function getTwilioWhatsAppTemplateSid() {
  requireTwilioConfig(["whatsappTemplateSid"]);
  return readEnv("whatsappTemplateSid")!;
}

const scheduledTemplateEnvKeys: Record<ScheduledWhatsAppTemplateKey, string> = {
  document_expiry_reminder: "TWILIO_WHATSAPP_DOCUMENT_EXPIRY_TEMPLATE_SID",
  weekly_operational_summary: "TWILIO_WHATSAPP_WEEKLY_SUMMARY_TEMPLATE_SID",
  trial_welcome: "TWILIO_WHATSAPP_TRIAL_WELCOME_TEMPLATE_SID",
  trial_midpoint: "TWILIO_WHATSAPP_TRIAL_MIDPOINT_TEMPLATE_SID",
  trial_expired: "TWILIO_WHATSAPP_TRIAL_EXPIRED_TEMPLATE_SID",
  founder_benefit_assigned: "TWILIO_WHATSAPP_FOUNDER_BENEFIT_TEMPLATE_SID",
};

export function getTwilioScheduledWhatsAppTemplateSid(templateKey: ScheduledWhatsAppTemplateKey) {
  const environmentKey = scheduledTemplateEnvKeys[templateKey];
  const contentSid = process.env[environmentKey]?.trim();

  if (!contentSid) {
    throw new Error(`Missing Twilio configuration: ${environmentKey}`);
  }

  return contentSid;
}

export function getTwilioAuthToken() {
  requireTwilioConfig(["authToken"]);
  return readEnv("authToken")!;
}

export function getTwilioVerifyServiceSid() {
  const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID?.trim();

  if (!verifyServiceSid) {
    throw new Error("Missing Twilio configuration: TWILIO_VERIFY_SERVICE_SID");
  }

  return verifyServiceSid;
}
