export const SCHEDULED_WHATSAPP_MAX_ATTEMPTS = 3;
export const SCHEDULED_WHATSAPP_RETRY_DELAYS_MINUTES = [10, 30] as const;
export const SCHEDULED_WHATSAPP_RECIPIENT_SPACING_MINUTES = 5;
// Six deliveries in groups of three keep a cron invocation comfortably below
// the serverless timeout even when Twilio or Telegram is slow. Any backlog is
// drained on the next five-minute invocation.
export const SCHEDULED_WHATSAPP_CLAIM_LIMIT = 6;

export function getScheduledWhatsAppRetryDelayMinutes(attemptCount: number) {
  return SCHEDULED_WHATSAPP_RETRY_DELAYS_MINUTES[Math.max(0, attemptCount - 1)] ?? 30;
}
