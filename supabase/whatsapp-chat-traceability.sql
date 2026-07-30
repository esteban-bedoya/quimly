-- Quimly · Trazabilidad de mensajes de la bandeja WhatsApp.
-- Ejecuta este archivo UNA vez, después de schema.sql y notifications-mvp.sql.

alter table public.whatsapp_messages
  add column if not exists message_origin text;

alter table public.whatsapp_messages
  drop constraint if exists whatsapp_messages_message_origin_check;

alter table public.whatsapp_messages
  add constraint whatsapp_messages_message_origin_check
  check (message_origin is null or message_origin in ('scheduled', 'acknowledgement', 'manual', 'template_test'));
