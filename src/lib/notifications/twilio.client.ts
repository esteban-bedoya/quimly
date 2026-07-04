import "server-only";

import twilio from "twilio";

type TwilioClient = ReturnType<typeof twilio>;

let cachedClient: TwilioClient | null = null;

const twilioConfigKeys = {
  accountSid: "TWILIO_ACCOUNT_SID",
  authToken: "TWILIO_AUTH_TOKEN",
  whatsappFrom: "TWILIO_WHATSAPP_FROM",
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

export function getTwilioVerifyServiceSid() {
  const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID?.trim();

  if (!verifyServiceSid) {
    throw new Error("Missing Twilio configuration: TWILIO_VERIFY_SERVICE_SID");
  }

  return verifyServiceSid;
}
