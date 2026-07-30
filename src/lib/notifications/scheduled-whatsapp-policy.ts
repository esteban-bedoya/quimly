export const SCHEDULED_WHATSAPP_MAX_ATTEMPTS = 3;
export const SCHEDULED_WHATSAPP_RETRY_DELAYS_MINUTES = [10, 30] as const;
export const SCHEDULED_WHATSAPP_RECIPIENT_SPACING_MINUTES = 5;
export const SCHEDULED_WHATSAPP_CLAIM_LIMIT = 12;

export function getScheduledWhatsAppRetryDelayMinutes(attemptCount: number) {
  return SCHEDULED_WHATSAPP_RETRY_DELAYS_MINUTES[Math.max(0, attemptCount - 1)] ?? 30;
}
