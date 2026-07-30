-- Quimly · Notificaciones de WhatsApp para el MVP
-- Ejecuta este archivo completo una sola vez en Supabase SQL Editor.

create table if not exists public.whatsapp_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  branch_id uuid references public.branches (id) on delete set null,
  recipient_user_id uuid not null references public.user_profiles (user_id) on delete restrict,
  recipient_phone text not null,
  notification_type text not null check (
    notification_type in (
      'document_expiry_reminder',
      'weekly_operational_summary',
      'trial_welcome',
      'trial_midpoint',
      'trial_expired',
      'founder_benefit_assigned'
    )
  ),
  template_key text not null check (
    template_key in (
      'document_expiry_reminder',
      'weekly_operational_summary',
      'trial_welcome',
      'trial_midpoint',
      'trial_expired',
      'founder_benefit_assigned'
    )
  ),
  deduplication_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  twilio_message_sid text unique,
  twilio_status text,
  whatsapp_message_id uuid references public.whatsapp_messages (id) on delete set null,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_notification_deliveries_recipient_phone_e164 check (public.is_e164_phone(recipient_phone))
);

create index if not exists whatsapp_notification_deliveries_company_created_idx
on public.whatsapp_notification_deliveries (company_id, created_at desc);

create index if not exists whatsapp_notification_deliveries_status_created_idx
on public.whatsapp_notification_deliveries (status, created_at desc);

drop trigger if exists set_whatsapp_notification_deliveries_updated_at on public.whatsapp_notification_deliveries;
create trigger set_whatsapp_notification_deliveries_updated_at
before update on public.whatsapp_notification_deliveries
for each row
execute function public.set_updated_at();

alter table public.whatsapp_notification_deliveries enable row level security;
revoke all on table public.whatsapp_notification_deliveries from public, anon, authenticated;
grant select, insert, update, delete on table public.whatsapp_notification_deliveries to service_role;

-- Configuración del cron: 8:00 a. m. hora de Colombia = 13:00 UTC.
-- Reemplaza los dos valores antes de ejecutar esta sección. No guardes esos
-- secretos en el repositorio ni en archivos versionados.
create extension if not exists pg_net;
create extension if not exists pg_cron with schema extensions;

-- Ejecuta estas dos líneas una sola vez, con tus valores reales.
-- select vault.create_secret('https://TU-DOMINIO-QUIMLY', 'quimly_notification_app_url');
-- select vault.create_secret('GENERA_UN_SECRETO_LARGO_Y_ALEATORIO', 'quimly_notification_cron_secret');

-- Cuando los dos secretos existan en Vault, ejecuta este bloque.
select cron.unschedule(jobid)
from cron.job
where jobname = 'dispatch_whatsapp_notifications_8am_colombia';

select cron.schedule(
  'dispatch_whatsapp_notifications_8am_colombia',
  '0 13 * * *',
  $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'quimly_notification_app_url')
        || '/api/cron/whatsapp-notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'quimly_notification_cron_secret')
      ),
      body := jsonb_build_object('scheduled_at', now()),
      timeout_milliseconds := 10000
    );
  $cron$
);

-- Verificación rápida del job creado.
select jobid, jobname, schedule, active
from cron.job
where jobname = 'dispatch_whatsapp_notifications_8am_colombia';
