-- Quimly · Trazabilidad de mensajes de la bandeja WhatsApp.
-- Ejecuta este archivo UNA vez, después de schema.sql y notifications-mvp.sql.

alter table public.whatsapp_messages
  add column if not exists message_origin text,
  add column if not exists telegram_delivery_notified_for_sid text,
  add column if not exists telegram_failure_notified_for_sid text;

alter table public.whatsapp_notification_deliveries
  add column if not exists telegram_delivery_notified_for_sid text;

alter table public.whatsapp_messages
  drop constraint if exists whatsapp_messages_message_origin_check;

alter table public.whatsapp_messages
  add constraint whatsapp_messages_message_origin_check
  check (message_origin is null or message_origin in ('scheduled', 'document_expiry_reminder', 'weekly_operational_summary', 'trial_welcome', 'trial_midpoint', 'trial_expired', 'founder_benefit_assigned', 'acknowledgement', 'manual', 'template_test'));
