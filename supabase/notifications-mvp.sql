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
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'delivered', 'failed')),
  twilio_message_sid text unique,
  twilio_status text,
  whatsapp_message_id uuid references public.whatsapp_messages (id) on delete set null,
  error_message text,
  scheduled_for timestamptz not null default now(),
  next_attempt_at timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_attempt_at timestamptz,
  processing_started_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  telegram_failure_notified_for_sid text,
  telegram_delivery_notified_for_sid text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_notification_deliveries_recipient_phone_e164 check (public.is_e164_phone(recipient_phone))
);

create index if not exists whatsapp_notification_deliveries_company_created_idx
on public.whatsapp_notification_deliveries (company_id, created_at desc);

create index if not exists whatsapp_notification_deliveries_status_created_idx
on public.whatsapp_notification_deliveries (status, created_at desc);

create index if not exists whatsapp_notification_deliveries_due_idx
on public.whatsapp_notification_deliveries (next_attempt_at, scheduled_for)
where status = 'pending';

create index if not exists whatsapp_notification_deliveries_processing_recovery_idx
on public.whatsapp_notification_deliveries (processing_started_at)
where status = 'processing' and twilio_message_sid is null;

drop trigger if exists set_whatsapp_notification_deliveries_updated_at on public.whatsapp_notification_deliveries;
create trigger set_whatsapp_notification_deliveries_updated_at
before update on public.whatsapp_notification_deliveries
for each row
execute function public.set_updated_at();

alter table public.whatsapp_notification_deliveries enable row level security;
revoke all on table public.whatsapp_notification_deliveries from public, anon, authenticated;
grant select, insert, update, delete on table public.whatsapp_notification_deliveries to service_role;

create or replace function public.claim_due_whatsapp_notification_deliveries(p_limit integer default 6)
returns setof public.whatsapp_notification_deliveries
language sql
security definer
set search_path = public
as $$
  with candidates as (
    select id
    from public.whatsapp_notification_deliveries
    where (
      status = 'pending'
      and next_attempt_at <= now()
    ) or (
      status = 'processing'
      and twilio_message_sid is null
      and processing_started_at <= now() - interval '15 minutes'
    )
    order by scheduled_for asc, created_at asc
    limit least(greatest(coalesce(p_limit, 6), 1), 50)
    for update skip locked
  ), claimed as (
    update public.whatsapp_notification_deliveries deliveries
    set
      status = 'processing',
      attempt_count = deliveries.attempt_count + 1,
      last_attempt_at = now(),
      processing_started_at = now(),
      error_message = null
    from candidates
    where deliveries.id = candidates.id
    returning deliveries.*
  )
  select * from claimed;
$$;

revoke all on function public.claim_due_whatsapp_notification_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_due_whatsapp_notification_deliveries(integer) to service_role;

-- Configuración del cron: se ejecuta cada cinco minutos. A partir de las 8:00 a. m.
-- Colombia crea las entregas; los mensajes coincidentes se escalonan automáticamente.
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
  '*/5 * * * *',
  $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'quimly_notification_app_url')
        || '/api/cron/whatsapp-notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'quimly_notification_cron_secret')
      ),
      body := jsonb_build_object('scheduled_at', now()),
      timeout_milliseconds := 65000
    );
  $cron$
);

-- Verificación rápida del job creado.
select jobid, jobname, schedule, active
from cron.job
where jobname = 'dispatch_whatsapp_notifications_8am_colombia';
