-- Quimly · Refuerzo de confiabilidad de notificaciones WhatsApp.
-- Ejecuta este archivo UNA vez, después de notifications-mvp.sql.

alter table public.whatsapp_notification_deliveries
  add column if not exists scheduled_for timestamptz,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists processing_started_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists telegram_failure_notified_for_sid text;

update public.whatsapp_notification_deliveries
set
  scheduled_for = coalesce(scheduled_for, created_at),
  next_attempt_at = coalesce(next_attempt_at, created_at)
where scheduled_for is null or next_attempt_at is null;

alter table public.whatsapp_notification_deliveries
  alter column scheduled_for set not null,
  alter column next_attempt_at set not null;

alter table public.whatsapp_notification_deliveries
  drop constraint if exists whatsapp_notification_deliveries_status_check;

alter table public.whatsapp_notification_deliveries
  add constraint whatsapp_notification_deliveries_status_check
  check (status in ('pending', 'processing', 'sent', 'delivered', 'failed'));

alter table public.whatsapp_notification_deliveries
  drop constraint if exists whatsapp_notification_deliveries_attempt_count_check;

alter table public.whatsapp_notification_deliveries
  add constraint whatsapp_notification_deliveries_attempt_count_check
  check (attempt_count >= 0);

create index if not exists whatsapp_notification_deliveries_due_idx
on public.whatsapp_notification_deliveries (next_attempt_at, scheduled_for)
where status = 'pending';

create index if not exists whatsapp_notification_deliveries_processing_recovery_idx
on public.whatsapp_notification_deliveries (processing_started_at)
where status = 'processing' and twilio_message_sid is null;

create or replace function public.claim_due_whatsapp_notification_deliveries(p_limit integer default 12)
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
    limit least(greatest(coalesce(p_limit, 12), 1), 50)
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

-- Un solo cron frecuente: encola a partir de las 8:00 a. m. Colombia,
-- despacha el primero a las 8:00 y separa los mensajes coincidentes 5 minutos.
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

select jobid, jobname, schedule, active
from cron.job
where jobname = 'dispatch_whatsapp_notifications_8am_colombia';
