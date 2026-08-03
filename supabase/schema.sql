create extension if not exists pgcrypto;
create extension if not exists unaccent;

create or replace function public.is_e164_phone(phone_value text)
returns boolean
language sql
immutable
as $$
  select phone_value is not null
    and char_length(btrim(phone_value)) between 2 and 16
    and left(btrim(phone_value), 1) = '+'
    and substring(btrim(phone_value) from 2 for 1) <> '0'
    and translate(substring(btrim(phone_value) from 2), '0123456789', '') = '';
$$;

create or replace function public.normalize_legacy_phone_to_e164(raw_phone text)
returns text
language plpgsql
immutable
as $$
declare
  cleaned_phone text;
  phone_digits text;
  candidate_phone text;
begin
  cleaned_phone := btrim(coalesce(raw_phone, ''));

  if cleaned_phone = '' then
    return null;
  end if;

  cleaned_phone := btrim(replace(lower(cleaned_phone), 'whatsapp:', ''));

  if public.is_e164_phone(cleaned_phone) then
    return cleaned_phone;
  end if;

  phone_digits := translate(cleaned_phone, ' +()-.', '');

  if translate(phone_digits, '0123456789', '') <> '' then
    return cleaned_phone;
  end if;

  if left(phone_digits, 2) = '00' then
    candidate_phone := '+' || substring(phone_digits from 3);
  elsif char_length(phone_digits) = 10 then
    candidate_phone := '+57' || phone_digits;
  elsif char_length(phone_digits) = 12 and left(phone_digits, 2) = '57' then
    candidate_phone := '+' || phone_digits;
  else
    candidate_phone := cleaned_phone;
  end if;

  return candidate_phone;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'app_role'
  ) then
    create type public.app_role as enum ('owner', 'super_admin', 'company_admin');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'whatsapp_conversation_status'
  ) then
    create type public.whatsapp_conversation_status as enum ('open', 'closed');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'whatsapp_message_direction'
  ) then
    create type public.whatsapp_message_direction as enum ('inbound', 'outbound');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'billing_intent_type'
  ) then
    create type public.billing_intent_type as enum (
      'activation',
      'upgrade',
      'downgrade',
      'payment_method_update',
      'recovery',
      'cancellation'
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'billing_intent_status'
  ) then
    create type public.billing_intent_status as enum (
      'created',
      'awaiting_customer',
      'awaiting_payment',
      'processing',
      'succeeded',
      'failed',
      'cancelled',
      'expired',
      'compensation_required'
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'billing_invoice_status'
  ) then
    create type public.billing_invoice_status as enum (
      'unknown',
      'scheduled',
      'pending',
      'processing',
      'paid',
      'failed',
      'cancelled'
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'billing_payment_status'
  ) then
    create type public.billing_payment_status as enum (
      'unknown',
      'pending',
      'approved',
      'rejected',
      'cancelled',
      'refunded',
      'charged_back'
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'billing_webhook_processing_status'
  ) then
    create type public.billing_webhook_processing_status as enum (
      'received',
      'processing',
      'processed',
      'failed',
      'ignored'
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'billing_reconciliation_mode'
  ) then
    create type public.billing_reconciliation_mode as enum ('scheduled', 'manual');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'billing_reconciliation_status'
  ) then
    create type public.billing_reconciliation_status as enum (
      'running',
      'completed',
      'failed',
      'cancelled'
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'company_subscription_status'
  ) then
    create type public.company_subscription_status as enum ('trial', 'active', 'payment_issue', 'suspended', 'cancelled');
  end if;
end $$;

alter type public.company_subscription_status add value if not exists 'trial';
alter type public.company_subscription_status add value if not exists 'payment_issue';
alter type public.company_subscription_status add value if not exists 'suspended';
alter type public.company_subscription_status add value if not exists 'cancelled';

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'company_plan_type'
  ) then
    create type public.company_plan_type as enum ('founder', 'operational');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'payment_method_status'
  ) then
    create type public.payment_method_status as enum ('pending', 'configured');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'site_status'
  ) then
    create type public.site_status as enum ('active', 'inactive', 'deleted');
  end if;
end $$;

alter type public.site_status add value if not exists 'deleted';

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'branch_catalog_status'
  ) then
    create type public.branch_catalog_status as enum ('active', 'inactive', 'archived');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'refrigeration_equipment_type'
  ) then
    create type public.refrigeration_equipment_type as enum ('refrigerator', 'freezer');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'subscription_capacity_change_type'
  ) then
    create type public.subscription_capacity_change_type as enum ('upgrade', 'downgrade');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'subscription_capacity_change_status'
  ) then
    create type public.subscription_capacity_change_status as enum ('scheduled', 'applied', 'cancelled');
  end if;
end $$;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  is_active boolean not null default true,
  company_admin_user_id uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_slug_format check (slug = lower(slug))
);

create table if not exists public.whatsapp_channels (
  id uuid primary key default gen_random_uuid(),
  whatsapp_phone text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_channels_phone_e164 check (public.is_e164_phone(whatsapp_phone))
);

create table if not exists public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.whatsapp_channels (id) on delete cascade,
  contact_phone text not null,
  contact_name text,
  status public.whatsapp_conversation_status not null default 'open',
  last_message_at timestamptz not null default now(),
  last_message_preview text,
  last_message_direction public.whatsapp_message_direction,
  last_inbound_at timestamptz,
  last_ack_template_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_conversations_contact_phone_e164 check (public.is_e164_phone(contact_phone)),
  constraint whatsapp_conversations_channel_contact_unique unique (channel_id, contact_phone)
);

create index if not exists whatsapp_conversations_last_message_idx
on public.whatsapp_conversations (last_message_at desc);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.whatsapp_conversations (id) on delete cascade,
  direction public.whatsapp_message_direction not null,
  twilio_message_sid text unique,
  twilio_status text not null,
  from_address text not null,
  to_address text not null,
  body text not null default '',
  message_origin text check (message_origin is null or message_origin in ('scheduled', 'document_expiry_reminder', 'weekly_operational_summary', 'trial_welcome', 'trial_midpoint', 'trial_expired', 'founder_benefit_assigned', 'acknowledgement', 'manual', 'template_test')),
  num_media integer not null default 0,
  twilio_error_code text,
  twilio_error_message text,
  notification_attempt integer,
  notification_max_attempts integer,
  notification_next_attempt_at timestamptz,
  telegram_delivery_notified_for_sid text,
  telegram_failure_notified_for_sid text,
  received_at timestamptz,
  sent_at timestamptz,
  twilio_status_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_messages_num_media_check check (num_media >= 0),
  constraint whatsapp_messages_inbound_sid_check check (
    direction <> 'inbound' or twilio_message_sid is not null
  )
);

create index if not exists whatsapp_messages_conversation_created_idx
on public.whatsapp_messages (conversation_id, created_at asc);

create table if not exists public.whatsapp_conversation_reads (
  conversation_id uuid not null references public.whatsapp_conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  last_read_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.whatsapp_inbox_events (
  id bigint generated always as identity primary key,
  event_type text not null check (event_type in ('inbound_message', 'outbound_message', 'message_status_updated')),
  conversation_id uuid not null references public.whatsapp_conversations (id) on delete cascade,
  message_id uuid references public.whatsapp_messages (id) on delete cascade,
  contact_name text,
  contact_phone text,
  message_preview text,
  is_new_conversation boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.company_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies (id) on delete cascade,
  status public.company_subscription_status not null default 'trial',
  plan_type public.company_plan_type not null default 'operational',
  trial_started_at timestamptz not null default now(),
  trial_ends_at timestamptz not null default (now() + interval '14 days'),
  current_period_started_at timestamptz,
  current_period_ends_at timestamptz,
  billing_cycle_anchor_at timestamptz,
  base_monthly_price_cop integer not null default 24900,
  additional_site_monthly_price_cop integer not null default 9900,
  included_active_sites integer not null default 1,
  max_active_locations integer not null default 1,
  currency char(3) not null default 'COP',
  payment_provider text not null default 'mercado_pago',
  payment_method_status public.payment_method_status not null default 'pending',
  payment_attention_required boolean not null default false,
  last_payment_issue_at timestamptz,
  payment_grace_ends_at timestamptz,
  last_successful_payment_at timestamptz,
  cancellation_requested_at timestamptz,
  cancellation_effective_at timestamptz,
  mercado_pago_customer_id text,
  mercado_pago_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_subscriptions_id_company_unique unique (id, company_id),
  constraint company_subscriptions_trial_period_check check (trial_ends_at > trial_started_at),
  constraint company_subscriptions_currency_check check (currency = 'COP'),
  constraint company_subscriptions_period_dates_check check (
    (current_period_started_at is null and current_period_ends_at is null)
    or (
      current_period_started_at is not null
      and current_period_ends_at is not null
      and current_period_started_at < current_period_ends_at
    )
  ),
  constraint company_subscriptions_grace_check check (
    payment_grace_ends_at is null
    or (
      current_period_ends_at is not null
      and payment_grace_ends_at >= current_period_ends_at
    )
  ),
  constraint company_subscriptions_payment_attention_check check (
    payment_attention_required = false
    or last_payment_issue_at is not null
  ),
  constraint company_subscriptions_prices_check check (
    base_monthly_price_cop >= 0
    and additional_site_monthly_price_cop >= 0
    and included_active_sites >= 1
    and max_active_locations >= included_active_sites
  ),
  constraint company_subscriptions_payment_provider_check check (payment_provider = 'mercado_pago')
);

create table if not exists public.subscription_capacity_changes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  subscription_id uuid not null,
  current_max_active_locations integer not null,
  requested_max_active_locations integer not null,
  change_type public.subscription_capacity_change_type not null,
  status public.subscription_capacity_change_status not null default 'scheduled',
  effective_at timestamptz not null,
  requested_by uuid references auth.users (id) on delete set null,
  applied_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint subscription_capacity_changes_capacity_check check (
    current_max_active_locations >= 1
    and requested_max_active_locations >= 1
    and current_max_active_locations <> requested_max_active_locations
  ),
  constraint subscription_capacity_changes_type_check check (
    (change_type = 'upgrade' and requested_max_active_locations > current_max_active_locations)
    or (change_type = 'downgrade' and requested_max_active_locations < current_max_active_locations)
  ),
  constraint subscription_capacity_changes_status_dates_check check (
    (status = 'applied' and applied_at is not null and cancelled_at is null)
    or (status = 'cancelled' and cancelled_at is not null and applied_at is null)
    or (status = 'scheduled' and applied_at is null and cancelled_at is null)
  ),
  constraint subscription_capacity_changes_subscription_company_fk
    foreign key (subscription_id, company_id)
    references public.company_subscriptions (id, company_id)
    on delete cascade
);

create index if not exists subscription_capacity_changes_company_status_idx
on public.subscription_capacity_changes (company_id, status, effective_at desc);

create unique index if not exists subscription_capacity_changes_one_scheduled_per_company_idx
on public.subscription_capacity_changes (company_id)
where status = 'scheduled';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'company_subscriptions_id_company_unique'
      and conrelid = 'public.company_subscriptions'::regclass
  ) then
    alter table public.company_subscriptions
      add constraint company_subscriptions_id_company_unique unique (id, company_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscription_capacity_changes_subscription_company_fk'
      and conrelid = 'public.subscription_capacity_changes'::regclass
  ) then
    alter table public.subscription_capacity_changes
      add constraint subscription_capacity_changes_subscription_company_fk
      foreign key (subscription_id, company_id)
      references public.company_subscriptions (id, company_id)
      on delete cascade;
  end if;
end $$;

alter table if exists public.company_subscriptions
alter column status set default 'trial';

update public.company_subscriptions
set status = 'trial'
where status::text = 'trialing';

update public.company_subscriptions
set status = 'cancelled'
where status::text = 'canceled';

alter table if exists public.company_subscriptions
add column if not exists plan_type public.company_plan_type not null default 'operational';

alter table if exists public.company_subscriptions
add column if not exists base_monthly_price_cop integer not null default 24900;

alter table if exists public.company_subscriptions
add column if not exists additional_site_monthly_price_cop integer not null default 9900;

alter table if exists public.company_subscriptions
alter column base_monthly_price_cop set default 24900;

alter table if exists public.company_subscriptions
alter column additional_site_monthly_price_cop set default 9900;

update public.company_subscriptions
set base_monthly_price_cop = 24900
where plan_type = 'operational'
  and base_monthly_price_cop = 25000;

update public.company_subscriptions
set base_monthly_price_cop = 19900
where plan_type = 'founder'
  and base_monthly_price_cop in (24900, 25000);

update public.company_subscriptions
set
  plan_type = 'operational',
  base_monthly_price_cop = 24900
where status = 'cancelled'
  and plan_type = 'founder';

update public.company_subscriptions
set additional_site_monthly_price_cop = 9900
where additional_site_monthly_price_cop in (15000, 19900);

alter table if exists public.company_subscriptions
add column if not exists included_active_sites integer not null default 1;

alter table if exists public.company_subscriptions
add column if not exists max_active_locations integer not null default 1;

update public.company_subscriptions
set max_active_locations = greatest(
  coalesce(max_active_locations, 1),
  coalesce(included_active_sites, 1)
);

alter table if exists public.company_subscriptions
add column if not exists payment_provider text not null default 'mercado_pago';

alter table if exists public.company_subscriptions
add column if not exists payment_method_status public.payment_method_status not null default 'pending';

alter table if exists public.company_subscriptions
add column if not exists mercado_pago_customer_id text;

alter table if exists public.company_subscriptions
add column if not exists mercado_pago_subscription_id text;

alter table if exists public.company_subscriptions
add column if not exists current_period_started_at timestamptz;

alter table if exists public.company_subscriptions
add column if not exists billing_cycle_anchor_at timestamptz;

alter table if exists public.company_subscriptions
add column if not exists currency char(3) not null default 'COP';

alter table if exists public.company_subscriptions
add column if not exists payment_attention_required boolean not null default false;

alter table if exists public.company_subscriptions
add column if not exists last_payment_issue_at timestamptz;

alter table if exists public.company_subscriptions
add column if not exists payment_grace_ends_at timestamptz;

alter table if exists public.company_subscriptions
add column if not exists last_successful_payment_at timestamptz;

alter table if exists public.company_subscriptions
add column if not exists cancellation_requested_at timestamptz;

alter table if exists public.company_subscriptions
add column if not exists cancellation_effective_at timestamptz;

update public.company_subscriptions
set current_period_started_at = current_period_ends_at - interval '1 month'
where current_period_ends_at is not null
  and current_period_started_at is null;

alter table if exists public.company_subscriptions
drop constraint if exists company_subscriptions_prices_check;

alter table if exists public.company_subscriptions
add constraint company_subscriptions_prices_check check (
  base_monthly_price_cop >= 0
  and additional_site_monthly_price_cop >= 0
  and included_active_sites >= 1
  and max_active_locations >= included_active_sites
);

alter table if exists public.company_subscriptions
drop constraint if exists company_subscriptions_payment_provider_check;

alter table if exists public.company_subscriptions
add constraint company_subscriptions_payment_provider_check check (payment_provider = 'mercado_pago');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'company_subscriptions_currency_check'
      and conrelid = 'public.company_subscriptions'::regclass
  ) then
    alter table public.company_subscriptions
      add constraint company_subscriptions_currency_check check (currency = 'COP');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'company_subscriptions_period_dates_check'
      and conrelid = 'public.company_subscriptions'::regclass
  ) then
    alter table public.company_subscriptions
      add constraint company_subscriptions_period_dates_check check (
        (current_period_started_at is null and current_period_ends_at is null)
        or (
          current_period_started_at is not null
          and current_period_ends_at is not null
          and current_period_started_at < current_period_ends_at
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'company_subscriptions_grace_check'
      and conrelid = 'public.company_subscriptions'::regclass
  ) then
    alter table public.company_subscriptions
      add constraint company_subscriptions_grace_check check (
        payment_grace_ends_at is null
        or (
          current_period_ends_at is not null
          and payment_grace_ends_at >= current_period_ends_at
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'company_subscriptions_payment_attention_check'
      and conrelid = 'public.company_subscriptions'::regclass
  ) then
    alter table public.company_subscriptions
      add constraint company_subscriptions_payment_attention_check check (
        payment_attention_required = false
        or last_payment_issue_at is not null
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscription_capacity_changes_id_company_unique'
      and conrelid = 'public.subscription_capacity_changes'::regclass
  ) then
    alter table public.subscription_capacity_changes
      add constraint subscription_capacity_changes_id_company_unique unique (id, company_id);
  end if;
end $$;

insert into public.company_subscriptions (
  company_id,
  status,
  plan_type,
  trial_started_at,
  trial_ends_at
)
select
  c.id,
  'trial',
  'operational',
  coalesce(c.created_at, now()),
  coalesce(c.created_at, now()) + interval '14 days'
from public.companies c
where not exists (
  select 1
  from public.company_subscriptions cs
  where cs.company_id = c.id
);

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  phone text not null,
  phone_verified boolean not null default false,
  global_role public.app_role not null default 'company_admin',
  is_active boolean not null default true,
  default_company_id uuid references public.companies (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profiles_email_lowercase check (email is null or email = lower(email)),
  constraint user_profiles_phone_e164 check (public.is_e164_phone(phone))
);

alter table if exists public.user_profiles
add column if not exists phone text;

alter table if exists public.user_profiles
alter column phone set not null;

alter table if exists public.user_profiles
alter column email drop not null;

alter table if exists public.user_profiles
drop constraint if exists user_profiles_email_key;

alter table if exists public.user_profiles
drop constraint if exists user_profiles_email_lowercase;

alter table if exists public.user_profiles
add constraint user_profiles_email_lowercase check (email is null or email = lower(email));

alter table if exists public.user_profiles
add column if not exists phone_verified boolean not null default false;

alter table if exists public.user_profiles
drop constraint if exists user_profiles_phone_e164;

do $$
declare
  duplicated_phone text;
begin
  select normalized_phone
  into duplicated_phone
  from (
    select public.normalize_legacy_phone_to_e164(phone) as normalized_phone, count(*) as profile_count
    from public.user_profiles
    where phone is not null
    group by public.normalize_legacy_phone_to_e164(phone)
  ) normalized_profiles
  where normalized_phone is not null
    and profile_count > 1
  limit 1;

  if duplicated_phone is not null then
    raise exception 'No se puede migrar teléfonos a E.164: existen perfiles duplicados para %.', duplicated_phone;
  end if;
end;
$$;

alter table if exists public.company_subscriptions
drop constraint if exists company_subscriptions_founder_forfeiture_check;

alter table if exists public.company_subscriptions
drop column if exists founder_benefit_forfeited_at;

update public.user_profiles
set phone = public.normalize_legacy_phone_to_e164(phone)
where phone is not null
  and phone is distinct from public.normalize_legacy_phone_to_e164(phone);

do $$
declare
  invalid_phone text;
  conflicting_phone text;
begin
  select phone
  into invalid_phone
  from public.user_profiles
  where not public.is_e164_phone(phone)
  limit 1;

  if invalid_phone is not null then
    raise exception 'No se puede aplicar formato E.164: el teléfono % requiere corrección manual.', invalid_phone;
  end if;

  select up.phone
  into conflicting_phone
  from public.user_profiles up
  join auth.users au on au.id = up.user_id
  join auth.users other_au on other_au.phone = ltrim(up.phone, '+') and other_au.id <> au.id
  limit 1;

  if conflicting_phone is not null then
    raise exception 'No se puede sincronizar Auth: el teléfono % ya pertenece a otro usuario Auth.', conflicting_phone;
  end if;
end;
$$;

update auth.users au
set
  phone = ltrim(up.phone, '+'),
  phone_confirmed_at = coalesce(au.phone_confirmed_at, now()),
  updated_at = now()
from public.user_profiles up
where au.id = up.user_id
  and au.phone is distinct from ltrim(up.phone, '+');

alter table if exists public.user_profiles
add constraint user_profiles_phone_e164 check (public.is_e164_phone(phone));

create unique index if not exists user_profiles_phone_unique_idx
on public.user_profiles (phone)
where phone is not null;

create table if not exists public.billing_intents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  subscription_id uuid not null,
  capacity_change_id uuid,
  intent_type public.billing_intent_type not null,
  status public.billing_intent_status not null default 'created',
  plan_type_snapshot public.company_plan_type not null,
  previous_max_active_locations integer,
  requested_max_active_locations integer,
  monthly_amount_before_cop integer,
  monthly_amount_after_cop integer,
  expected_immediate_amount_cop integer,
  currency char(3) not null default 'COP',
  period_started_at timestamptz,
  period_ends_at timestamptz,
  proration_amount_cop integer,
  proration_calculated_at timestamptz,
  proration_formula_version smallint,
  external_reference text not null,
  provider_checkout_url text,
  requested_by uuid references public.user_profiles (user_id) on delete set null,
  expires_at timestamptz,
  completed_at timestamptz,
  last_error_code text,
  last_error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_intents_id_company_unique unique (id, company_id),
  constraint billing_intents_external_reference_unique unique (external_reference),
  constraint billing_intents_subscription_company_fk
    foreign key (subscription_id, company_id)
    references public.company_subscriptions (id, company_id)
    on delete cascade,
  constraint billing_intents_capacity_change_company_fk
    foreign key (capacity_change_id, company_id)
    references public.subscription_capacity_changes (id, company_id)
    on delete set null (capacity_change_id),
  constraint billing_intents_currency_check check (currency = 'COP'),
  constraint billing_intents_capacity_check check (
    requested_max_active_locations is null
    or requested_max_active_locations >= 1
  ),
  constraint billing_intents_amounts_check check (
    (monthly_amount_before_cop is null or monthly_amount_before_cop >= 0)
    and (monthly_amount_after_cop is null or monthly_amount_after_cop >= 0)
    and (expected_immediate_amount_cop is null or expected_immediate_amount_cop >= 0)
    and (proration_amount_cop is null or proration_amount_cop >= 0)
  ),
  constraint billing_intents_upgrade_proration_check check (
    intent_type <> 'upgrade'
    or (
      requested_max_active_locations is not null
      and monthly_amount_before_cop is not null
      and monthly_amount_after_cop is not null
      and monthly_amount_after_cop > monthly_amount_before_cop
      and period_started_at is not null
      and period_ends_at is not null
      and period_started_at < period_ends_at
      and proration_amount_cop is not null
      and proration_calculated_at is not null
      and proration_formula_version is not null
    )
  )
);

create table if not exists public.billing_provider_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  subscription_id uuid not null,
  billing_intent_id uuid,
  provider text not null default 'mercado_pago',
  provider_subscription_id text not null,
  external_reference text not null,
  provider_customer_id text,
  provider_payer_id text,
  payer_email text,
  provider_status text not null,
  provider_version bigint,
  provider_updated_at timestamptz,
  recurring_amount_cop integer not null,
  currency char(3) not null default 'COP',
  next_payment_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_provider_subscriptions_id_company_unique unique (id, company_id),
  constraint billing_provider_subscriptions_provider_id_unique
    unique (provider, provider_subscription_id),
  constraint billing_provider_subscriptions_external_reference_unique
    unique (provider, external_reference),
  constraint billing_provider_subscriptions_subscription_company_fk
    foreign key (subscription_id, company_id)
    references public.company_subscriptions (id, company_id)
    on delete cascade,
  constraint billing_provider_subscriptions_intent_company_fk
    foreign key (billing_intent_id, company_id)
    references public.billing_intents (id, company_id)
    on delete set null (billing_intent_id),
  constraint billing_provider_subscriptions_amount_check check (recurring_amount_cop >= 0),
  constraint billing_provider_subscriptions_currency_check check (currency = 'COP')
);

create table if not exists public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  provider_subscription_record_id uuid not null,
  provider text not null default 'mercado_pago',
  provider_invoice_id text not null,
  provider_status text not null,
  normalized_status public.billing_invoice_status not null default 'unknown',
  amount_cop integer not null,
  currency char(3) not null default 'COP',
  debit_at timestamptz,
  period_started_at timestamptz,
  period_ends_at timestamptz,
  retry_attempt integer not null default 0,
  provider_updated_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_invoices_id_company_unique unique (id, company_id),
  constraint billing_invoices_provider_id_unique unique (provider, provider_invoice_id),
  constraint billing_invoices_provider_subscription_company_fk
    foreign key (provider_subscription_record_id, company_id)
    references public.billing_provider_subscriptions (id, company_id)
    on delete cascade,
  constraint billing_invoices_amount_check check (amount_cop >= 0),
  constraint billing_invoices_currency_check check (currency = 'COP'),
  constraint billing_invoices_retry_attempt_check check (retry_attempt >= 0),
  constraint billing_invoices_period_check check (
    (period_started_at is null and period_ends_at is null)
    or (
      period_started_at is not null
      and period_ends_at is not null
      and period_started_at < period_ends_at
    )
  )
);

create table if not exists public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  provider_subscription_record_id uuid not null,
  invoice_id uuid,
  billing_intent_id uuid,
  provider text not null default 'mercado_pago',
  provider_payment_id text not null,
  provider_status text not null,
  provider_status_detail text,
  normalized_status public.billing_payment_status not null default 'unknown',
  amount_cop integer not null,
  currency char(3) not null default 'COP',
  payment_method_type text,
  rejection_reason text,
  provider_created_at timestamptz,
  provider_updated_at timestamptz,
  approved_at timestamptz,
  refunded_amount_cop integer not null default 0,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_payments_id_company_unique unique (id, company_id),
  constraint billing_payments_provider_id_unique unique (provider, provider_payment_id),
  constraint billing_payments_provider_subscription_company_fk
    foreign key (provider_subscription_record_id, company_id)
    references public.billing_provider_subscriptions (id, company_id)
    on delete cascade,
  constraint billing_payments_invoice_company_fk
    foreign key (invoice_id, company_id)
    references public.billing_invoices (id, company_id)
    on delete set null (invoice_id),
  constraint billing_payments_intent_company_fk
    foreign key (billing_intent_id, company_id)
    references public.billing_intents (id, company_id)
    on delete set null (billing_intent_id),
  constraint billing_payments_amount_check check (
    amount_cop >= 0
    and refunded_amount_cop >= 0
    and refunded_amount_cop <= amount_cop
  ),
  constraint billing_payments_currency_check check (currency = 'COP')
);

alter table if exists public.billing_payments
add column if not exists refunded_amount_cop integer not null default 0;

alter table if exists public.billing_payments
drop constraint if exists billing_payments_amount_check;

alter table if exists public.billing_payments
add constraint billing_payments_amount_check check (
  amount_cop >= 0
  and refunded_amount_cop >= 0
  and refunded_amount_cop <= amount_cop
);

create table if not exists public.billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete set null,
  subscription_id uuid,
  provider text not null default 'mercado_pago',
  topic text not null,
  action text,
  resource_id text not null,
  delivery_key text not null,
  request_id text,
  signature_timestamp bigint,
  signature_valid boolean not null default false,
  verification_error text,
  live_mode boolean,
  payload jsonb not null,
  processing_status public.billing_webhook_processing_status not null default 'received',
  attempts integer not null default 0,
  claimed_at timestamptz,
  processed_at timestamptz,
  last_error text,
  provider_created_at timestamptz,
  canonical_resource_version text,
  canonical_resource_updated_at timestamptz,
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_webhook_events_provider_delivery_unique unique (provider, delivery_key),
  constraint billing_webhook_events_subscription_company_fk
    foreign key (subscription_id, company_id)
    references public.company_subscriptions (id, company_id)
    on delete set null (subscription_id),
  constraint billing_webhook_events_resolution_check check (
    subscription_id is null or company_id is not null
  ),
  constraint billing_webhook_events_attempts_check check (attempts >= 0)
);

create table if not exists public.subscription_status_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  subscription_id uuid not null,
  from_status public.company_subscription_status,
  to_status public.company_subscription_status not null,
  reason text not null,
  source text not null,
  billing_intent_id uuid,
  billing_payment_id uuid,
  webhook_event_id uuid references public.billing_webhook_events (id) on delete set null,
  actor_user_id uuid references public.user_profiles (user_id) on delete set null,
  deduplication_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint subscription_status_history_deduplication_unique unique (deduplication_key),
  constraint subscription_status_history_subscription_company_fk
    foreign key (subscription_id, company_id)
    references public.company_subscriptions (id, company_id)
    on delete cascade,
  constraint subscription_status_history_intent_company_fk
    foreign key (billing_intent_id, company_id)
    references public.billing_intents (id, company_id)
    on delete set null (billing_intent_id),
  constraint subscription_status_history_payment_company_fk
    foreign key (billing_payment_id, company_id)
    references public.billing_payments (id, company_id)
    on delete set null (billing_payment_id),
  constraint subscription_status_history_transition_check
    check (
      from_status is distinct from to_status
      or (
        source = 'manual'
        and reason = 'founder_assigned'
        and from_status is not distinct from to_status
        and metadata ->> 'fromPlanType' = 'operational'
        and metadata ->> 'toPlanType' = 'founder'
      )
    ),
  constraint subscription_status_history_source_check
    check (source in ('billing', 'webhook', 'reconciliation', 'manual'))
);

alter table if exists public.subscription_status_history
drop constraint if exists subscription_status_history_transition_check;

alter table if exists public.subscription_status_history
add constraint subscription_status_history_transition_check check (
  from_status is distinct from to_status
  or (
    source = 'manual'
    and reason = 'founder_assigned'
    and from_status is not distinct from to_status
    and metadata ->> 'fromPlanType' = 'operational'
    and metadata ->> 'toPlanType' = 'founder'
  )
);

create table if not exists public.billing_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete set null,
  provider text not null default 'mercado_pago',
  mode public.billing_reconciliation_mode not null,
  status public.billing_reconciliation_status not null default 'running',
  scope_key text not null default 'all',
  cursor_value text,
  scanned_count integer not null default 0,
  synchronized_count integer not null default 0,
  mismatch_count integer not null default 0,
  result_summary jsonb not null default '{}'::jsonb,
  error_message text,
  requested_by uuid references public.user_profiles (user_id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint billing_reconciliation_runs_scope_check check (length(trim(scope_key)) > 0),
  constraint billing_reconciliation_runs_counts_check check (
    scanned_count >= 0
    and synchronized_count >= 0
    and mismatch_count >= 0
  ),
  constraint billing_reconciliation_runs_finished_check check (
    (status = 'running' and finished_at is null)
    or (status <> 'running' and finished_at is not null)
  )
);

create unique index if not exists billing_intents_one_open_per_company_idx
on public.billing_intents (company_id)
where status in ('created', 'awaiting_customer', 'awaiting_payment', 'processing');

create index if not exists billing_intents_company_created_idx
on public.billing_intents (company_id, created_at desc);

create index if not exists billing_intents_open_expiry_idx
on public.billing_intents (expires_at)
where status in ('created', 'awaiting_customer', 'awaiting_payment', 'processing');

create unique index if not exists billing_provider_subscriptions_one_open_per_subscription_idx
on public.billing_provider_subscriptions (subscription_id)
where ended_at is null;

create index if not exists billing_provider_subscriptions_company_status_idx
on public.billing_provider_subscriptions (company_id, provider_status);

create index if not exists billing_invoices_company_debit_idx
on public.billing_invoices (company_id, debit_at desc);

create index if not exists billing_invoices_subscription_debit_idx
on public.billing_invoices (provider_subscription_record_id, debit_at desc);

create index if not exists billing_payments_company_created_idx
on public.billing_payments (company_id, created_at desc);

create index if not exists billing_payments_invoice_idx
on public.billing_payments (invoice_id);

create index if not exists billing_webhook_events_pending_idx
on public.billing_webhook_events (processing_status, received_at)
where processing_status in ('received', 'failed');

create index if not exists subscription_status_history_company_occurred_idx
on public.subscription_status_history (company_id, occurred_at desc);

create unique index if not exists billing_reconciliation_one_active_scope_idx
on public.billing_reconciliation_runs (provider, scope_key)
where status = 'running';

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  slug text not null,
  status public.site_status not null default 'active',
  is_active boolean not null default true,
  billing_activation_confirmed_at timestamptz,
  mercado_pago_activation_payment_id text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, slug),
  constraint branches_slug_format check (slug = lower(slug)),
  constraint branches_status_is_active_consistency check (
    (status = 'active' and is_active = true)
    or (status in ('inactive', 'deleted') and is_active = false)
  ),
  constraint branches_active_billing_confirmation_check check (
    status <> 'active'
    or billing_activation_confirmed_at is not null
  )
);

alter table if exists public.branches
add column if not exists status public.site_status not null default 'active';

alter table if exists public.branches
add column if not exists billing_activation_confirmed_at timestamptz;

alter table if exists public.branches
add column if not exists mercado_pago_activation_payment_id text;

alter table if exists public.branches
drop constraint if exists branches_name_length_check;

alter table if exists public.branches
add constraint branches_name_length_check
check (char_length(btrim(name)) between 1 and 120);

update public.branches
set status = case when is_active then 'active'::public.site_status else 'inactive'::public.site_status end
where status is null
  or (status = 'active' and is_active = false)
  or (status <> 'active' and is_active = true);

update public.branches
set
  status = 'inactive',
  is_active = false
where status::text = 'pending_payment';

update public.branches
set billing_activation_confirmed_at = coalesce(billing_activation_confirmed_at, created_at)
where is_active = true
  and status = 'active';

update public.company_subscriptions
set max_active_locations = greatest(
  coalesce(max_active_locations, 1),
  coalesce(included_active_sites, 1)
);

alter table if exists public.branches
drop constraint if exists branches_status_is_active_consistency;

alter table if exists public.branches
add constraint branches_status_is_active_consistency check (
  (status = 'active' and is_active = true)
  or (status in ('inactive', 'deleted') and is_active = false)
);

alter table if exists public.branches
drop constraint if exists branches_active_billing_confirmation_check;

alter table if exists public.branches
add constraint branches_active_billing_confirmation_check check (
  status <> 'active'
  or billing_activation_confirmed_at is not null
);

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'branch_dashboard_module_kind'
  ) then
    create type public.branch_dashboard_module_kind as enum ('operational', 'compliance');
  end if;
end $$;

create table if not exists public.branch_dashboard_items (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  module_kind public.branch_dashboard_module_kind not null,
  slug text not null,
  title text not null,
  subtitle text not null,
  requires_expiration boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, module_kind, slug)
);

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'branch_document_section_key'
  ) then
    create type public.branch_document_section_key as enum (
      'manuals_protocols',
      'plant_certifications',
      'traceability_supplies',
      'staff_records'
    );
  end if;
end $$;

create table if not exists public.branch_documents (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  section_key public.branch_document_section_key not null,
  title text not null,
  description text,
  file_url text,
  expires_at date,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, section_key, title)
);

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'branch_sanitary_document_kind'
  ) then
    create type public.branch_sanitary_document_kind as enum (
      'sanitation_plan',
      'chemical_technical_sheet',
      'chemical_safety_sheet',
      'pest_control_certificate',
      'water_tank_cleaning_certificate',
      'acu_final_disposal_certificate',
      'food_handling_course',
      'medical_fitness_exam'
    );
  end if;
end $$;

create table if not exists public.branch_chemical_products (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint branch_chemical_products_name_not_empty check (char_length(trim(name)) > 0)
);

create table if not exists public.branch_staff_members (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  full_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint branch_staff_members_full_name_not_empty check (char_length(trim(full_name)) > 0)
);

create table if not exists public.branch_sanitary_document_files (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  document_kind public.branch_sanitary_document_kind not null,
  chemical_product_id uuid references public.branch_chemical_products (id) on delete cascade,
  staff_member_id uuid references public.branch_staff_members (id) on delete cascade,
  file_url text not null,
  file_name text not null,
  file_size_bytes integer not null,
  mime_type text not null default 'application/pdf',
  metadata jsonb not null default '{}'::jsonb,
  expires_at date,
  is_active boolean not null default true,
  replaced_by_file_id uuid references public.branch_sanitary_document_files (id) on delete set null,
  uploaded_by uuid references auth.users (id) on delete set null default auth.uid(),
  uploaded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint branch_sanitary_document_files_pdf_only check (mime_type = 'application/pdf'),
  constraint branch_sanitary_document_files_pdf_size check (
    (
      document_kind = 'sanitation_plan'
      and file_size_bytes > 0
      and file_size_bytes <= 6291456
    )
    or (
      document_kind <> 'sanitation_plan'
      and file_size_bytes > 0
      and file_size_bytes <= 1572864
    )
  ),
  constraint branch_sanitary_document_files_owner_scope check (
    (
      document_kind in (
        'sanitation_plan',
        'pest_control_certificate',
        'water_tank_cleaning_certificate',
        'acu_final_disposal_certificate'
      )
      and chemical_product_id is null
      and staff_member_id is null
    )
    or (
      document_kind in ('chemical_technical_sheet', 'chemical_safety_sheet')
      and chemical_product_id is not null
      and staff_member_id is null
    )
    or (
      document_kind in ('food_handling_course', 'medical_fitness_exam')
      and chemical_product_id is null
      and staff_member_id is not null
    )
  ),
  constraint branch_sanitary_document_files_expiration_required check (
    document_kind in (
      'sanitation_plan',
      'chemical_technical_sheet',
      'chemical_safety_sheet',
      'acu_final_disposal_certificate'
    )
    or expires_at is not null
  )
);

alter table public.branch_sanitary_document_files
add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists branch_chemical_products_active_name_idx
on public.branch_chemical_products (branch_id, lower(name))
where is_active = true;

create unique index if not exists branch_staff_members_active_name_idx
on public.branch_staff_members (branch_id, lower(full_name))
where is_active = true;

create unique index if not exists branch_sanitary_document_files_sanitation_plan_idx
on public.branch_sanitary_document_files (branch_id, document_kind)
where is_active = true
  and document_kind = 'sanitation_plan';

create unique index if not exists branch_sanitary_document_files_chemical_item_idx
on public.branch_sanitary_document_files (chemical_product_id, document_kind)
where is_active = true
  and document_kind in ('chemical_technical_sheet', 'chemical_safety_sheet');

drop index if exists public.branch_sanitary_document_files_plant_single_idx;

create unique index if not exists branch_sanitary_document_files_staff_item_idx
on public.branch_sanitary_document_files (staff_member_id, document_kind)
where is_active = true
  and document_kind in ('food_handling_course', 'medical_fitness_exam');

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'operational_form_type'
  ) then
    create type public.operational_form_type as enum (
      'thermal_control',
      'area_sanitation',
      'supply_reception',
      'water_quality'
    );
  end if;
end $$;

create table if not exists public.branch_form_qr_codes (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  form_type public.operational_form_type not null,
  token text not null unique default gen_random_uuid()::text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, form_type),
  constraint branch_form_qr_codes_token_length check (char_length(token) >= 32)
);

create table if not exists public.resumen_diario_formularios (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references public.branches (id) on delete cascade,
  formulario_id public.operational_form_type not null,
  fecha date not null,
  cantidad_registros integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint resumen_diario_formularios_cantidad_nonnegative check (cantidad_registros >= 0),
  unique (sede_id, formulario_id, fecha)
);

create index if not exists resumen_diario_formularios_lookup_idx
on public.resumen_diario_formularios (sede_id, formulario_id, fecha);

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'sede_documento_categoria'
  ) then
    create type public.sede_documento_categoria as enum (
      'sanitation_plan',
      'chemical_products',
      'pest_control',
      'water_tank_cleaning',
      'acu_final_disposal',
      'staff_records'
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'sede_documento_estado'
  ) then
    create type public.sede_documento_estado as enum ('gris', 'rojo', 'amarillo', 'verde');
  end if;
end $$;

create table if not exists public.sedes_categorias_documentos (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references public.branches (id) on delete cascade,
  categoria public.sede_documento_categoria not null,
  estado_calculado public.sede_documento_estado not null default 'gris',
  updated_at timestamptz not null default now(),
  unique (sede_id, categoria)
);

alter table public.sedes_categorias_documentos
add column if not exists estado_calculado public.sede_documento_estado not null default 'gris';

create index if not exists sedes_categorias_documentos_lookup_idx
on public.sedes_categorias_documentos (sede_id, categoria);

create table if not exists public.branch_refrigeration_equipment (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  equipment_type public.refrigeration_equipment_type not null default 'refrigerator',
  is_active boolean not null default true,
  status public.branch_catalog_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint branch_refrigeration_equipment_status_consistency check (
    (status = 'active' and is_active = true)
    or (status in ('inactive', 'archived') and is_active = false)
  )
);

alter table public.branch_refrigeration_equipment
add column if not exists equipment_type public.refrigeration_equipment_type not null default 'refrigerator';

create table if not exists public.branch_sanitation_areas (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  status public.branch_catalog_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint branch_sanitation_areas_status_consistency check (
    (status = 'active' and is_active = true)
    or (status in ('inactive', 'archived') and is_active = false)
  )
);

create unique index if not exists branch_refrigeration_equipment_active_name_idx
on public.branch_refrigeration_equipment (branch_id, name)
where status <> 'archived';

create unique index if not exists branch_sanitation_areas_active_name_idx
on public.branch_sanitation_areas (branch_id, name)
where status <> 'archived';

create table if not exists public.thermal_control_records (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references public.branches (id) on delete restrict,
  company_id uuid not null references public.companies (id) on delete restrict,
  tipo_formulario public.operational_form_type not null default 'thermal_control',
  fecha_hora_servidor timestamptz not null default now(),
  created_at timestamptz not null default now(),
  reported_by uuid,
  token_qr_utilizado text not null,
  qr_code_id uuid references public.branch_form_qr_codes (id) on delete set null,
  equipment_id uuid references public.branch_refrigeration_equipment (id) on delete set null,
  equipment_name text not null,
  equipment_type public.refrigeration_equipment_type,
  operator_name text not null,
  temperature_c numeric(5,2) not null,
  temperature_compliant boolean,
  observations text,
  constraint thermal_control_records_tipo_check check (tipo_formulario = 'thermal_control'),
  constraint thermal_control_records_reported_by_fkey foreign key (reported_by) references public.user_profiles (user_id) on delete set null
);

alter table public.thermal_control_records
  add column if not exists reported_by uuid,
  add column if not exists equipment_type public.refrigeration_equipment_type,
  add column if not exists temperature_compliant boolean,
  add column if not exists observations text;

create table if not exists public.area_sanitation_records (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references public.branches (id) on delete restrict,
  company_id uuid not null references public.companies (id) on delete restrict,
  tipo_formulario public.operational_form_type not null default 'area_sanitation',
  fecha_hora_servidor timestamptz not null default now(),
  created_at timestamptz not null default now(),
  reported_by uuid,
  token_qr_utilizado text not null,
  qr_code_id uuid references public.branch_form_qr_codes (id) on delete set null,
  area_id uuid references public.branch_sanitation_areas (id) on delete set null,
  area_name text not null,
  operator_name text not null,
  cleaning_type text,
  used_exclusive_implements boolean,
  used_authorized_chemicals boolean,
  is_compliant boolean not null,
  constraint area_sanitation_records_cleaning_type_check check (
    cleaning_type is null or cleaning_type in ('Superficial', 'Profunda')
  ),
  constraint area_sanitation_records_tipo_check check (tipo_formulario = 'area_sanitation'),
  constraint area_sanitation_records_reported_by_fkey foreign key (reported_by) references public.user_profiles (user_id) on delete set null
);

alter table public.area_sanitation_records
  add column if not exists reported_by uuid,
  add column if not exists cleaning_type text,
  add column if not exists used_exclusive_implements boolean,
  add column if not exists used_authorized_chemicals boolean;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'area_sanitation_records_cleaning_type_check'
      and conrelid = 'public.area_sanitation_records'::regclass
  ) then
    alter table public.area_sanitation_records
      add constraint area_sanitation_records_cleaning_type_check
      check (cleaning_type is null or cleaning_type in ('Superficial', 'Profunda'));
  end if;
end $$;

create table if not exists public.supply_reception_records (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references public.branches (id) on delete restrict,
  company_id uuid not null references public.companies (id) on delete restrict,
  tipo_formulario public.operational_form_type not null default 'supply_reception',
  fecha_hora_servidor timestamptz not null default now(),
  created_at timestamptz not null default now(),
  reported_by uuid,
  token_qr_utilizado text not null,
  qr_code_id uuid references public.branch_form_qr_codes (id) on delete set null,
  operator_name text not null,
  product_name text not null,
  provider_name text,
  expiration_date date,
  product_type text not null,
  temperature_c numeric(5,1),
  temperature_compliant boolean,
  package_intact_date_valid boolean not null,
  organoleptic_adequate boolean not null,
  decision text not null,
  observations text,
  constraint supply_reception_records_tipo_check check (tipo_formulario = 'supply_reception'),
  constraint supply_reception_records_decision_check check (decision in ('accepted', 'accepted_with_issue', 'rejected')),
  constraint supply_reception_records_reported_by_fkey foreign key (reported_by) references public.user_profiles (user_id) on delete set null
);

alter table public.supply_reception_records
  alter column provider_name drop not null,
  alter column expiration_date drop not null;

alter table public.supply_reception_records
  add column if not exists reported_by uuid,
  add column if not exists product_type text,
  add column if not exists temperature_c numeric(5,1),
  add column if not exists temperature_compliant boolean,
  add column if not exists package_intact_date_valid boolean,
  add column if not exists organoleptic_adequate boolean,
  add column if not exists decision text,
  add column if not exists observations text;

update public.supply_reception_records
set decision = case
  when lower(trim(decision)) = 'aceptar producto' then 'accepted'
  when lower(trim(decision)) = 'aceptar producto con novedad' then 'accepted_with_issue'
  when lower(trim(decision)) = 'rechazar producto' then 'rejected'
  else decision
end;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'supply_reception_records_decision_check'
      and conrelid = 'public.supply_reception_records'::regclass
  ) then
    alter table public.supply_reception_records
      add constraint supply_reception_records_decision_check
      check (decision in ('accepted', 'accepted_with_issue', 'rejected'));
  end if;
end $$;

create table if not exists public.water_quality_records (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references public.branches (id) on delete restrict,
  company_id uuid not null references public.companies (id) on delete restrict,
  tipo_formulario public.operational_form_type not null default 'water_quality',
  fecha_hora_servidor timestamptz not null default now(),
  created_at timestamptz not null default now(),
  reported_by uuid,
  token_qr_utilizado text not null,
  qr_code_id uuid references public.branch_form_qr_codes (id) on delete set null,
  operator_name text not null,
  chlorine_ppm numeric(4,2) not null,
  chlorine_compliant boolean not null,
  ph_level numeric(3,1) not null,
  ph_compliant boolean not null,
  observations text,
  constraint water_quality_records_tipo_check check (tipo_formulario = 'water_quality'),
  constraint water_quality_records_chlorine_picker_range check (chlorine_ppm between 0 and 9.9),
  constraint water_quality_records_ph_picker_range check (ph_level between 0 and 9.9),
  constraint water_quality_records_reported_by_fkey foreign key (reported_by) references public.user_profiles (user_id) on delete set null
);

alter table public.water_quality_records
  drop constraint if exists water_quality_records_chlorine_range,
  add column if not exists reported_by uuid,
  add column if not exists chlorine_compliant boolean,
  add column if not exists ph_level numeric(3,1),
  add column if not exists ph_compliant boolean,
  add column if not exists observations text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'thermal_control_records_reported_by_fkey'
      and conrelid = 'public.thermal_control_records'::regclass
  ) then
    alter table public.thermal_control_records
      add constraint thermal_control_records_reported_by_fkey
      foreign key (reported_by) references public.user_profiles (user_id) on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'area_sanitation_records_reported_by_fkey'
      and conrelid = 'public.area_sanitation_records'::regclass
  ) then
    alter table public.area_sanitation_records
      add constraint area_sanitation_records_reported_by_fkey
      foreign key (reported_by) references public.user_profiles (user_id) on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'supply_reception_records_reported_by_fkey'
      and conrelid = 'public.supply_reception_records'::regclass
  ) then
    alter table public.supply_reception_records
      add constraint supply_reception_records_reported_by_fkey
      foreign key (reported_by) references public.user_profiles (user_id) on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'water_quality_records_reported_by_fkey'
      and conrelid = 'public.water_quality_records'::regclass
  ) then
    alter table public.water_quality_records
      add constraint water_quality_records_reported_by_fkey
      foreign key (reported_by) references public.user_profiles (user_id) on delete set null;
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
select
  'branch-documents',
  'branch-documents',
  true,
  20971520,
  array['application/pdf']
where not exists (
  select 1
  from storage.buckets
  where id = 'branch-documents'
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
select
  'generated-reports',
  'generated-reports',
  false,
  36700160,
  array['application/pdf']
where not exists (
  select 1
  from storage.buckets
  where id = 'generated-reports'
);

create or replace function public.can_access_generated_report_object(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, storage
as $$
declare
  path_parts text[];
  target_company_id uuid;
  target_branch_id uuid;
  report_type text;
begin
  path_parts := storage.foldername(object_name);

  if array_length(path_parts, 1) <> 3 then
    return false;
  end if;

  if lower(right(object_name, 4)) <> '.pdf' then
    return false;
  end if;

  if path_parts[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or path_parts[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    return false;
  end if;

  target_company_id := path_parts[1]::uuid;
  target_branch_id := path_parts[2]::uuid;
  report_type := path_parts[3];

  if report_type not in ('form-reports', 'sanitary-records', 'document-history') then
    return false;
  end if;

  return exists (
    select 1
    from public.branches b
    where b.id = target_branch_id
      and b.company_id = target_company_id
      and public.can_access_branch(b.id)
  );
end;
$$;

drop policy if exists "generated_reports_storage_select_policy" on storage.objects;
create policy "generated_reports_storage_select_policy"
on storage.objects
for select
using (
  bucket_id = 'generated-reports'
  and auth.role() = 'authenticated'
  and public.can_access_generated_report_object(name)
);

drop policy if exists "generated_reports_storage_insert_policy" on storage.objects;
create policy "generated_reports_storage_insert_policy"
on storage.objects
for insert
with check (
  bucket_id = 'generated-reports'
  and auth.role() = 'authenticated'
  and public.can_access_generated_report_object(name)
);

drop policy if exists "generated_reports_storage_delete_policy" on storage.objects;
create policy "generated_reports_storage_delete_policy"
on storage.objects
for delete
using (
  bucket_id = 'generated-reports'
  and auth.role() = 'authenticated'
  and public.can_access_generated_report_object(name)
);

drop policy if exists "branch_documents_storage_select_policy" on storage.objects;
create policy "branch_documents_storage_select_policy"
on storage.objects
for select
using (
  bucket_id = 'branch-documents'
  and auth.role() = 'authenticated'
  and public.can_access_branch(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "branch_documents_storage_insert_policy" on storage.objects;
create policy "branch_documents_storage_insert_policy"
on storage.objects
for insert
with check (
  bucket_id = 'branch-documents'
  and auth.role() = 'authenticated'
  and public.can_operate_branch(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "branch_documents_storage_update_policy" on storage.objects;
create policy "branch_documents_storage_update_policy"
on storage.objects
for update
using (
  bucket_id = 'branch-documents'
  and auth.role() = 'authenticated'
  and public.can_operate_branch(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'branch-documents'
  and auth.role() = 'authenticated'
  and public.can_operate_branch(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "branch_documents_storage_delete_policy" on storage.objects;
create policy "branch_documents_storage_delete_policy"
on storage.objects
for delete
using (
  bucket_id = 'branch-documents'
  and auth.role() = 'authenticated'
  and public.can_operate_branch(((storage.foldername(name))[1])::uuid)
);

create table if not exists public.demo_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  role text not null,
  company_type text not null,
  message text,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.slugify(value text)
returns text
language sql
immutable
set search_path = public
as $$
  select trim(both '-' from regexp_replace(lower(public.unaccent(coalesce(value, ''))), '[^a-z0-9]+', '-', 'g'))
$$;

create or replace function public.set_slug_from_name()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  base_slug text;
  candidate_slug text;
  suffix integer := 2;
begin
  if tg_table_name = 'companies' then
    -- A company name is commercial information, not a unique identifier. Keep
    -- the first readable slug and suffix later equivalent names. The advisory
    -- lock makes the choice safe when registrations happen concurrently.
    base_slug := coalesce(nullif(public.slugify(new.name), ''), 'empresa');
    perform pg_advisory_xact_lock(hashtext(base_slug));

    candidate_slug := base_slug;

    while exists (
      select 1
      from public.companies c
      where c.slug = candidate_slug
        and c.id <> new.id
    ) loop
      candidate_slug := base_slug || '-' || suffix;
      suffix := suffix + 1;
    end loop;

    new.slug = candidate_slug;
  elsif tg_table_name = 'branches' then
    new.slug = public.slugify(new.name);
  end if;

  return new;
end;
$$;

create or replace function public.set_company_id_from_branch()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  resolved_company_id uuid;
begin
  if tg_table_name in (
    'branch_form_qr_codes',
    'branch_refrigeration_equipment',
    'branch_sanitation_areas',
    'branch_chemical_products',
    'branch_staff_members',
    'branch_sanitary_document_files'
  ) then
    select b.company_id
    into resolved_company_id
    from public.branches b
    where b.id = new.branch_id;
  else
    select b.company_id
    into resolved_company_id
    from public.branches b
    where b.id = new.sede_id;
  end if;

  if resolved_company_id is null then
    raise exception 'La sede indicada no existe.';
  end if;

  new.company_id = resolved_company_id;
  return new;
end;
$$;

create or replace function public.prevent_branch_form_qr_token_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.token is distinct from old.token then
    raise exception 'El token del QR es permanente y no puede modificarse.';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_branch_sanitary_document_files_limit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  active_records_count integer;
begin
  if new.is_active is distinct from true then
    return new;
  end if;

  if new.document_kind not in (
    'pest_control_certificate',
    'water_tank_cleaning_certificate',
    'acu_final_disposal_certificate'
  ) then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtext('branch_sanitary_document_files_limit'),
    hashtext(new.branch_id::text || ':' || new.document_kind::text)
  );

  select count(*)
  into active_records_count
  from public.branch_sanitary_document_files
  where branch_id = new.branch_id
    and document_kind = new.document_kind
    and is_active = true
    and id is distinct from new.id;

  if active_records_count >= 40 then
    raise exception 'Esta sección permite máximo 40 registros almacenados.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_branch_chemical_products_limit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  active_records_count integer;
begin
  if new.is_active is distinct from true then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtext('branch_chemical_products_limit'),
    hashtext(new.branch_id::text)
  );

  select count(*)
  into active_records_count
  from public.branch_chemical_products
  where branch_id = new.branch_id
    and is_active = true
    and id is distinct from new.id;

  if active_records_count >= 40 then
    raise exception 'Esta sección permite máximo 40 registros almacenados.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_branch_staff_members_limit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  active_records_count integer;
begin
  if new.is_active is distinct from true then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtext('branch_staff_members_limit'),
    hashtext(new.branch_id::text)
  );

  select count(*)
  into active_records_count
  from public.branch_staff_members
  where branch_id = new.branch_id
    and is_active = true
    and id is distinct from new.id;

  if active_records_count >= 40 then
    raise exception 'Esta sección permite máximo 40 registros almacenados.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.apply_resumen_diario_formularios_delta(
  p_sede_id uuid,
  p_formulario_id public.operational_form_type,
  p_fecha date,
  p_delta integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_sede_id is null or p_formulario_id is null or p_fecha is null or p_delta = 0 then
    return;
  end if;

  insert into public.resumen_diario_formularios (
    sede_id,
    formulario_id,
    fecha,
    cantidad_registros,
    updated_at
  )
  values (
    p_sede_id,
    p_formulario_id,
    p_fecha,
    greatest(p_delta, 0),
    now()
  )
  on conflict (sede_id, formulario_id, fecha)
  do update set
    cantidad_registros = greatest(public.resumen_diario_formularios.cantidad_registros + p_delta, 0),
    updated_at = now();

  delete from public.resumen_diario_formularios
  where sede_id = p_sede_id
    and formulario_id = p_formulario_id
    and fecha = p_fecha
    and cantidad_registros <= 0;
end;
$$;

create or replace function public.sync_resumen_diario_formularios()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_fecha date;
  new_fecha date;
begin
  if tg_op = 'DELETE' then
    old_fecha := (old.fecha_hora_servidor at time zone 'America/Bogota')::date;
    perform public.apply_resumen_diario_formularios_delta(old.sede_id, old.tipo_formulario, old_fecha, -1);
    return old;
  end if;

  if tg_op = 'INSERT' then
    new_fecha := (new.fecha_hora_servidor at time zone 'America/Bogota')::date;
    perform public.apply_resumen_diario_formularios_delta(new.sede_id, new.tipo_formulario, new_fecha, 1);
    return new;
  end if;

  old_fecha := (old.fecha_hora_servidor at time zone 'America/Bogota')::date;
  new_fecha := (new.fecha_hora_servidor at time zone 'America/Bogota')::date;

  if old.sede_id is distinct from new.sede_id
    or old.tipo_formulario is distinct from new.tipo_formulario
    or old_fecha is distinct from new_fecha
  then
    perform public.apply_resumen_diario_formularios_delta(old.sede_id, old.tipo_formulario, old_fecha, -1);
    perform public.apply_resumen_diario_formularios_delta(new.sede_id, new.tipo_formulario, new_fecha, 1);
  end if;

  return new;
end;
$$;

create or replace function public.get_document_category_from_kind(
  p_document_kind public.branch_sanitary_document_kind
)
returns public.sede_documento_categoria
language sql
immutable
set search_path = public
as $$
  select case p_document_kind
    when 'sanitation_plan' then 'sanitation_plan'::public.sede_documento_categoria
    when 'chemical_technical_sheet' then 'chemical_products'::public.sede_documento_categoria
    when 'chemical_safety_sheet' then 'chemical_products'::public.sede_documento_categoria
    when 'pest_control_certificate' then 'pest_control'::public.sede_documento_categoria
    when 'water_tank_cleaning_certificate' then 'water_tank_cleaning'::public.sede_documento_categoria
    when 'acu_final_disposal_certificate' then 'acu_final_disposal'::public.sede_documento_categoria
    when 'food_handling_course' then 'staff_records'::public.sede_documento_categoria
    when 'medical_fitness_exam' then 'staff_records'::public.sede_documento_categoria
  end;
$$;

create or replace function public.recalcular_estado_categoria_documentos(
  p_sede_id uuid,
  p_categoria public.sede_documento_categoria
)
returns public.sede_documento_estado
language plpgsql
security definer
set search_path = public
as $$
declare
  next_estado public.sede_documento_estado := 'gris';
begin
  if p_sede_id is null or p_categoria is null then
    return next_estado;
  end if;

  if p_categoria = 'sanitation_plan' then
    if exists (
      select 1
      from public.branch_sanitary_document_files files
      where files.branch_id = p_sede_id
        and files.document_kind = 'sanitation_plan'
        and files.is_active = true
    ) then
      next_estado := 'verde';
    end if;
  elsif p_categoria = 'pest_control' then
    select case
      when latest_file.expires_at < current_date then 'rojo'::public.sede_documento_estado
      else 'verde'::public.sede_documento_estado
    end
    into next_estado
    from (
      select files.expires_at
      from public.branch_sanitary_document_files files
      where files.branch_id = p_sede_id
        and files.document_kind = 'pest_control_certificate'
        and files.is_active = true
      order by
        nullif(files.metadata->>'issuedAt', '') desc nulls last,
        files.updated_at desc,
        files.uploaded_at desc,
        files.id desc
      limit 1
    ) latest_file;

    next_estado := coalesce(next_estado, 'gris'::public.sede_documento_estado);
  elsif p_categoria = 'water_tank_cleaning' then
    select case
      when latest_file.expires_at < current_date then 'rojo'::public.sede_documento_estado
      else 'verde'::public.sede_documento_estado
    end
    into next_estado
    from (
      select files.expires_at
      from public.branch_sanitary_document_files files
      where files.branch_id = p_sede_id
        and files.document_kind = 'water_tank_cleaning_certificate'
        and files.is_active = true
      order by
        nullif(files.metadata->>'issuedAt', '') desc nulls last,
        files.updated_at desc,
        files.uploaded_at desc,
        files.id desc
      limit 1
    ) latest_file;

    next_estado := coalesce(next_estado, 'gris'::public.sede_documento_estado);
  elsif p_categoria = 'acu_final_disposal' then
    if exists (
      select 1
      from public.branch_sanitary_document_files files
      where files.branch_id = p_sede_id
        and files.document_kind = 'acu_final_disposal_certificate'
        and files.is_active = true
    ) then
      next_estado := 'verde';
    end if;
  elsif p_categoria = 'chemical_products' then
    if not exists (
      select 1
      from public.branch_chemical_products products
      where products.branch_id = p_sede_id
        and products.is_active = true
    ) then
      next_estado := 'gris';
    elsif exists (
      select 1
      from public.branch_chemical_products products
      where products.branch_id = p_sede_id
        and products.is_active = true
        and (
          not exists (
            select 1
            from public.branch_sanitary_document_files files
            where files.chemical_product_id = products.id
              and files.document_kind = 'chemical_technical_sheet'
              and files.is_active = true
          )
          or not exists (
            select 1
            from public.branch_sanitary_document_files files
            where files.chemical_product_id = products.id
              and files.document_kind = 'chemical_safety_sheet'
              and files.is_active = true
          )
        )
    ) then
      next_estado := 'amarillo';
    else
      next_estado := 'verde';
    end if;
  elsif p_categoria = 'staff_records' then
    if not exists (
      select 1
      from public.branch_staff_members staff
      where staff.branch_id = p_sede_id
        and staff.is_active = true
    ) then
      next_estado := 'gris';
    elsif exists (
      select 1
      from public.branch_sanitary_document_files files
      where files.branch_id = p_sede_id
        and files.document_kind in ('food_handling_course', 'medical_fitness_exam')
        and files.is_active = true
        and files.expires_at < current_date
    ) then
      next_estado := 'rojo';
    elsif exists (
      select 1
      from public.branch_staff_members staff
      where staff.branch_id = p_sede_id
        and staff.is_active = true
        and (
          not exists (
            select 1
            from public.branch_sanitary_document_files files
            where files.staff_member_id = staff.id
              and files.document_kind = 'food_handling_course'
              and files.is_active = true
              and nullif(files.metadata->>'issuedAt', '') is not null
          )
          or not exists (
            select 1
            from public.branch_sanitary_document_files files
            where files.staff_member_id = staff.id
              and files.document_kind = 'medical_fitness_exam'
              and files.is_active = true
              and nullif(files.metadata->>'issuedAt', '') is not null
          )
        )
    ) then
      next_estado := 'amarillo';
    else
      next_estado := 'verde';
    end if;
  end if;

  insert into public.sedes_categorias_documentos (
    sede_id,
    categoria,
    estado_calculado,
    updated_at
  )
  values (
    p_sede_id,
    p_categoria,
    next_estado,
    now()
  )
  on conflict (sede_id, categoria)
  do update set
    estado_calculado = excluded.estado_calculado,
    updated_at = now();

  return next_estado;
end;
$$;

create or replace function public.refresh_sedes_categorias_documentos(p_sede_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  branch_record record;
  category_record record;
begin
  for branch_record in
    select id
    from public.branches
    where p_sede_id is null or id = p_sede_id
  loop
    for category_record in
      select unnest(enum_range(null::public.sede_documento_categoria)) as categoria
    loop
      perform public.recalcular_estado_categoria_documentos(branch_record.id, category_record.categoria);
    end loop;
  end loop;
end;
$$;

create or replace function public.sync_sedes_categorias_documentos_from_file()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_categoria public.sede_documento_categoria;
  new_categoria public.sede_documento_categoria;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    old_categoria := public.get_document_category_from_kind(old.document_kind);
    perform public.recalcular_estado_categoria_documentos(old.branch_id, old_categoria);
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    new_categoria := public.get_document_category_from_kind(new.document_kind);
    perform public.recalcular_estado_categoria_documentos(new.branch_id, new_categoria);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create or replace function public.sync_sedes_categorias_documentos_from_product()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.recalcular_estado_categoria_documentos(old.branch_id, 'chemical_products');
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    perform public.recalcular_estado_categoria_documentos(new.branch_id, 'chemical_products');
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create or replace function public.sync_sedes_categorias_documentos_from_staff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.recalcular_estado_categoria_documentos(old.branch_id, 'staff_records');
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    perform public.recalcular_estado_categoria_documentos(new.branch_id, 'staff_records');
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create or replace function public.reset_user_profile_phone_verification()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.phone is distinct from old.phone and new.phone_verified is not true then
    new.phone_verified := false;
  end if;

  return new;
end;
$$;

drop trigger if exists set_companies_updated_at on public.companies;
create trigger set_companies_updated_at
before update on public.companies
for each row
execute function public.set_updated_at();

drop trigger if exists set_whatsapp_channels_updated_at on public.whatsapp_channels;
create trigger set_whatsapp_channels_updated_at
before update on public.whatsapp_channels
for each row
execute function public.set_updated_at();

drop trigger if exists set_whatsapp_conversations_updated_at on public.whatsapp_conversations;
create trigger set_whatsapp_conversations_updated_at
before update on public.whatsapp_conversations
for each row
execute function public.set_updated_at();

drop trigger if exists set_whatsapp_messages_updated_at on public.whatsapp_messages;
create trigger set_whatsapp_messages_updated_at
before update on public.whatsapp_messages
for each row
execute function public.set_updated_at();

drop trigger if exists set_whatsapp_conversation_reads_updated_at on public.whatsapp_conversation_reads;
create trigger set_whatsapp_conversation_reads_updated_at
before update on public.whatsapp_conversation_reads
for each row
execute function public.set_updated_at();

drop trigger if exists set_company_subscriptions_updated_at on public.company_subscriptions;
create trigger set_company_subscriptions_updated_at
before update on public.company_subscriptions
for each row
execute function public.set_updated_at();

drop trigger if exists set_billing_intents_updated_at on public.billing_intents;
create trigger set_billing_intents_updated_at
before update on public.billing_intents
for each row
execute function public.set_updated_at();

drop trigger if exists set_billing_provider_subscriptions_updated_at on public.billing_provider_subscriptions;
create trigger set_billing_provider_subscriptions_updated_at
before update on public.billing_provider_subscriptions
for each row
execute function public.set_updated_at();

drop trigger if exists set_billing_invoices_updated_at on public.billing_invoices;
create trigger set_billing_invoices_updated_at
before update on public.billing_invoices
for each row
execute function public.set_updated_at();

drop trigger if exists set_billing_payments_updated_at on public.billing_payments;
create trigger set_billing_payments_updated_at
before update on public.billing_payments
for each row
execute function public.set_updated_at();

drop trigger if exists set_billing_webhook_events_updated_at on public.billing_webhook_events;
create trigger set_billing_webhook_events_updated_at
before update on public.billing_webhook_events
for each row
execute function public.set_updated_at();

drop trigger if exists set_billing_reconciliation_runs_updated_at on public.billing_reconciliation_runs;
create trigger set_billing_reconciliation_runs_updated_at
before update on public.billing_reconciliation_runs
for each row
execute function public.set_updated_at();

drop trigger if exists set_companies_slug on public.companies;
create trigger set_companies_slug
before insert or update of name on public.companies
for each row
execute function public.set_slug_from_name();

drop trigger if exists set_user_profiles_updated_at on public.user_profiles;
create trigger set_user_profiles_updated_at
before update on public.user_profiles
for each row
execute function public.set_updated_at();

drop trigger if exists reset_user_profiles_phone_verification on public.user_profiles;
create trigger reset_user_profiles_phone_verification
before update of phone on public.user_profiles
for each row
execute function public.reset_user_profile_phone_verification();

drop trigger if exists set_branches_updated_at on public.branches;
create trigger set_branches_updated_at
before update on public.branches
for each row
execute function public.set_updated_at();

drop trigger if exists set_branches_slug on public.branches;
create trigger set_branches_slug
before insert or update of name on public.branches
for each row
execute function public.set_slug_from_name();

drop trigger if exists set_branch_dashboard_items_updated_at on public.branch_dashboard_items;
create trigger set_branch_dashboard_items_updated_at
before update on public.branch_dashboard_items
for each row
execute function public.set_updated_at();

drop trigger if exists set_branch_documents_updated_at on public.branch_documents;
create trigger set_branch_documents_updated_at
before update on public.branch_documents
for each row
execute function public.set_updated_at();

drop trigger if exists set_branch_chemical_products_company_id on public.branch_chemical_products;
create trigger set_branch_chemical_products_company_id
before insert or update of branch_id, company_id on public.branch_chemical_products
for each row
execute function public.set_company_id_from_branch();

drop trigger if exists set_branch_chemical_products_updated_at on public.branch_chemical_products;
create trigger set_branch_chemical_products_updated_at
before update on public.branch_chemical_products
for each row
execute function public.set_updated_at();

drop trigger if exists enforce_branch_chemical_products_limit on public.branch_chemical_products;
create trigger enforce_branch_chemical_products_limit
before insert or update of branch_id, is_active on public.branch_chemical_products
for each row
execute function public.enforce_branch_chemical_products_limit();

drop trigger if exists sync_sedes_categorias_documentos_from_product on public.branch_chemical_products;
create trigger sync_sedes_categorias_documentos_from_product
after insert or update of branch_id, is_active or delete on public.branch_chemical_products
for each row
execute function public.sync_sedes_categorias_documentos_from_product();

drop trigger if exists set_branch_staff_members_company_id on public.branch_staff_members;
create trigger set_branch_staff_members_company_id
before insert or update of branch_id, company_id on public.branch_staff_members
for each row
execute function public.set_company_id_from_branch();

drop trigger if exists set_branch_staff_members_updated_at on public.branch_staff_members;
create trigger set_branch_staff_members_updated_at
before update on public.branch_staff_members
for each row
execute function public.set_updated_at();

drop trigger if exists enforce_branch_staff_members_limit on public.branch_staff_members;
create trigger enforce_branch_staff_members_limit
before insert or update of branch_id, is_active on public.branch_staff_members
for each row
execute function public.enforce_branch_staff_members_limit();

drop trigger if exists sync_sedes_categorias_documentos_from_staff on public.branch_staff_members;
create trigger sync_sedes_categorias_documentos_from_staff
after insert or update of branch_id, is_active or delete on public.branch_staff_members
for each row
execute function public.sync_sedes_categorias_documentos_from_staff();

drop trigger if exists set_branch_sanitary_document_files_company_id on public.branch_sanitary_document_files;
create trigger set_branch_sanitary_document_files_company_id
before insert or update of branch_id, company_id on public.branch_sanitary_document_files
for each row
execute function public.set_company_id_from_branch();

drop trigger if exists set_branch_sanitary_document_files_updated_at on public.branch_sanitary_document_files;
create trigger set_branch_sanitary_document_files_updated_at
before update on public.branch_sanitary_document_files
for each row
execute function public.set_updated_at();

drop trigger if exists enforce_branch_sanitary_document_files_limit on public.branch_sanitary_document_files;
create trigger enforce_branch_sanitary_document_files_limit
before insert or update of branch_id, document_kind, is_active on public.branch_sanitary_document_files
for each row
execute function public.enforce_branch_sanitary_document_files_limit();

drop trigger if exists sync_sedes_categorias_documentos_from_file on public.branch_sanitary_document_files;
create trigger sync_sedes_categorias_documentos_from_file
after insert or update of branch_id, document_kind, is_active, expires_at, metadata, chemical_product_id, staff_member_id or delete
on public.branch_sanitary_document_files
for each row
execute function public.sync_sedes_categorias_documentos_from_file();

drop trigger if exists set_branch_form_qr_codes_company_id on public.branch_form_qr_codes;
create trigger set_branch_form_qr_codes_company_id
before insert or update of branch_id, company_id on public.branch_form_qr_codes
for each row
execute function public.set_company_id_from_branch();

drop trigger if exists set_branch_form_qr_codes_updated_at on public.branch_form_qr_codes;
create trigger set_branch_form_qr_codes_updated_at
before update on public.branch_form_qr_codes
for each row
execute function public.set_updated_at();

drop trigger if exists prevent_branch_form_qr_token_update on public.branch_form_qr_codes;
create trigger prevent_branch_form_qr_token_update
before update on public.branch_form_qr_codes
for each row
execute function public.prevent_branch_form_qr_token_update();

drop trigger if exists set_branch_refrigeration_equipment_company_id on public.branch_refrigeration_equipment;
create trigger set_branch_refrigeration_equipment_company_id
before insert or update of branch_id, company_id on public.branch_refrigeration_equipment
for each row
execute function public.set_company_id_from_branch();

drop trigger if exists set_branch_refrigeration_equipment_updated_at on public.branch_refrigeration_equipment;
create trigger set_branch_refrigeration_equipment_updated_at
before update on public.branch_refrigeration_equipment
for each row
execute function public.set_updated_at();

drop trigger if exists set_branch_sanitation_areas_company_id on public.branch_sanitation_areas;
create trigger set_branch_sanitation_areas_company_id
before insert or update of branch_id, company_id on public.branch_sanitation_areas
for each row
execute function public.set_company_id_from_branch();

drop trigger if exists set_branch_sanitation_areas_updated_at on public.branch_sanitation_areas;
create trigger set_branch_sanitation_areas_updated_at
before update on public.branch_sanitation_areas
for each row
execute function public.set_updated_at();

drop trigger if exists set_thermal_control_records_company_id on public.thermal_control_records;
create trigger set_thermal_control_records_company_id
before insert or update of sede_id, company_id on public.thermal_control_records
for each row
execute function public.set_company_id_from_branch();

drop trigger if exists set_area_sanitation_records_company_id on public.area_sanitation_records;
create trigger set_area_sanitation_records_company_id
before insert or update of sede_id, company_id on public.area_sanitation_records
for each row
execute function public.set_company_id_from_branch();

drop trigger if exists set_supply_reception_records_company_id on public.supply_reception_records;
create trigger set_supply_reception_records_company_id
before insert or update of sede_id, company_id on public.supply_reception_records
for each row
execute function public.set_company_id_from_branch();

drop trigger if exists set_water_quality_records_company_id on public.water_quality_records;
create trigger set_water_quality_records_company_id
before insert or update of sede_id, company_id on public.water_quality_records
for each row
execute function public.set_company_id_from_branch();

drop trigger if exists sync_resumen_diario_formularios_thermal_control on public.thermal_control_records;
create trigger sync_resumen_diario_formularios_thermal_control
after insert or update of sede_id, tipo_formulario, fecha_hora_servidor or delete on public.thermal_control_records
for each row
execute function public.sync_resumen_diario_formularios();

drop trigger if exists sync_resumen_diario_formularios_area_sanitation on public.area_sanitation_records;
create trigger sync_resumen_diario_formularios_area_sanitation
after insert or update of sede_id, tipo_formulario, fecha_hora_servidor or delete on public.area_sanitation_records
for each row
execute function public.sync_resumen_diario_formularios();

drop trigger if exists sync_resumen_diario_formularios_supply_reception on public.supply_reception_records;
create trigger sync_resumen_diario_formularios_supply_reception
after insert or update of sede_id, tipo_formulario, fecha_hora_servidor or delete on public.supply_reception_records
for each row
execute function public.sync_resumen_diario_formularios();

drop trigger if exists sync_resumen_diario_formularios_water_quality on public.water_quality_records;
create trigger sync_resumen_diario_formularios_water_quality
after insert or update of sede_id, tipo_formulario, fecha_hora_servidor or delete on public.water_quality_records
for each row
execute function public.sync_resumen_diario_formularios();

create or replace function public.seed_default_branch_dashboard_items()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into public.branch_dashboard_items (
    branch_id,
    module_kind,
    slug,
    title,
    subtitle,
    requires_expiration,
    is_active,
    sort_order
  )
  values
    (new.id, 'operational', 'saneamiento-de-areas', 'Saneamiento de Áreas', 'Checklist de Limpieza', false, true, 10),
    (new.id, 'operational', 'control-termico', 'Control Térmico', 'Control de Frío', false, true, 20),
    (new.id, 'operational', 'recepcion-de-insumos', 'Recepción de Insumos', 'Entrada de Mercancía', false, true, 30),
    (new.id, 'operational', 'calidad-del-agua', 'Calidad del Agua', 'Prueba de Cloro', false, true, 40),
    (new.id, 'compliance', 'manuales-y-protocolos', 'Manuales y Protocolos', 'Saneamiento + Químicos', false, true, 10),
    (new.id, 'compliance', 'certificaciones-de-planta', 'Certificaciones de Planta', 'Fumigación y Tanques', true, true, 20),
    (new.id, 'compliance', 'trazabilidad-de-insumos', 'Trazabilidad de Insumos', 'Fichas técnicas + hojas de seguridad', false, true, 30),
    (new.id, 'compliance', 'fichas-del-personal', 'Fichas del Personal', 'Curso de manipulación + exámenes médicos', true, true, 40)
  on conflict (branch_id, module_kind, slug) do nothing;

  return new;
end;
$$;

drop trigger if exists seed_default_branch_dashboard_items on public.branches;
create trigger seed_default_branch_dashboard_items
after insert on public.branches
for each row
execute function public.seed_default_branch_dashboard_items();

create or replace function public.seed_default_branch_form_qr_codes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into public.branch_form_qr_codes (
    branch_id,
    company_id,
    form_type
  )
  values
    (new.id, new.company_id, 'thermal_control'),
    (new.id, new.company_id, 'area_sanitation'),
    (new.id, new.company_id, 'supply_reception'),
    (new.id, new.company_id, 'water_quality')
  on conflict (branch_id, form_type) do nothing;

  return new;
end;
$$;

create or replace function public.seed_default_sedes_categorias_documentos()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into public.sedes_categorias_documentos (
    sede_id,
    categoria,
    estado_calculado
  )
  select
    new.id,
    categories.categoria,
    'gris'::public.sede_documento_estado
  from (
    select unnest(enum_range(null::public.sede_documento_categoria)) as categoria
  ) categories
  on conflict (sede_id, categoria) do nothing;

  return new;
end;
$$;

drop trigger if exists seed_default_branch_form_qr_codes on public.branches;
create trigger seed_default_branch_form_qr_codes
after insert on public.branches
for each row
execute function public.seed_default_branch_form_qr_codes();

drop trigger if exists seed_default_sedes_categorias_documentos on public.branches;
create trigger seed_default_sedes_categorias_documentos
after insert on public.branches
for each row
execute function public.seed_default_sedes_categorias_documentos();

insert into public.branch_dashboard_items (
  branch_id,
  module_kind,
  slug,
  title,
  subtitle,
  requires_expiration,
  is_active,
  sort_order
)
select
  b.id,
  items.module_kind,
  items.slug,
  items.title,
  items.subtitle,
  items.requires_expiration,
  items.is_active,
  items.sort_order
from public.branches b
cross join (
  values
    ('operational'::public.branch_dashboard_module_kind, 'saneamiento-de-areas', 'Saneamiento de Áreas', 'Checklist de Limpieza', false, true, 10),
    ('operational'::public.branch_dashboard_module_kind, 'control-termico', 'Control Térmico', 'Control de Frío', false, true, 20),
    ('operational'::public.branch_dashboard_module_kind, 'recepcion-de-insumos', 'Recepción de Insumos', 'Entrada de Mercancía', false, true, 30),
    ('operational'::public.branch_dashboard_module_kind, 'calidad-del-agua', 'Calidad del Agua', 'Prueba de Cloro', false, true, 40),
    ('compliance'::public.branch_dashboard_module_kind, 'manuales-y-protocolos', 'Manuales y Protocolos', 'Saneamiento + Químicos', false, true, 10),
    ('compliance'::public.branch_dashboard_module_kind, 'certificaciones-de-planta', 'Certificaciones de Planta', 'Fumigación y Tanques', true, true, 20),
    ('compliance'::public.branch_dashboard_module_kind, 'trazabilidad-de-insumos', 'Trazabilidad de Insumos', 'Fichas técnicas + hojas de seguridad', false, true, 30),
    ('compliance'::public.branch_dashboard_module_kind, 'fichas-del-personal', 'Fichas del Personal', 'Curso de manipulación + exámenes médicos', true, true, 40)
) as items(module_kind, slug, title, subtitle, requires_expiration, is_active, sort_order)
on conflict (branch_id, module_kind, slug) do nothing;

insert into public.branch_form_qr_codes (
  branch_id,
  company_id,
  form_type
)
select
  b.id,
  b.company_id,
  forms.form_type
from public.branches b
cross join (
  values
    ('thermal_control'::public.operational_form_type),
    ('area_sanitation'::public.operational_form_type),
    ('supply_reception'::public.operational_form_type),
    ('water_quality'::public.operational_form_type)
) as forms(form_type)
on conflict (branch_id, form_type) do nothing;

insert into public.resumen_diario_formularios (
  sede_id,
  formulario_id,
  fecha,
  cantidad_registros,
  updated_at
)
select
  daily.sede_id,
  daily.formulario_id,
  daily.fecha,
  sum(daily.cantidad_registros)::integer,
  now()
from (
  select
    records.sede_id,
    records.tipo_formulario as formulario_id,
    (records.fecha_hora_servidor at time zone 'America/Bogota')::date as fecha,
    count(*)::integer as cantidad_registros
  from public.thermal_control_records records
  group by records.sede_id, records.tipo_formulario, (records.fecha_hora_servidor at time zone 'America/Bogota')::date
  union all
  select
    records.sede_id,
    records.tipo_formulario as formulario_id,
    (records.fecha_hora_servidor at time zone 'America/Bogota')::date as fecha,
    count(*)::integer as cantidad_registros
  from public.area_sanitation_records records
  group by records.sede_id, records.tipo_formulario, (records.fecha_hora_servidor at time zone 'America/Bogota')::date
  union all
  select
    records.sede_id,
    records.tipo_formulario as formulario_id,
    (records.fecha_hora_servidor at time zone 'America/Bogota')::date as fecha,
    count(*)::integer as cantidad_registros
  from public.supply_reception_records records
  group by records.sede_id, records.tipo_formulario, (records.fecha_hora_servidor at time zone 'America/Bogota')::date
  union all
  select
    records.sede_id,
    records.tipo_formulario as formulario_id,
    (records.fecha_hora_servidor at time zone 'America/Bogota')::date as fecha,
    count(*)::integer as cantidad_registros
  from public.water_quality_records records
  group by records.sede_id, records.tipo_formulario, (records.fecha_hora_servidor at time zone 'America/Bogota')::date
) daily
group by daily.sede_id, daily.formulario_id, daily.fecha
on conflict (sede_id, formulario_id, fecha)
do update set
  cantidad_registros = excluded.cantidad_registros,
  updated_at = now();

insert into public.sedes_categorias_documentos (
  sede_id,
  categoria,
  estado_calculado,
  updated_at
)
select
  b.id,
  categories.categoria,
  'gris'::public.sede_documento_estado,
  now()
from public.branches b
cross join (
  select unnest(enum_range(null::public.sede_documento_categoria)) as categoria
) categories
on conflict (sede_id, categoria) do nothing;

select public.refresh_sedes_categorias_documentos();

create extension if not exists pg_cron with schema extensions;

do $$
begin
  if exists (
    select 1
    from pg_namespace
    where nspname = 'cron'
  ) and not exists (
    select 1
    from cron.job
    where jobname = 'refresh_sedes_categorias_documentos_daily'
  ) then
    perform cron.schedule(
      'refresh_sedes_categorias_documentos_daily',
      '5 0 * * *',
      'select public.refresh_sedes_categorias_documentos();'
    );
  end if;
exception
  when undefined_table or undefined_function or insufficient_privilege then
    raise notice 'No se pudo programar pg_cron; ejecuta public.refresh_sedes_categorias_documentos() diariamente desde Supabase Scheduled Functions o pg_cron.';
end $$;

create or replace function public.can_manage_branch_documents(target_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_access_branch(target_branch_id)
$$;

create or replace function public.current_profile_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select up.global_role
  from public.user_profiles up
  where up.user_id = auth.uid()
    and up.is_active = true
  limit 1
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
as $$
  select coalesce(public.current_profile_role() = 'owner', false)
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
as $$
  select coalesce(public.current_profile_role() = 'super_admin', false)
$$;

create or replace function public.can_access_company(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_owner()
    or public.is_super_admin()
    or (
      public.current_profile_role() = 'company_admin'
      and exists (
        select 1
        from public.companies c
        join public.user_profiles up
          on up.user_id = c.company_admin_user_id
        where c.id = target_company_id
          and c.company_admin_user_id = auth.uid()
          and up.is_active = true
      )
    )
$$;

create or replace function public.can_access_branch(target_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.branches b
    where b.id = target_branch_id
      and b.status <> 'deleted'
      and public.can_access_company(b.company_id)
  )
$$;

create or replace function public.update_current_company_name(target_name text)
returns table (
  company_id uuid,
  company_name text,
  company_slug text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_name text := btrim(coalesce(target_name, ''));
  updated_company public.companies%rowtype;
begin
  if auth.uid() is null or public.current_profile_role() is distinct from 'company_admin' then
    raise exception 'No autorizado.';
  end if;

  if char_length(normalized_name) not between 1 and 120 then
    raise exception 'El nombre del negocio no es válido.';
  end if;

  update public.companies
  set name = normalized_name
  where company_admin_user_id = auth.uid()
    and is_active = true
  returning * into updated_company;

  if not found then
    raise exception 'No fue posible encontrar el negocio.';
  end if;

  return query
  select updated_company.id, updated_company.name, updated_company.slug;
end;
$$;

-- This predicate deliberately has no user-access check. It is used by the
-- public QR RPCs, which run without an authenticated administrator session.
create or replace function public.company_has_operational_entitlement(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_subscriptions cs
    where cs.company_id = target_company_id
      and (
        cs.status = 'active'
        or (
          cs.status = 'payment_issue'
          and cs.payment_attention_required = true
          and cs.payment_grace_ends_at > now()
        )
        or (
          cs.status = 'trial'
          and cs.trial_ends_at >= now()
        )
      )
  )
$$;

create or replace function public.can_company_operate(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.company_has_operational_entitlement(target_company_id)
$$;

create or replace function public.get_company_contracted_capacity(target_company_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select case
        when cs.status = 'trial' and cs.trial_ends_at >= now() then 1
        when cs.status = 'active' then greatest(cs.max_active_locations, 0)
        when cs.status = 'payment_issue'
          and cs.payment_attention_required = true
          and cs.payment_grace_ends_at > now() then greatest(cs.max_active_locations, 0)
        else 0
      end
      from public.company_subscriptions cs
      where cs.company_id = target_company_id
        and public.can_access_company(cs.company_id)
      limit 1
    ),
    0
  )
$$;

create or replace function public.get_company_active_branch_count(target_company_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.branches b
  where b.company_id = target_company_id
    and b.status = 'active'
    and b.is_active = true
    and public.can_access_company(b.company_id)
$$;

create or replace function public.company_requires_capacity_resolution(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.can_company_operate(target_company_id)
    and public.get_company_active_branch_count(target_company_id) > public.get_company_contracted_capacity(target_company_id)
$$;

create or replace function public.apply_due_subscription_capacity_changes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  applied_count integer := 0;
  scheduled_change record;
  changed_count integer := 0;
  active_branch_count integer := 0;
  selected_branch_ids uuid[] := '{}'::uuid[];
  selected_active_branch_count integer := 0;
begin
  for scheduled_change in
    select
      scc.id,
      scc.company_id,
      scc.subscription_id,
      scc.requested_max_active_locations,
      scc.current_max_active_locations,
      scc.metadata,
      bi.id as intent_id,
      bi.monthly_amount_after_cop,
      (
        select bps.recurring_amount_cop
        from public.billing_provider_subscriptions bps
        where bps.subscription_id = scc.subscription_id
          and bps.ended_at is null
        limit 1
      ) as provider_recurring_amount_cop
    from public.subscription_capacity_changes scc
    join public.billing_intents bi
      on bi.capacity_change_id = scc.id
      and bi.intent_type = 'downgrade'
      and bi.status = 'succeeded'
    where scc.status = 'scheduled'
      and scc.effective_at <= now()
      and exists (
        select 1
        from public.billing_provider_subscriptions bps
        join public.billing_payments bp
          on bp.provider_subscription_record_id = bps.id
        where bps.subscription_id = scc.subscription_id
          and bps.company_id = scc.company_id
          and bps.ended_at is null
          and bp.company_id = scc.company_id
          and bp.normalized_status = 'approved'
          and bp.currency = 'COP'
          and bp.amount_cop = bi.monthly_amount_after_cop
          and coalesce(bp.approved_at, bp.provider_updated_at, bp.created_at) >= scc.effective_at
      )
    order by scc.effective_at asc, scc.created_at asc
    for update skip locked
  loop
    if scheduled_change.provider_recurring_amount_cop is distinct from scheduled_change.monthly_amount_after_cop then
      update public.billing_intents
      set
        status = 'compensation_required',
        last_error_code = 'downgrade_provider_amount_mismatch',
        last_error_message = 'El valor recurrente externo no coincide con el downgrade programado.'
      where id = scheduled_change.intent_id
        and status = 'succeeded';
      continue;
    end if;

    select coalesce(array_agg(candidate.branch_id), '{}'::uuid[])
    into selected_branch_ids
    from (
      select distinct selected_branch.selected_branch_id::uuid as branch_id
      from jsonb_array_elements_text(coalesce(scheduled_change.metadata -> 'selectedBranchIds', '[]'::jsonb)) as selected_branch(selected_branch_id)
      where selected_branch.selected_branch_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ) candidate;

    select count(*)::integer
    into active_branch_count
    from public.branches b
    where b.company_id = scheduled_change.company_id
      and b.status = 'active'
      and b.is_active = true;

    select count(*)::integer
    into selected_active_branch_count
    from public.branches b
    where b.company_id = scheduled_change.company_id
      and b.status = 'active'
      and b.is_active = true
      and b.id = any(selected_branch_ids);

    update public.company_subscriptions
    set max_active_locations = scheduled_change.requested_max_active_locations
    where id = scheduled_change.subscription_id
      and status = 'active'
      and max_active_locations = scheduled_change.current_max_active_locations;

    get diagnostics changed_count = row_count;

    if changed_count <> 1 then
      update public.billing_intents
      set
        status = 'compensation_required',
        last_error_code = 'downgrade_subscription_state_changed',
        last_error_message = 'La suscripción cambió antes de aplicar el downgrade programado.'
      where id = scheduled_change.intent_id
        and status = 'succeeded';
      continue;
    end if;

    if active_branch_count > scheduled_change.requested_max_active_locations
      and cardinality(selected_branch_ids) = scheduled_change.requested_max_active_locations
      and selected_active_branch_count = scheduled_change.requested_max_active_locations then
      update public.branches b
      set
        status = 'inactive',
        is_active = false,
        billing_activation_confirmed_at = null
      where b.company_id = scheduled_change.company_id
        and b.status = 'active'
        and b.is_active = true
        and not (b.id = any(selected_branch_ids));
    end if;

    update public.subscription_capacity_changes
    set
      status = 'applied',
      applied_at = now()
    where id = scheduled_change.id
      and status = 'scheduled';

    get diagnostics changed_count = row_count;

    if changed_count = 1 then
      update public.billing_intents
      set
        metadata = metadata || jsonb_build_object(
          'capacityAppliedAt', now(),
          'selectionAppliedAt', case
            when active_branch_count > scheduled_change.requested_max_active_locations
              and cardinality(selected_branch_ids) = scheduled_change.requested_max_active_locations
              and selected_active_branch_count = scheduled_change.requested_max_active_locations
            then now()
            else null
          end,
          'selectionRequiresManualResolution', active_branch_count > scheduled_change.requested_max_active_locations
            and not (
              cardinality(selected_branch_ids) = scheduled_change.requested_max_active_locations
              and selected_active_branch_count = scheduled_change.requested_max_active_locations
            )
        ),
        last_error_code = null,
        last_error_message = null
      where id = scheduled_change.intent_id
        and status = 'succeeded';

      applied_count := applied_count + 1;
    end if;
  end loop;

  return applied_count;
end;
$$;

update public.billing_intents bi
set
  status = 'succeeded',
  completed_at = coalesce(completed_at, bi.updated_at, now()),
  expires_at = null,
  last_error_code = null,
  last_error_message = null
from public.subscription_capacity_changes scc
where bi.capacity_change_id = scc.id
  and bi.intent_type = 'downgrade'
  and bi.status = 'processing'
  and scc.status = 'scheduled';

create or replace function public.expire_stale_billing_intents(target_company_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  expired_count integer := 0;
  expired_intent_ids uuid[] := '{}'::uuid[];
begin
  with expired as (
    update public.billing_intents
    set
      status = 'expired',
      completed_at = coalesce(completed_at, now()),
      last_error_code = 'intent_expired',
      last_error_message = 'La operación de billing venció antes de completarse.'
    where status in ('created', 'awaiting_customer', 'awaiting_payment', 'processing')
      and (
        (expires_at is not null and expires_at <= now())
        or (expires_at is null and updated_at <= now() - interval '24 hours')
      )
      and (target_company_id is null or company_id = target_company_id)
      and not (
        intent_type in ('activation', 'recovery')
        and exists (
          select 1
          from public.billing_provider_subscriptions bps
          where bps.billing_intent_id = billing_intents.id
            and bps.ended_at is null
        )
      )
      and not (
        intent_type = 'downgrade'
        and exists (
          select 1
          from public.subscription_capacity_changes scc
          where scc.id = billing_intents.capacity_change_id
            and scc.status = 'scheduled'
        )
      )
    returning id
  )
  select coalesce(array_agg(id), '{}'::uuid[]), count(*)::integer
  into expired_intent_ids, expired_count
  from expired;

  update public.billing_provider_subscriptions bps
  set
    ended_at = coalesce(ended_at, now()),
    provider_status = case
      when provider_status in ('pending', 'unknown') then 'expired'
      else provider_status
    end
  where bps.billing_intent_id = any(expired_intent_ids)
    and bps.ended_at is null
    and exists (
      select 1
      from public.company_subscriptions cs
      where cs.id = bps.subscription_id
        and cs.company_id = bps.company_id
        and cs.status in ('trial', 'cancelled', 'suspended')
    );

  return expired_count;
end;
$$;

create or replace function public.claim_billing_activation_attempt_closure(
  target_intent_id uuid,
  target_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  intent_row public.billing_intents%rowtype;
begin
  select * into intent_row
  from public.billing_intents
  where id = target_intent_id
  for update;

  if not found or intent_row.intent_type not in ('activation', 'recovery') then
    raise exception 'La activación o reactivación no está disponible.';
  end if;

  if intent_row.status = 'succeeded' then
    return false;
  end if;

  update public.billing_intents
  set metadata = metadata || jsonb_build_object(
    'activationClosureRequested', true,
    'activationClosureReason', target_reason,
    'activationClosureRequestedAt', now()
  )
  where id = intent_row.id;

  return true;
end;
$$;

create or replace function public.close_billing_activation_attempt(
  target_intent_id uuid,
  target_provider_subscription_record_id uuid,
  target_provider_status text,
  target_provider_updated_at timestamptz,
  target_intent_status public.billing_intent_status,
  target_error_code text,
  target_error_message text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  intent_row public.billing_intents%rowtype;
begin
  if target_intent_status not in ('failed', 'cancelled', 'expired') then
    raise exception 'El estado terminal solicitado no es válido.';
  end if;

  select * into intent_row
  from public.billing_intents
  where id = target_intent_id
  for update;

  if not found or intent_row.intent_type not in ('activation', 'recovery') then
    raise exception 'La activación o reactivación no está disponible.';
  end if;

  if intent_row.status = 'succeeded' then
    return false;
  end if;

  if coalesce((intent_row.metadata ->> 'activationClosureRequested')::boolean, false) is not true then
    raise exception 'La activación no reservó su cierre antes de cancelar el preapproval.';
  end if;

  update public.billing_provider_subscriptions
  set
    provider_status = target_provider_status,
    provider_updated_at = coalesce(target_provider_updated_at, provider_updated_at),
    ended_at = coalesce(ended_at, target_provider_updated_at, now())
  where id = target_provider_subscription_record_id
    and billing_intent_id = intent_row.id
    and company_id = intent_row.company_id;

  if not found then
    raise exception 'La suscripción externa de la activación no está disponible.';
  end if;

  update public.billing_intents
  set
    status = target_intent_status,
    completed_at = coalesce(completed_at, now()),
    last_error_code = target_error_code,
    last_error_message = target_error_message
  where id = intent_row.id;

  return true;
end;
$$;

create or replace function public.complete_billing_cancellation(
  target_intent_id uuid,
  target_provider_subscription_record_id uuid,
  target_provider_status text,
  target_provider_version bigint,
  target_provider_updated_at timestamptz,
  target_requested_at timestamptz,
  target_effective_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  intent_row public.billing_intents%rowtype;
  subscription_row public.company_subscriptions%rowtype;
  resolved_effective_at timestamptz;
  is_immediate_cancellation boolean := false;
begin
  if lower(trim(coalesce(target_provider_status, ''))) not in ('canceled', 'cancelled') then
    raise exception 'Mercado Pago no confirmó la cancelación del preapproval.';
  end if;

  select * into intent_row
  from public.billing_intents
  where id = target_intent_id
  for update;

  if not found or intent_row.intent_type <> 'cancellation' then
    raise exception 'La cancelación solicitada no está disponible.';
  end if;

  if intent_row.status = 'succeeded' then
    return false;
  end if;

  if intent_row.status <> 'processing' then
    raise exception 'La cancelación no se encuentra en procesamiento.';
  end if;

  select * into subscription_row
  from public.company_subscriptions
  where id = intent_row.subscription_id
    and company_id = intent_row.company_id
  for update;

  if not found or subscription_row.status not in ('active', 'payment_issue', 'suspended', 'cancelled') then
    raise exception 'La suscripción interna ya no admite cancelación.';
  end if;

  if target_requested_at is null or target_effective_at is null or target_effective_at < target_requested_at then
    raise exception 'El periodo efectivo de cancelación no es válido.';
  end if;

  is_immediate_cancellation := subscription_row.status in ('payment_issue', 'suspended');

  if is_immediate_cancellation and target_effective_at <> target_requested_at then
    raise exception 'La cancelación de una suscripción con pago pendiente o suspendida debe ser inmediata.';
  end if;

  resolved_effective_at := case
    when is_immediate_cancellation then target_requested_at
    else greatest(
      target_effective_at,
      subscription_row.current_period_ends_at,
      subscription_row.cancellation_effective_at
    )
  end;

  update public.billing_provider_subscriptions
  set
    provider_status = target_provider_status,
    provider_version = coalesce(target_provider_version, provider_version),
    provider_updated_at = coalesce(target_provider_updated_at, provider_updated_at),
    next_payment_at = null,
    ended_at = coalesce(ended_at, target_provider_updated_at, target_requested_at, now())
  where id = target_provider_subscription_record_id
    and subscription_id = subscription_row.id
    and company_id = subscription_row.company_id
    and provider = 'mercado_pago';

  if not found then
    raise exception 'La suscripción externa no corresponde a la empresa indicada.';
  end if;

  update public.company_subscriptions
  set
    status = case when is_immediate_cancellation or resolved_effective_at <= now() then 'cancelled' else status end,
    plan_type = case
      when (is_immediate_cancellation or resolved_effective_at <= now()) and plan_type = 'founder' then 'operational'
      else plan_type
    end,
    base_monthly_price_cop = case
      when (is_immediate_cancellation or resolved_effective_at <= now()) and plan_type = 'founder' then 24900
      else base_monthly_price_cop
    end,
    cancellation_requested_at = coalesce(cancellation_requested_at, target_requested_at),
    cancellation_effective_at = resolved_effective_at,
    payment_attention_required = case when is_immediate_cancellation or resolved_effective_at <= now() then false else payment_attention_required end,
    payment_grace_ends_at = case when is_immediate_cancellation or resolved_effective_at <= now() then null else payment_grace_ends_at end
  where id = subscription_row.id;

  update public.subscription_capacity_changes
  set
    status = 'cancelled',
    cancelled_at = coalesce(cancelled_at, target_requested_at)
  where subscription_id = subscription_row.id
    and company_id = subscription_row.company_id
    and status = 'scheduled';

  update public.billing_intents
  set
    status = 'succeeded',
    completed_at = coalesce(completed_at, target_requested_at),
    expires_at = null,
    last_error_code = null,
    last_error_message = null,
    metadata = metadata || jsonb_build_object(
      'providerSubscriptionId', target_provider_subscription_record_id,
      'cancellationEffectiveAt', resolved_effective_at
    )
  where id = intent_row.id;

  if (is_immediate_cancellation or resolved_effective_at <= now()) and subscription_row.status <> 'cancelled' then
    insert into public.subscription_status_history (
      company_id,
      subscription_id,
      from_status,
      to_status,
      reason,
      source,
      billing_intent_id,
      actor_user_id,
      deduplication_key,
      metadata,
      occurred_at
    ) values (
      subscription_row.company_id,
      subscription_row.id,
      subscription_row.status,
      'cancelled',
      'subscription_cancellation_effective',
      'billing',
      intent_row.id,
      intent_row.requested_by,
      'subscription_cancellation_effective:' || subscription_row.id,
      jsonb_build_object(
        'effectiveAt', resolved_effective_at,
        'fromPlanType', subscription_row.plan_type,
        'toPlanType', case when subscription_row.plan_type = 'founder' then 'operational' else subscription_row.plan_type end
      ),
      resolved_effective_at
    )
    on conflict (deduplication_key) do nothing;
  end if;

  return true;
end;
$$;

create or replace function public.apply_recurring_billing_payment_state(
  target_provider_subscription_record_id uuid,
  target_payment_id uuid,
  target_webhook_event_id uuid,
  target_normalized_status public.billing_payment_status,
  target_period_started_at timestamptz,
  target_period_ends_at timestamptz,
  target_occurred_at timestamptz,
  target_retry_attempt integer,
  target_debit_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  provider_subscription_row public.billing_provider_subscriptions%rowtype;
  payment_row public.billing_payments%rowtype;
  subscription_row public.company_subscriptions%rowtype;
  next_status public.company_subscription_status;
  protected_period_started_at timestamptz;
  protected_period_ends_at timestamptz;
  protected_cancellation_effective_at timestamptz;
  payment_grace_ends_at timestamptz;
begin
  if coalesce(target_retry_attempt, 0) < 0 then
    raise exception 'El intento de cobro recurrente no es válido.';
  end if;

  select * into provider_subscription_row
  from public.billing_provider_subscriptions
  where id = target_provider_subscription_record_id;

  if not found then
    raise exception 'La suscripción externa no está disponible.';
  end if;

  select * into subscription_row
  from public.company_subscriptions
  where id = provider_subscription_row.subscription_id
    and company_id = provider_subscription_row.company_id
  for update;

  if not found then
    raise exception 'La suscripción interna no está disponible.';
  end if;

  select * into payment_row
  from public.billing_payments
  where id = target_payment_id
    and company_id = provider_subscription_row.company_id
    and provider_subscription_record_id = provider_subscription_row.id
  for update;

  if not found
    or payment_row.normalized_status <> target_normalized_status
    or payment_row.currency <> 'COP' then
    raise exception 'El pago recurrente no corresponde a la suscripción.';
  end if;

  if subscription_row.status in ('trial', 'cancelled') then
    return false;
  end if;

  if target_normalized_status = 'approved' then
    if target_period_started_at is null
      or target_period_ends_at is null
      or target_period_ends_at <= target_period_started_at then
      raise exception 'El periodo de renovación aprobado no es válido.';
    end if;

    protected_period_ends_at := greatest(
      subscription_row.current_period_ends_at,
      target_period_ends_at
    );
    protected_period_started_at := case
      when subscription_row.current_period_ends_at is not null
        and subscription_row.current_period_ends_at >= target_period_ends_at
        and subscription_row.current_period_started_at is not null
      then subscription_row.current_period_started_at
      else target_period_started_at
    end;
    protected_cancellation_effective_at := case
      when subscription_row.cancellation_requested_at is not null then greatest(
        subscription_row.cancellation_effective_at,
        protected_period_ends_at
      )
      else null
    end;
    next_status := 'active';

    update public.company_subscriptions
    set
      status = next_status,
      payment_method_status = 'configured',
      payment_attention_required = false,
      last_payment_issue_at = null,
      payment_grace_ends_at = null,
      last_successful_payment_at = greatest(last_successful_payment_at, coalesce(payment_row.approved_at, target_occurred_at, now())),
      current_period_started_at = protected_period_started_at,
      current_period_ends_at = protected_period_ends_at,
      cancellation_effective_at = protected_cancellation_effective_at
    where id = subscription_row.id;
  elsif target_normalized_status in ('rejected', 'cancelled', 'charged_back') then
    if subscription_row.cancellation_requested_at is not null then
      next_status := subscription_row.status;

      update public.company_subscriptions
      set
        payment_attention_required = false,
        payment_grace_ends_at = null
      where id = subscription_row.id;
    elsif subscription_row.status = 'suspended' or target_normalized_status = 'charged_back' then
      next_status := 'suspended';

      update public.company_subscriptions
      set
        status = next_status,
        payment_attention_required = true,
        last_payment_issue_at = coalesce(target_occurred_at, now()),
        payment_grace_ends_at = null
      where id = subscription_row.id;
    else
      payment_grace_ends_at := coalesce(
        subscription_row.payment_grace_ends_at,
        coalesce(target_debit_at, subscription_row.current_period_ends_at, target_occurred_at, now()) + interval '10 days'
      );
      next_status := 'payment_issue';

      update public.company_subscriptions
      set
        status = next_status,
        payment_attention_required = true,
        last_payment_issue_at = coalesce(target_occurred_at, now()),
        payment_grace_ends_at = payment_grace_ends_at
      where id = subscription_row.id;
    end if;
  else
    return false;
  end if;

  if subscription_row.status <> next_status then
    insert into public.subscription_status_history (
      company_id,
      subscription_id,
      from_status,
      to_status,
      reason,
      source,
      billing_payment_id,
      webhook_event_id,
      deduplication_key,
      metadata,
      occurred_at
    ) values (
      subscription_row.company_id,
      subscription_row.id,
      subscription_row.status,
      next_status,
      case
        when next_status = 'active' then 'recurring_subscription_payment_approved'
        when next_status = 'suspended' then 'recurring_subscription_payment_chargeback'
        else 'recurring_subscription_payment_retry_window_started'
      end,
      'webhook',
      payment_row.id,
      target_webhook_event_id,
      'mercado_pago_recurring_payment:' || payment_row.provider_payment_id || ':' || next_status::text,
      jsonb_build_object(
        'provider', 'mercado_pago',
        'providerPaymentId', payment_row.provider_payment_id,
        'providerStatus', payment_row.provider_status,
        'retryAttempt', coalesce(target_retry_attempt, 0),
        'paymentGraceEndsAt', payment_grace_ends_at
      ),
      coalesce(target_occurred_at, now())
    )
    on conflict (deduplication_key) do nothing;
  end if;

  if target_normalized_status = 'approved' then
    perform public.apply_due_subscription_capacity_changes();
  end if;

  return true;
end;
$$;

create or replace function public.apply_billing_provider_cancellation_state(
  target_provider_subscription_record_id uuid,
  target_provider_status text,
  target_provider_updated_at timestamptz,
  target_webhook_event_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  provider_subscription_row public.billing_provider_subscriptions%rowtype;
  subscription_row public.company_subscriptions%rowtype;
  cancellation_at timestamptz;
  protected_effective_at timestamptz;
  next_status public.company_subscription_status;
  transition_reason text;
begin
  if lower(trim(coalesce(target_provider_status, ''))) not in ('canceled', 'cancelled') then
    raise exception 'El estado externo no corresponde a una cancelación.';
  end if;

  select * into provider_subscription_row
  from public.billing_provider_subscriptions
  where id = target_provider_subscription_record_id;

  if not found then
    raise exception 'La suscripción externa no está disponible.';
  end if;

  select * into subscription_row
  from public.company_subscriptions
  where id = provider_subscription_row.subscription_id
    and company_id = provider_subscription_row.company_id
  for update;

  if not found then
    raise exception 'La suscripción interna no está disponible.';
  end if;

  if subscription_row.status = 'trial' then
    update public.company_subscriptions
    set mercado_pago_subscription_id = provider_subscription_row.provider_subscription_id
    where id = subscription_row.id;

    return false;
  end if;

  cancellation_at := coalesce(target_provider_updated_at, now());

  if subscription_row.cancellation_requested_at is null then
    next_status := 'suspended';
    transition_reason := 'provider_subscription_cancelled_after_payment_failure';

    update public.company_subscriptions
    set
      mercado_pago_subscription_id = provider_subscription_row.provider_subscription_id,
      status = next_status,
      payment_attention_required = true,
      last_payment_issue_at = cancellation_at,
      payment_grace_ends_at = null
    where id = subscription_row.id;
  else
    protected_effective_at := case
      when subscription_row.status in ('payment_issue', 'suspended', 'cancelled')
        then coalesce(subscription_row.cancellation_effective_at, cancellation_at)
      else greatest(
        cancellation_at,
        subscription_row.current_period_ends_at,
        subscription_row.cancellation_effective_at
      )
    end;
    next_status := case
      when protected_effective_at <= now() then 'cancelled'
      else subscription_row.status
    end;
    transition_reason := 'provider_subscription_cancelled';

    update public.company_subscriptions
    set
      mercado_pago_subscription_id = provider_subscription_row.provider_subscription_id,
      status = next_status,
      cancellation_effective_at = protected_effective_at,
      payment_attention_required = case
        when next_status = 'cancelled' then false
        else payment_attention_required
      end,
      payment_grace_ends_at = case
        when next_status = 'cancelled' then null
        else payment_grace_ends_at
      end
    where id = subscription_row.id;
  end if;

  if subscription_row.status <> next_status then
    insert into public.subscription_status_history (
      company_id,
      subscription_id,
      from_status,
      to_status,
      reason,
      source,
      webhook_event_id,
      deduplication_key,
      metadata,
      occurred_at
    ) values (
      subscription_row.company_id,
      subscription_row.id,
      subscription_row.status,
      next_status,
      transition_reason,
      'webhook',
      target_webhook_event_id,
      'mercado_pago_preapproval:' || provider_subscription_row.provider_subscription_id || ':' || next_status::text,
      jsonb_build_object(
        'provider', 'mercado_pago',
        'providerSubscriptionId', provider_subscription_row.provider_subscription_id,
        'providerStatus', target_provider_status,
        'effectiveAt', protected_effective_at
      ),
      cancellation_at
    )
    on conflict (deduplication_key) do nothing;
  end if;

  return true;
end;
$$;

create or replace function public.complete_billing_payment_method_update(
  target_intent_id uuid,
  target_provider_subscription_record_id uuid,
  target_provider_status text,
  target_provider_version bigint,
  target_provider_updated_at timestamptz,
  target_next_payment_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  intent_row public.billing_intents%rowtype;
  subscription_row public.company_subscriptions%rowtype;
begin
  select * into intent_row
  from public.billing_intents
  where id = target_intent_id
  for update;

  if not found or intent_row.intent_type <> 'payment_method_update' then
    raise exception 'La actualización del método de pago no está disponible.';
  end if;

  if intent_row.status = 'succeeded' then
    return false;
  end if;

  if intent_row.status <> 'processing' then
    raise exception 'La actualización del método de pago no se encuentra en procesamiento.';
  end if;

  if lower(trim(coalesce(target_provider_status, ''))) in ('canceled', 'cancelled') then
    raise exception 'La suscripción externa está cancelada.';
  end if;

  select * into subscription_row
  from public.company_subscriptions
  where id = intent_row.subscription_id
    and company_id = intent_row.company_id
  for update;

  if not found or subscription_row.status not in ('active', 'payment_issue', 'suspended') then
    raise exception 'La suscripción interna no admite actualizar el método de pago.';
  end if;

  if subscription_row.cancellation_requested_at is not null then
    raise exception 'La suscripción ya tiene una cancelación programada.';
  end if;

  update public.billing_provider_subscriptions
  set
    provider_status = target_provider_status,
    provider_version = coalesce(target_provider_version, provider_version),
    provider_updated_at = coalesce(target_provider_updated_at, provider_updated_at),
    next_payment_at = target_next_payment_at,
    ended_at = null
  where id = target_provider_subscription_record_id
    and subscription_id = subscription_row.id
    and company_id = subscription_row.company_id
    and provider = 'mercado_pago';

  if not found then
    raise exception 'La suscripción externa no corresponde a la empresa indicada.';
  end if;

  update public.company_subscriptions
  set payment_method_status = 'configured'
  where id = subscription_row.id;

  update public.billing_intents
  set
    status = 'succeeded',
    completed_at = coalesce(target_provider_updated_at, now()),
    expires_at = null,
    last_error_code = null,
    last_error_message = null,
    metadata = metadata || jsonb_build_object(
      'providerSubscriptionId', target_provider_subscription_record_id,
      'providerStatus', target_provider_status
    )
  where id = intent_row.id;

  return true;
end;
$$;

create or replace function public.finalize_due_subscription_cancellations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  finalized_count integer := 0;
begin
  with due_cancellations as (
    select
      cs.id,
      cs.company_id,
      cs.status as from_status,
      cs.plan_type as from_plan_type,
      cs.cancellation_effective_at
    from public.company_subscriptions cs
    where cs.status in ('active', 'payment_issue', 'suspended')
      and cs.cancellation_requested_at is not null
      and cs.cancellation_effective_at is not null
      and cs.cancellation_effective_at <= now()
    for update skip locked
  ), finalized_cancellations as (
    update public.company_subscriptions cs
    set
      status = 'cancelled',
      plan_type = case when cs.plan_type = 'founder' then 'operational' else cs.plan_type end,
      base_monthly_price_cop = case when cs.plan_type = 'founder' then 24900 else cs.base_monthly_price_cop end,
      payment_attention_required = false,
      payment_grace_ends_at = null
    from due_cancellations
    where cs.id = due_cancellations.id
    returning cs.id, cs.company_id, due_cancellations.from_status, due_cancellations.from_plan_type, due_cancellations.cancellation_effective_at
  ), cancellation_history as (
    insert into public.subscription_status_history (
      company_id,
      subscription_id,
      from_status,
      to_status,
      reason,
      source,
      billing_intent_id,
      actor_user_id,
      deduplication_key,
      metadata,
      occurred_at
    )
    select
      finalized_cancellations.company_id,
      finalized_cancellations.id,
      finalized_cancellations.from_status,
      'cancelled',
      'subscription_cancellation_effective',
      'billing',
      cancellation_intent.id,
      cancellation_intent.requested_by,
      'subscription_cancellation_effective:' || finalized_cancellations.id,
      jsonb_build_object(
        'effectiveAt', finalized_cancellations.cancellation_effective_at,
        'fromPlanType', finalized_cancellations.from_plan_type,
        'toPlanType', case when finalized_cancellations.from_plan_type = 'founder' then 'operational' else finalized_cancellations.from_plan_type end
      ),
      finalized_cancellations.cancellation_effective_at
    from finalized_cancellations
    left join lateral (
      select bi.id, bi.requested_by
      from public.billing_intents bi
      where bi.subscription_id = finalized_cancellations.id
        and bi.company_id = finalized_cancellations.company_id
        and bi.intent_type = 'cancellation'
      order by bi.created_at desc
      limit 1
    ) cancellation_intent on true
    on conflict (deduplication_key) do nothing
    returning id
  ), due_payment_issues as (
    select
      cs.id,
      cs.company_id,
      cs.status as from_status,
      cs.payment_grace_ends_at,
      cs.last_payment_issue_at
    from public.company_subscriptions cs
    where cs.status = 'payment_issue'
      and cs.cancellation_requested_at is null
      and cs.payment_attention_required = true
      and cs.payment_grace_ends_at is not null
      and cs.payment_grace_ends_at <= now()
    for update skip locked
  ), finalized_payment_issues as (
    update public.company_subscriptions cs
    set
      status = 'suspended',
      payment_grace_ends_at = null
    from due_payment_issues
    where cs.id = due_payment_issues.id
    returning
      cs.id,
      cs.company_id,
      due_payment_issues.from_status,
      due_payment_issues.payment_grace_ends_at,
      due_payment_issues.last_payment_issue_at
  ), payment_issue_history as (
    insert into public.subscription_status_history (
      company_id,
      subscription_id,
      from_status,
      to_status,
      reason,
      source,
      deduplication_key,
      metadata,
      occurred_at
    )
    select
      finalized_payment_issues.company_id,
      finalized_payment_issues.id,
      finalized_payment_issues.from_status,
      'suspended',
      'recurring_subscription_payment_grace_ended',
      'billing',
      'recurring_subscription_payment_grace_ended:' || finalized_payment_issues.id || ':' || finalized_payment_issues.last_payment_issue_at::text,
      jsonb_build_object('graceEndsAt', finalized_payment_issues.payment_grace_ends_at),
      finalized_payment_issues.payment_grace_ends_at
    from finalized_payment_issues
    on conflict (deduplication_key) do nothing
    returning id
  )
  select count(*)::integer into finalized_count
  from (
    select id from finalized_cancellations
    union all
    select id from finalized_payment_issues
  ) finalized;

  return finalized_count;
end;
$$;

create or replace function public.complete_billing_activation(
  target_intent_id uuid,
  target_payment_id uuid,
  target_webhook_event_id uuid,
  target_period_started_at timestamptz,
  target_period_ends_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  intent_row public.billing_intents%rowtype;
  payment_row public.billing_payments%rowtype;
  subscription_row public.company_subscriptions%rowtype;
  provider_subscription_row public.billing_provider_subscriptions%rowtype;
begin
  select * into intent_row
  from public.billing_intents
  where id = target_intent_id
  for update;

  if not found then
    raise exception 'La activación no está disponible.';
  end if;

  if intent_row.status = 'succeeded' then
    return false;
  end if;

  if intent_row.intent_type not in ('activation', 'recovery')
    or intent_row.requested_max_active_locations is null
    or intent_row.expected_immediate_amount_cop is null
    or coalesce((intent_row.metadata ->> 'activationClosureRequested')::boolean, false) then
    raise exception 'La activación no admite la aplicación del pago.';
  end if;

  select * into payment_row
  from public.billing_payments
  where id = target_payment_id
    and company_id = intent_row.company_id
    and billing_intent_id = intent_row.id
  for update;

  if not found
    or payment_row.normalized_status <> 'approved'
    or payment_row.currency <> 'COP'
    or payment_row.amount_cop <> intent_row.expected_immediate_amount_cop then
    raise exception 'El pago aprobado no corresponde a la activación.';
  end if;

  select * into provider_subscription_row
  from public.billing_provider_subscriptions
  where billing_intent_id = intent_row.id
    and company_id = intent_row.company_id
  for update;

  if not found then
    raise exception 'La suscripción externa no corresponde a la activación o reactivación.';
  end if;

  select * into subscription_row
  from public.company_subscriptions
  where id = intent_row.subscription_id
    and company_id = intent_row.company_id
  for update;

  if not found
    or (intent_row.intent_type = 'activation' and subscription_row.status <> 'trial')
    or (intent_row.intent_type = 'recovery' and subscription_row.status not in ('cancelled', 'suspended')) then
    raise exception 'La suscripción interna ya no admite la activación o reactivación.';
  end if;

  update public.company_subscriptions
  set
    status = 'active',
    plan_type = intent_row.plan_type_snapshot,
    max_active_locations = intent_row.requested_max_active_locations,
    mercado_pago_subscription_id = provider_subscription_row.provider_subscription_id,
    payment_method_status = 'configured',
    current_period_started_at = target_period_started_at,
    current_period_ends_at = target_period_ends_at,
    billing_cycle_anchor_at = target_period_started_at,
    cancellation_requested_at = null,
    cancellation_effective_at = null,
    payment_attention_required = false,
    payment_grace_ends_at = null,
    last_successful_payment_at = coalesce(payment_row.approved_at, target_period_started_at)
  where id = subscription_row.id;

  update public.billing_provider_subscriptions
  set
    ended_at = coalesce(ended_at, now()),
    provider_status = case
      when id = provider_subscription_row.id then provider_status
      else 'replaced'
    end
  where subscription_id = subscription_row.id
    and company_id = subscription_row.company_id
    and id <> provider_subscription_row.id
    and ended_at is null;

  update public.billing_intents
  set
    status = 'succeeded',
    completed_at = coalesce(payment_row.approved_at, now()),
    last_error_code = null,
    last_error_message = null
  where id = intent_row.id;

  insert into public.subscription_status_history (
    company_id,
    subscription_id,
    from_status,
    to_status,
    reason,
    source,
    billing_intent_id,
    billing_payment_id,
    webhook_event_id,
    deduplication_key,
    metadata,
    occurred_at
  ) values (
    intent_row.company_id,
    intent_row.subscription_id,
    subscription_row.status,
    'active',
    case
      when intent_row.intent_type = 'recovery' then 'subscription_reactivation_payment_approved'
      else 'initial_subscription_payment_approved'
    end,
    'webhook',
    intent_row.id,
    payment_row.id,
    target_webhook_event_id,
    case
      when intent_row.intent_type = 'recovery' then 'mercado_pago_reactivation_payment_approved:' || payment_row.provider_payment_id
      else 'mercado_pago_payment_approved:' || payment_row.provider_payment_id
    end,
    jsonb_build_object(
      'provider', 'mercado_pago',
      'providerPaymentId', payment_row.provider_payment_id,
      'providerSubscriptionId', provider_subscription_row.provider_subscription_id
    ),
    coalesce(payment_row.approved_at, now())
  ) on conflict (deduplication_key) do nothing;

  return true;
end;
$$;

create or replace function public.apply_billing_payment_reversal(
  target_payment_id uuid,
  target_webhook_event_id uuid,
  target_is_current_entitlement boolean,
  target_next_subscription_status public.company_subscription_status,
  target_capacity integer,
  target_recurring_amount_cop integer,
  target_provider_status text,
  target_provider_version integer,
  target_provider_updated_at timestamptz,
  target_next_payment_at timestamptz,
  target_occurred_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_row public.billing_payments%rowtype;
  provider_row public.billing_provider_subscriptions%rowtype;
  subscription_row public.company_subscriptions%rowtype;
  intent_row public.billing_intents%rowtype;
  reversal_key text;
begin
  select * into payment_row
  from public.billing_payments
  where id = target_payment_id
  for update;

  if not found or payment_row.normalized_status not in ('refunded', 'charged_back') then
    raise exception 'El pago no representa una reversión financiera completa.';
  end if;

  select * into provider_row
  from public.billing_provider_subscriptions
  where id = payment_row.provider_subscription_record_id
    and company_id = payment_row.company_id
  for update;

  if not found then
    raise exception 'La suscripción externa del pago no está disponible.';
  end if;

  select * into subscription_row
  from public.company_subscriptions
  where id = provider_row.subscription_id
    and company_id = payment_row.company_id
  for update;

  if not found then
    raise exception 'La suscripción interna del pago no está disponible.';
  end if;

  if payment_row.billing_intent_id is not null then
    select * into intent_row
    from public.billing_intents
    where id = payment_row.billing_intent_id
      and company_id = payment_row.company_id
    for update;
  end if;

  if target_provider_status is not null or target_recurring_amount_cop is not null then
    update public.billing_provider_subscriptions
    set
      provider_status = coalesce(target_provider_status, provider_status),
      provider_version = coalesce(target_provider_version, provider_version),
      provider_updated_at = coalesce(target_provider_updated_at, provider_updated_at),
      recurring_amount_cop = coalesce(target_recurring_amount_cop, recurring_amount_cop),
      next_payment_at = coalesce(target_next_payment_at, next_payment_at),
      ended_at = case
        when lower(coalesce(target_provider_status, provider_status)) in ('canceled', 'cancelled')
          then coalesce(ended_at, target_provider_updated_at, now())
        else ended_at
      end
    where id = provider_row.id;
  end if;

  if target_is_current_entitlement then
    update public.company_subscriptions
    set
      status = coalesce(target_next_subscription_status, status),
      max_active_locations = coalesce(target_capacity, max_active_locations),
      payment_attention_required = case
        when target_next_subscription_status is null then payment_attention_required
        else target_next_subscription_status in ('payment_issue', 'cancelled')
      end,
      last_payment_issue_at = case
        when target_next_subscription_status in ('payment_issue', 'cancelled') then coalesce(target_occurred_at, now())
        else last_payment_issue_at
      end,
      cancellation_requested_at = case
        when target_next_subscription_status = 'cancelled' then coalesce(cancellation_requested_at, target_occurred_at, now())
        else cancellation_requested_at
      end,
      cancellation_effective_at = case
        when target_next_subscription_status = 'cancelled' then coalesce(target_occurred_at, now())
        else cancellation_effective_at
      end
    where id = subscription_row.id;
  else
    update public.company_subscriptions
    set
      payment_attention_required = true,
      last_payment_issue_at = coalesce(target_occurred_at, now())
    where id = subscription_row.id;
  end if;

  if intent_row.id is not null and intent_row.intent_type = 'upgrade' then
    update public.billing_intents
    set
      status = case
        when payment_row.refunded_amount_cop > 0 and payment_row.refunded_amount_cop < payment_row.amount_cop
          then 'compensation_required'::public.billing_intent_status
        else 'cancelled'::public.billing_intent_status
      end,
      completed_at = coalesce(completed_at, target_occurred_at, now()),
      last_error_code = case
        when payment_row.refunded_amount_cop > 0 and payment_row.refunded_amount_cop < payment_row.amount_cop
          then 'partial_upgrade_refund_requires_compensation'
        else 'upgrade_payment_reversed'
      end,
      last_error_message = case
        when payment_row.refunded_amount_cop > 0 and payment_row.refunded_amount_cop < payment_row.amount_cop
          then 'El upgrade recibió un reembolso parcial y requiere conciliación manual.'
        else 'El pago proporcional del upgrade fue revertido por Mercado Pago.'
      end,
      metadata = metadata || jsonb_build_object(
        'reversedAt', coalesce(target_occurred_at, now()),
        'reversalPaymentId', payment_row.provider_payment_id,
        'reversalType', payment_row.normalized_status
      )
    where id = intent_row.id;

    if target_capacity is not null then
      update public.subscription_capacity_changes
      set status = 'cancelled', cancelled_at = coalesce(cancelled_at, target_occurred_at, now())
      where company_id = payment_row.company_id
        and status = 'scheduled';

      update public.billing_intents
      set
        status = 'cancelled',
        completed_at = coalesce(completed_at, target_occurred_at, now()),
        last_error_code = 'cancelled_by_payment_reversal',
        last_error_message = 'El cambio programado fue cancelado por una reversión financiera.'
      where company_id = payment_row.company_id
        and intent_type = 'downgrade'
        and status in ('created', 'awaiting_customer', 'awaiting_payment', 'processing');
    end if;
  end if;

  reversal_key := 'billing_payment_reversal:' || payment_row.provider || ':' || payment_row.provider_payment_id || ':' || payment_row.normalized_status;

  if target_next_subscription_status is not null
    and subscription_row.status is distinct from target_next_subscription_status then
    insert into public.subscription_status_history (
      company_id,
      subscription_id,
      from_status,
      to_status,
      reason,
      source,
      billing_intent_id,
      billing_payment_id,
      webhook_event_id,
      deduplication_key,
      metadata,
      occurred_at
    ) values (
      payment_row.company_id,
      provider_row.subscription_id,
      subscription_row.status,
      target_next_subscription_status,
      'payment_' || payment_row.normalized_status,
      'webhook',
      payment_row.billing_intent_id,
      payment_row.id,
      target_webhook_event_id,
      reversal_key,
      jsonb_build_object('providerPaymentId', payment_row.provider_payment_id),
      coalesce(target_occurred_at, now())
    ) on conflict (deduplication_key) do nothing;
  end if;

  return true;
end;
$$;

create or replace function public.complete_billing_upgrade(
  target_intent_id uuid,
  target_payment_id uuid,
  target_provider_subscription_record_id uuid,
  target_provider_status text,
  target_provider_version integer,
  target_provider_updated_at timestamptz,
  target_next_payment_at timestamptz,
  target_completed_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  intent_row public.billing_intents%rowtype;
  payment_row public.billing_payments%rowtype;
  provider_subscription_row public.billing_provider_subscriptions%rowtype;
  current_capacity integer;
  current_subscription_status public.company_subscription_status;
begin
  select *
  into intent_row
  from public.billing_intents
  where id = target_intent_id
  for update;

  if not found then
    raise exception 'La operación de billing no está disponible.';
  end if;

  if intent_row.status = 'succeeded' then
    return false;
  end if;

  if intent_row.intent_type <> 'upgrade'
    or intent_row.status not in ('created', 'awaiting_customer', 'awaiting_payment', 'processing')
    or intent_row.requested_max_active_locations is null
    or intent_row.previous_max_active_locations is null
    or intent_row.monthly_amount_after_cop is null
    or intent_row.expected_immediate_amount_cop is null then
    raise exception 'La operación de billing no admite este cambio.';
  end if;

  select *
  into payment_row
  from public.billing_payments
  where id = target_payment_id
    and company_id = intent_row.company_id
    and billing_intent_id = intent_row.id
  for update;

  if not found
    or payment_row.normalized_status <> 'approved'
    or payment_row.currency <> 'COP'
    or payment_row.amount_cop <> intent_row.expected_immediate_amount_cop then
    raise exception 'El pago aprobado no corresponde al upgrade solicitado.';
  end if;

  select *
  into provider_subscription_row
  from public.billing_provider_subscriptions
  where id = target_provider_subscription_record_id
    and company_id = intent_row.company_id
    and subscription_id = intent_row.subscription_id
    and provider = 'mercado_pago'
    and ended_at is null
  for update;

  if not found then
    raise exception 'La suscripción externa no está disponible.';
  end if;

  select max_active_locations, status
  into current_capacity, current_subscription_status
  from public.company_subscriptions
  where id = intent_row.subscription_id
    and company_id = intent_row.company_id
  for update;

  if not found or current_subscription_status <> 'active' then
    raise exception 'La suscripción interna no admite el upgrade.';
  end if;

  if current_capacity <> intent_row.previous_max_active_locations
    and current_capacity <> intent_row.requested_max_active_locations then
    raise exception 'La capacidad contratada cambió antes de completar el upgrade.';
  end if;

  if provider_subscription_row.recurring_amount_cop <> intent_row.monthly_amount_after_cop then
    update public.billing_provider_subscriptions
    set
      provider_status = target_provider_status,
      provider_version = coalesce(target_provider_version, provider_version),
      provider_updated_at = coalesce(target_provider_updated_at, provider_updated_at),
      recurring_amount_cop = intent_row.monthly_amount_after_cop,
      next_payment_at = coalesce(target_next_payment_at, next_payment_at)
    where id = provider_subscription_row.id;
  end if;

  if current_capacity = intent_row.previous_max_active_locations then
    update public.company_subscriptions
    set max_active_locations = intent_row.requested_max_active_locations
    where id = intent_row.subscription_id
      and company_id = intent_row.company_id;
  end if;

  update public.billing_intents
  set
    status = 'succeeded',
    completed_at = coalesce(target_completed_at, now()),
    last_error_code = null,
    last_error_message = null
  where id = intent_row.id;

  return true;
end;
$$;

create or replace function public.complete_scheduled_billing_downgrade(
  target_intent_id uuid,
  target_provider_subscription_record_id uuid,
  target_provider_status text,
  target_provider_version integer,
  target_provider_updated_at timestamptz,
  target_next_payment_at timestamptz,
  target_completed_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  intent_row public.billing_intents%rowtype;
  capacity_change_row public.subscription_capacity_changes%rowtype;
begin
  select *
  into intent_row
  from public.billing_intents
  where id = target_intent_id
  for update;

  if not found then
    raise exception 'La operación de billing no está disponible.';
  end if;

  if intent_row.status = 'succeeded' then
    return false;
  end if;

  if intent_row.intent_type <> 'downgrade'
    or intent_row.status not in ('created', 'awaiting_customer', 'awaiting_payment', 'processing')
    or intent_row.capacity_change_id is null
    or intent_row.monthly_amount_after_cop is null then
    raise exception 'La operación de billing no admite este cambio.';
  end if;

  select *
  into capacity_change_row
  from public.subscription_capacity_changes
  where id = intent_row.capacity_change_id
    and company_id = intent_row.company_id
    and subscription_id = intent_row.subscription_id
  for update;

  if not found
    or capacity_change_row.status <> 'scheduled'
    or capacity_change_row.change_type <> 'downgrade'
    or capacity_change_row.requested_max_active_locations <> intent_row.requested_max_active_locations then
    raise exception 'El cambio de capacidad programado no corresponde al downgrade.';
  end if;

  update public.billing_provider_subscriptions
  set
    provider_status = target_provider_status,
    provider_version = coalesce(target_provider_version, provider_version),
    provider_updated_at = coalesce(target_provider_updated_at, provider_updated_at),
    recurring_amount_cop = intent_row.monthly_amount_after_cop,
    next_payment_at = coalesce(target_next_payment_at, next_payment_at)
  where id = target_provider_subscription_record_id
    and company_id = intent_row.company_id
    and subscription_id = intent_row.subscription_id
    and provider = 'mercado_pago'
    and ended_at is null;

  if not found then
    raise exception 'La suscripción externa no está disponible.';
  end if;

  update public.subscription_capacity_changes
  set metadata = metadata || jsonb_build_object(
    'provider_amount_updated_at', coalesce(target_provider_updated_at, now())
  )
  where id = capacity_change_row.id;

  update public.billing_intents
  set
    status = 'succeeded',
    expires_at = null,
    completed_at = coalesce(target_completed_at, now()),
    last_error_code = null,
    last_error_message = null
  where id = intent_row.id;

  return true;
end;
$$;

do $$
begin
  if exists (
    select 1
    from public.subscription_capacity_changes scc
    join public.billing_intents downgrade_intent
      on downgrade_intent.capacity_change_id = scc.id
      and downgrade_intent.intent_type = 'downgrade'
    join public.billing_intents conflicting_intent
      on conflicting_intent.company_id = scc.company_id
      and conflicting_intent.id <> downgrade_intent.id
      and conflicting_intent.created_at > downgrade_intent.created_at
      and conflicting_intent.intent_type = 'upgrade'
      and conflicting_intent.status in ('awaiting_customer', 'awaiting_payment', 'processing', 'succeeded', 'compensation_required')
    where scc.status = 'scheduled'
  ) then
    raise exception 'Existen downgrades programados con upgrades posteriores; concílialos antes de aplicar la migración crítica de Billing.';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_namespace
    where nspname = 'cron'
  ) then
    if not exists (
      select 1
      from cron.job
      where jobname = 'expire_stale_billing_intents'
    ) then
      perform cron.schedule(
        'expire_stale_billing_intents',
        '*/15 * * * *',
        'select public.expire_stale_billing_intents();'
      );
    end if;

    if not exists (
      select 1
      from cron.job
      where jobname = 'apply_due_subscription_capacity_changes'
    ) then
      perform cron.schedule(
        'apply_due_subscription_capacity_changes',
        '*/5 * * * *',
        'select public.apply_due_subscription_capacity_changes();'
      );
    end if;

    if not exists (
      select 1
      from cron.job
      where jobname = 'finalize_due_subscription_cancellations'
    ) then
      perform cron.schedule(
        'finalize_due_subscription_cancellations',
        '*/5 * * * *',
        'select public.finalize_due_subscription_cancellations();'
      );
    end if;
  end if;
exception
  when undefined_table or undefined_function or insufficient_privilege then
    raise notice 'No se pudieron programar los jobs de billing; configúralos desde Supabase Cron.';
end $$;

create or replace function public.resolve_company_capacity_excess(
  target_company_id uuid,
  keep_branch_ids uuid[]
)
returns table (
  kept_count integer,
  deactivated_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid;
  contracted_capacity integer;
  active_count integer;
  normalized_keep_branch_ids uuid[];
  valid_keep_count integer;
begin
  actor_id := auth.uid();

  if actor_id is null then
    raise exception 'No tienes permisos para resolver la capacidad de sedes.';
  end if;

  if not (
    (
      public.is_owner()
      or public.is_super_admin()
      or public.current_profile_role() = 'company_admin'
    )
    and public.can_access_company(target_company_id)
  ) then
    raise exception 'No tienes permisos para resolver la capacidad de sedes.';
  end if;

  if not public.can_company_operate(target_company_id) then
    raise exception 'Tu cuenta no tiene operación activa. Puedes consultar y descargar reportes históricos.';
  end if;

  contracted_capacity := public.get_company_contracted_capacity(target_company_id);
  active_count := public.get_company_active_branch_count(target_company_id);

  if active_count <= contracted_capacity then
    kept_count := active_count;
    deactivated_count := 0;
    return next;
    return;
  end if;

  select coalesce(array_agg(distinct branch_id), array[]::uuid[])
  into normalized_keep_branch_ids
  from unnest(coalesce(keep_branch_ids, array[]::uuid[])) as branch_id;

  select count(*)::integer
  into valid_keep_count
  from public.branches b
  where b.company_id = target_company_id
    and b.status = 'active'
    and b.is_active = true
    and b.id = any(normalized_keep_branch_ids);

  if valid_keep_count <> contracted_capacity then
    raise exception 'Selecciona exactamente % % activa% para continuar operando.',
      contracted_capacity,
      case when contracted_capacity = 1 then 'sede' else 'sedes' end,
      case when contracted_capacity = 1 then '' else 's' end;
  end if;

  update public.branches b
  set
    status = 'inactive',
    is_active = false,
    billing_activation_confirmed_at = null
  where b.company_id = target_company_id
    and b.status = 'active'
    and b.is_active = true
    and not (b.id = any(normalized_keep_branch_ids));

  get diagnostics deactivated_count = row_count;
  kept_count := valid_keep_count;
  return next;
end;
$$;

create or replace function public.deactivate_company_branches_for_inactive_subscription(target_company_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deactivated_count integer := 0;
begin
  update public.branches b
  set
    status = 'inactive',
    is_active = false,
    billing_activation_confirmed_at = null
  where b.company_id = target_company_id
    and b.status <> 'deleted'
    and (b.status = 'active' or b.is_active = true);

  get diagnostics deactivated_count = row_count;
  return deactivated_count;
end;
$$;

create or replace function public.deactivate_branches_when_subscription_stops_operating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('suspended', 'cancelled') and new.status is distinct from old.status then
    perform public.deactivate_company_branches_for_inactive_subscription(new.company_id);
  end if;

  return new;
end;
$$;

drop trigger if exists company_subscription_deactivate_branches_trigger on public.company_subscriptions;
create trigger company_subscription_deactivate_branches_trigger
after update of status on public.company_subscriptions
for each row
execute function public.deactivate_branches_when_subscription_stops_operating();

do $$
declare
  inactive_subscription record;
begin
  for inactive_subscription in
    select cs.company_id
    from public.company_subscriptions cs
    where cs.status in ('suspended', 'cancelled')
  loop
    perform public.deactivate_company_branches_for_inactive_subscription(inactive_subscription.company_id);
  end loop;
end $$;

create or replace function public.expire_due_trial_branch_access()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  expired_trial record;
  deactivated_count integer := 0;
begin
  for expired_trial in
    select cs.company_id
    from public.company_subscriptions cs
    where cs.status = 'trial'
      and cs.trial_ends_at is not null
      and cs.trial_ends_at <= now()
  loop
    deactivated_count := deactivated_count + public.deactivate_company_branches_for_inactive_subscription(expired_trial.company_id);
  end loop;

  return deactivated_count;
end;
$$;

select public.expire_due_trial_branch_access();

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron')
    and not exists (select 1 from cron.job where jobname = 'expire_due_trial_branch_access') then
    perform cron.schedule(
      'expire_due_trial_branch_access',
      '*/5 * * * *',
      'select public.expire_due_trial_branch_access();'
    );
  end if;
exception
  when undefined_table or undefined_function or insufficient_privilege then
    raise notice 'No se pudo programar el vencimiento de pruebas; configúralo desde Supabase Cron.';
end $$;

create or replace function public.can_create_active_branch(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.can_company_operate(target_company_id)
    and not public.company_requires_capacity_resolution(target_company_id)
    and public.get_company_active_branch_count(target_company_id) < public.get_company_contracted_capacity(target_company_id)
$$;

create or replace function public.can_write_branch_state(
  target_branch_id uuid,
  target_company_id uuid,
  target_status public.site_status,
  target_is_active boolean
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  current_status public.site_status;
begin
  if not public.can_access_company(target_company_id) then
    return false;
  end if;

  select b.status
  into current_status
  from public.branches b
  where b.id = target_branch_id
    and b.company_id = target_company_id;

  if not found or current_status = 'deleted' or target_status = 'deleted' then
    return false;
  end if;

  if target_status = 'active' and not target_is_active then
    return false;
  end if;

  if target_status <> 'active' then
    return true;
  end if;

  if current_status = 'active' then
    return public.can_company_operate(target_company_id)
      and not public.company_requires_capacity_resolution(target_company_id);
  end if;

  return public.can_create_active_branch(target_company_id);
end;
$$;

create or replace function public.can_operate_branch(target_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.branches b
    join public.company_subscriptions cs
      on cs.company_id = b.company_id
    where b.id = target_branch_id
      and b.status = 'active'
      and b.is_active = true
      and public.can_company_operate(b.company_id)
      and not public.company_requires_capacity_resolution(b.company_id)
      and public.can_access_company(b.company_id)
  )
$$;

create or replace function public.get_public_operational_form(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  form_payload jsonb;
begin
  if nullif(trim(p_token), '') is null then
    return null;
  end if;

  select jsonb_build_object(
    'form_type', qr.form_type,
    'branch_name', b.name,
    'company_name', c.name,
    'equipment', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', equipment.id,
            'name', equipment.name,
            'equipment_type', equipment.equipment_type,
            'equipmentType', equipment.equipment_type
          )
          order by equipment.name
        )
        from public.branch_refrigeration_equipment equipment
        where equipment.branch_id = qr.branch_id
          and equipment.status = 'active'
      ),
      '[]'::jsonb
    ),
    'sanitation_areas', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', area.id,
            'name', area.name
          )
          order by area.name
        )
        from public.branch_sanitation_areas area
        where area.branch_id = qr.branch_id
          and area.status = 'active'
      ),
      '[]'::jsonb
    )
  )
  into form_payload
  from public.branch_form_qr_codes qr
  join public.branches b on b.id = qr.branch_id
  join public.companies c on c.id = qr.company_id
  join public.company_subscriptions cs on cs.company_id = qr.company_id
  where qr.token = p_token
    and qr.is_active = true
    and b.status = 'active'
    and b.is_active = true
    and c.is_active = true
    and public.company_has_operational_entitlement(qr.company_id)
  limit 1;

  return form_payload;
end;
$$;

drop function if exists public.get_public_operational_form_completed_dates(text);

create or replace function public.get_public_operational_form_completed_dates(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  completed_dates jsonb := '[]'::jsonb;
  qr_record record;
begin
  if nullif(trim(p_token), '') is null then
    return completed_dates;
  end if;

  select
    qr.branch_id,
    qr.company_id,
    qr.form_type
  into qr_record
  from public.branch_form_qr_codes qr
  join public.branches b on b.id = qr.branch_id
  join public.companies c on c.id = qr.company_id
  join public.company_subscriptions cs on cs.company_id = qr.company_id
  where qr.token = p_token
    and qr.is_active = true
    and b.status = 'active'
    and b.is_active = true
    and c.is_active = true
    and public.company_has_operational_entitlement(qr.company_id)
  limit 1;

  if qr_record.branch_id is null then
    return completed_dates;
  end if;

  select coalesce(jsonb_agg(to_char(summary.fecha, 'YYYY-MM-DD') order by summary.fecha), '[]'::jsonb)
  into completed_dates
  from public.resumen_diario_formularios summary
  where summary.sede_id = qr_record.branch_id
    and summary.formulario_id = qr_record.form_type
    and summary.fecha >= (current_date - 30)
    and summary.cantidad_registros > 0;

  return completed_dates;
end;
$$;

drop function if exists public.submit_public_operational_form(
  text,
  text,
  uuid,
  numeric,
  uuid,
  boolean,
  text,
  boolean,
  boolean,
  text,
  text,
  boolean,
  boolean,
  text,
  text,
  text,
  date,
  numeric,
  numeric,
  timestamptz
);

drop function if exists public.submit_public_operational_form(
  text,
  text,
  uuid,
  numeric,
  uuid,
  boolean,
  text,
  text,
  boolean,
  boolean,
  text,
  text,
  text,
  date,
  numeric,
  numeric,
  timestamptz
);

drop function if exists public.submit_public_operational_form(
  text,
  text,
  uuid,
  numeric,
  uuid,
  boolean,
  text,
  text,
  boolean,
  boolean,
  text,
  text,
  text,
  date,
  numeric,
  numeric
);

drop function if exists public.submit_public_operational_form(
  text,
  text,
  uuid,
  numeric,
  uuid,
  boolean,
  text,
  text,
  boolean,
  boolean,
  text,
  text,
  text,
  date,
  numeric,
  timestamptz
);

create or replace function public.submit_public_operational_form(
  p_token text,
  p_operator_name text,
  p_equipment_id uuid default null,
  p_temperature_c numeric default null,
  p_area_id uuid default null,
  p_is_compliant boolean default null,
  p_cleaning_type text default null,
  p_used_exclusive_implements boolean default null,
  p_used_authorized_chemicals boolean default null,
  p_product_name text default null,
  p_product_type text default null,
  p_package_intact_date_valid boolean default null,
  p_organoleptic_adequate boolean default null,
  p_decision text default null,
  p_observations text default null,
  p_provider_name text default null,
  p_expiration_date date default null,
  p_chlorine_ppm numeric default null,
  p_ph_level numeric default null,
  p_recorded_at timestamptz default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  qr_record record;
  equipment_record record;
  area_record record;
  temperature_compliant_value boolean;
  chlorine_compliant_value boolean;
  ph_compliant_value boolean;
  recorded_at_value timestamptz;
  max_recorded_at_age interval := interval '5 days';
begin
  if nullif(trim(p_token), '') is null then
    raise exception 'Este formulario no tiene un QR válido.';
  end if;

  if nullif(trim(p_operator_name), '') is null then
    raise exception 'Ingresa el nombre del operador para guardar el registro.';
  end if;

  select
    qr.id,
    qr.branch_id,
    qr.company_id,
    qr.form_type,
    qr.token,
    c.company_admin_user_id
  into qr_record
  from public.branch_form_qr_codes qr
  join public.branches b on b.id = qr.branch_id
  join public.companies c on c.id = qr.company_id
  join public.company_subscriptions cs on cs.company_id = qr.company_id
  where qr.token = p_token
    and qr.is_active = true
    and b.status = 'active'
    and b.is_active = true
    and c.is_active = true
    and public.company_has_operational_entitlement(qr.company_id)
  limit 1;

  if qr_record.id is null then
    raise exception 'Este QR no está activo. Solicita soporte para revisar la sede.';
  end if;

  if auth.uid() is not null and auth.uid() = qr_record.company_admin_user_id then
    max_recorded_at_age := interval '30 days';
  end if;

  recorded_at_value := coalesce(p_recorded_at, now());

  if recorded_at_value < now() - max_recorded_at_age or recorded_at_value > now() then
    raise exception 'La fecha del registro debe estar entre ahora y máximo % días atrás.',
      extract(day from max_recorded_at_age)::integer;
  end if;

  if qr_record.form_type = 'thermal_control' then
    if p_equipment_id is null or p_temperature_c is null then
      raise exception 'Selecciona el equipo e ingresa una temperatura válida.';
    end if;

    select equipment.id, equipment.name, equipment.equipment_type
    into equipment_record
    from public.branch_refrigeration_equipment equipment
    where equipment.id = p_equipment_id
      and equipment.branch_id = qr_record.branch_id
      and equipment.status = 'active'
    limit 1;

    if equipment_record.id is null then
      raise exception 'El equipo seleccionado no pertenece a esta sede o no está activo.';
    end if;

    if equipment_record.equipment_type = 'refrigerator' then
      temperature_compliant_value := p_temperature_c between 0 and 4;
    elsif equipment_record.equipment_type = 'freezer' then
      temperature_compliant_value := p_temperature_c <= -18;
    else
      raise exception 'El tipo de equipo seleccionado no es válido.';
    end if;

    if not temperature_compliant_value and nullif(trim(coalesce(p_observations, '')), '') is null then
      raise exception 'Registra la medida tomada para una temperatura fuera de rango seguro.';
    end if;

    insert into public.thermal_control_records (
      sede_id,
      company_id,
      tipo_formulario,
      fecha_hora_servidor,
      reported_by,
      token_qr_utilizado,
      qr_code_id,
      equipment_id,
      equipment_name,
      equipment_type,
      operator_name,
      temperature_c,
      temperature_compliant,
      observations
    )
    values (
      qr_record.branch_id,
      qr_record.company_id,
      qr_record.form_type,
      recorded_at_value,
      auth.uid(),
      qr_record.token,
      qr_record.id,
      equipment_record.id,
      equipment_record.name,
      equipment_record.equipment_type,
      trim(p_operator_name),
      p_temperature_c,
      temperature_compliant_value,
      nullif(trim(coalesce(p_observations, '')), '')
    );

    return jsonb_build_object('ok', true);
  end if;

  if qr_record.form_type = 'area_sanitation' then
    if p_area_id is null or p_is_compliant is null then
      raise exception 'Selecciona el área y confirma el protocolo de saneamiento.';
    end if;

    if p_cleaning_type is null or p_cleaning_type not in ('Superficial', 'Profunda') then
      raise exception 'Selecciona el tipo de limpieza ejecutada.';
    end if;

    if p_used_exclusive_implements is distinct from true or p_used_authorized_chemicals is distinct from true then
      raise exception 'Confirma el protocolo de saneamiento antes de registrar.';
    end if;

    select area.id, area.name
    into area_record
    from public.branch_sanitation_areas area
    where area.id = p_area_id
      and area.branch_id = qr_record.branch_id
      and area.status = 'active'
    limit 1;

    if area_record.id is null then
      raise exception 'El área seleccionada no pertenece a esta sede o no está activa.';
    end if;

    insert into public.area_sanitation_records (
      sede_id,
      company_id,
      tipo_formulario,
      fecha_hora_servidor,
      reported_by,
      token_qr_utilizado,
      qr_code_id,
      area_id,
      area_name,
      operator_name,
      cleaning_type,
      used_exclusive_implements,
      used_authorized_chemicals,
      is_compliant
    )
    values (
      qr_record.branch_id,
      qr_record.company_id,
      qr_record.form_type,
      recorded_at_value,
      auth.uid(),
      qr_record.token,
      qr_record.id,
      area_record.id,
      area_record.name,
      trim(p_operator_name),
      p_cleaning_type,
      p_used_exclusive_implements,
      p_used_authorized_chemicals,
      p_is_compliant
    );

    return jsonb_build_object('ok', true);
  end if;

  if qr_record.form_type = 'supply_reception' then
    if nullif(trim(p_product_name), '') is null then
      raise exception 'Ingresa el producto y proveedor.';
    end if;

    if p_product_type is null or p_product_type not in ('Ambiente', 'Refrigerado', 'Congelado') then
      raise exception 'Selecciona el tipo de producto.';
    end if;

    if p_product_type = 'Ambiente' then
      temperature_compliant_value := null;
      p_temperature_c := null;
    elsif p_temperature_c is null then
      raise exception 'Selecciona la temperatura recibida.';
    elsif p_product_type = 'Refrigerado' and (p_temperature_c < -5 or p_temperature_c > 15) then
      raise exception 'La temperatura recibida no está disponible para producto refrigerado.';
    elsif p_product_type = 'Congelado' and (p_temperature_c < -30 or p_temperature_c > 2) then
      raise exception 'La temperatura recibida no está disponible para producto congelado.';
    elsif p_product_type = 'Refrigerado' then
      temperature_compliant_value := p_temperature_c between 0 and 4;
    else
      temperature_compliant_value := p_temperature_c <= -18;
    end if;

    if p_package_intact_date_valid is null then
      raise exception 'Selecciona si el empaque está íntegro y la fecha vigente.';
    end if;

    if p_organoleptic_adequate is null then
      raise exception 'Selecciona si color, olor y textura son adecuados.';
    end if;

    if p_decision is null or p_decision not in ('accepted', 'accepted_with_issue', 'rejected') then
      raise exception 'Selecciona la decisión.';
    end if;

    if p_decision in ('accepted_with_issue', 'rejected')
      and nullif(trim(coalesce(p_observations, '')), '') is null then
      raise exception 'Describe la medida tomada para esta recepción.';
    end if;

    insert into public.supply_reception_records (
      sede_id,
      company_id,
      tipo_formulario,
      fecha_hora_servidor,
      reported_by,
      token_qr_utilizado,
      qr_code_id,
      operator_name,
      product_name,
      provider_name,
      expiration_date,
      product_type,
      temperature_c,
      temperature_compliant,
      package_intact_date_valid,
      organoleptic_adequate,
      decision,
      observations
    )
    values (
      qr_record.branch_id,
      qr_record.company_id,
      qr_record.form_type,
      recorded_at_value,
      auth.uid(),
      qr_record.token,
      qr_record.id,
      trim(p_operator_name),
      trim(p_product_name),
      null,
      null,
      p_product_type,
      p_temperature_c,
      temperature_compliant_value,
      p_package_intact_date_valid,
      p_organoleptic_adequate,
      p_decision,
      nullif(trim(coalesce(p_observations, '')), '')
    );

    return jsonb_build_object('ok', true);
  end if;

  if qr_record.form_type = 'water_quality' then
    if p_chlorine_ppm is null then
      raise exception 'Ingresa la medición de cloro en ppm.';
    end if;

    if p_ph_level is null then
      raise exception 'Ingresa la medición de pH.';
    end if;

    if p_chlorine_ppm < 0 or p_chlorine_ppm > 9.9 then
      raise exception 'La medición de cloro debe estar entre 0.0 y 9.9 mg/L.';
    end if;

    if p_ph_level < 0 or p_ph_level > 9.9 then
      raise exception 'La medición de pH debe estar entre 0.0 y 9.9.';
    end if;

    chlorine_compliant_value := p_chlorine_ppm >= 0.3 and p_chlorine_ppm <= 2.0;
    ph_compliant_value := p_ph_level >= 6.5 and p_ph_level <= 9.0;

    if (not chlorine_compliant_value or not ph_compliant_value) and nullif(trim(coalesce(p_observations, '')), '') is null then
      raise exception 'Registra la acción tomada frente a la medición no conforme.';
    end if;

    insert into public.water_quality_records (
      sede_id,
      company_id,
      tipo_formulario,
      fecha_hora_servidor,
      reported_by,
      token_qr_utilizado,
      qr_code_id,
      operator_name,
      chlorine_ppm,
      chlorine_compliant,
      ph_level,
      ph_compliant,
      observations
    )
    values (
      qr_record.branch_id,
      qr_record.company_id,
      qr_record.form_type,
      recorded_at_value,
      auth.uid(),
      qr_record.token,
      qr_record.id,
      trim(p_operator_name),
      p_chlorine_ppm,
      chlorine_compliant_value,
      p_ph_level,
      ph_compliant_value,
      nullif(trim(coalesce(p_observations, '')), '')
    );

    return jsonb_build_object('ok', true);
  end if;

  raise exception 'Tipo de formulario no soportado.';
end;
$$;

drop trigger if exists branches_validate_rules on public.branches;
drop function if exists public.validate_branch_rules();
drop index if exists public.branches_one_main_per_company_idx;
drop function if exists public.create_company_with_main_branch(text, uuid, text);
drop function if exists public.set_main_branch(uuid);
drop function if exists public.delete_branch_permanently(uuid, text);
drop function if exists public.onboard_company_trial(uuid, text, text, text);
drop function if exists public.onboard_company_trial(uuid, text, text, text, text);
drop policy if exists "branches_insert_policy" on public.branches;
drop policy if exists "branches_delete_policy" on public.branches;

alter table if exists public.branches
drop column if exists is_main;

create or replace function public.onboard_company_trial(
  target_user_id uuid,
  target_phone text,
  target_admin_name text,
  target_company_name text,
  target_branch_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_company_id uuid;
  normalized_phone text;
begin
  normalized_phone := btrim(coalesce(target_phone, ''));

  if target_user_id is null
    or nullif(normalized_phone, '') is null
    or nullif(trim(coalesce(target_admin_name, '')), '') is null
    or nullif(trim(coalesce(target_company_name, '')), '') is null
    or nullif(trim(coalesce(target_branch_name, '')), '') is null
  then
    raise exception 'Datos de onboarding inválidos.';
  end if;

  if not public.is_e164_phone(normalized_phone) then
    raise exception 'El celular debe estar en formato E.164.';
  end if;

  if not exists (
    select 1
    from auth.users au
    where au.id = target_user_id
  ) then
    raise exception 'El usuario Auth indicado no existe.';
  end if;

  if exists (
    select 1
    from public.user_profiles up
    where up.user_id = target_user_id
  ) then
    raise exception 'El usuario ya tiene un perfil asignado.';
  end if;

  if exists (
    select 1
    from public.user_profiles up
    where up.phone = normalized_phone
  ) then
    raise exception 'Ya existe una cuenta con ese celular.';
  end if;

  insert into public.companies (
    name,
    company_admin_user_id,
    created_by
  )
  values (
    trim(target_company_name),
    target_user_id,
    target_user_id
  )
  returning id into new_company_id;

  insert into public.user_profiles (
    user_id,
    email,
    phone,
    phone_verified,
    full_name,
    global_role,
    is_active,
    default_company_id
  )
  values (
    target_user_id,
    null,
    normalized_phone,
    true,
    trim(target_admin_name),
    'company_admin',
    true,
    new_company_id
  );

  insert into public.company_subscriptions (
    company_id,
    status,
    plan_type,
    trial_started_at,
    trial_ends_at
  )
  values (
    new_company_id,
    'trial',
    'operational',
    now(),
    now() + interval '14 days'
  );

  insert into public.branches (
    company_id,
    name,
    status,
    is_active,
    billing_activation_confirmed_at,
    created_by
  )
  values (
    new_company_id,
    trim(target_branch_name),
    'active',
    true,
    now(),
    target_user_id
  );

  return new_company_id;
end;
$$;

create or replace function public.create_company_with_initial_branch(
  company_name text,
  actor_user_id uuid default null,
  initial_branch_name text default 'Sede 1'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid;
  actor_role public.app_role;
  new_company_id uuid;
begin
  actor_id := auth.uid();

  if actor_id is null then
    raise exception 'No tienes permisos para crear empresas.';
  end if;

  if actor_user_id is not null and actor_user_id <> actor_id then
    raise exception 'No tienes permisos para crear empresas.';
  end if;

  select up.global_role
  into actor_role
  from public.user_profiles up
  where up.user_id = actor_id
    and up.is_active = true
  limit 1;

  if actor_role is null or actor_role not in ('owner', 'super_admin') then
    raise exception 'No tienes permisos para crear empresas.';
  end if;

  if nullif(trim(coalesce(company_name, '')), '') is null then
    raise exception 'Debes indicar un nombre válido para la empresa.';
  end if;

  insert into public.companies (name, created_by)
  values (trim(company_name), actor_id)
  returning id into new_company_id;

  insert into public.company_subscriptions (
    company_id,
    status,
    plan_type,
    trial_started_at,
    trial_ends_at
  )
  values (
    new_company_id,
    'trial',
    'operational',
    now(),
    now() + interval '14 days'
  )
  on conflict (company_id) do nothing;

  insert into public.branches (
    company_id,
    name,
    status,
    is_active,
    billing_activation_confirmed_at,
    created_by
  )
  values (
    new_company_id,
    coalesce(nullif(trim(initial_branch_name), ''), 'Sede 1'),
    'active',
    true,
    now(),
    actor_id
  );

  return new_company_id;
end;
$$;

create or replace function public.enforce_active_branch_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  subscription_row public.company_subscriptions%rowtype;
  active_branch_count integer := 0;
  contracted_capacity integer := 0;
begin
  if new.status <> 'active' or new.is_active is not true then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.company_id = new.company_id
    and old.status = 'active'
    and old.is_active is true then
    return new;
  end if;

  select *
  into subscription_row
  from public.company_subscriptions cs
  where cs.company_id = new.company_id
  for update;

  if not found then
    raise exception 'La empresa no tiene una suscripción configurada para crear sedes.';
  end if;

  if subscription_row.status = 'trial' and subscription_row.trial_ends_at >= now() then
    contracted_capacity := 1;
  elsif subscription_row.status = 'active' then
    contracted_capacity := greatest(subscription_row.max_active_locations, 0);
  elsif subscription_row.status = 'payment_issue'
    and subscription_row.payment_attention_required = true
    and subscription_row.payment_grace_ends_at > now() then
    contracted_capacity := greatest(subscription_row.max_active_locations, 0);
  else
    raise exception 'Activa o recupera tu plan para agregar sedes.';
  end if;

  select count(*)::integer
  into active_branch_count
  from public.branches b
  where b.company_id = new.company_id
    and b.status = 'active'
    and b.is_active = true
    and (tg_op = 'INSERT' or b.id <> new.id);

  if active_branch_count > contracted_capacity then
    raise exception 'Primero elige las sedes que seguirán activas antes de crear otra.';
  end if;

  if active_branch_count >= contracted_capacity then
    raise exception 'Has alcanzado el límite de sedes activas de tu plan. Amplía tu plan para activar otra sede.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_active_branch_capacity on public.branches;
create trigger enforce_active_branch_capacity
before insert or update of company_id, status, is_active on public.branches
for each row
execute function public.enforce_active_branch_capacity();

create or replace function public.create_active_company_branch(
  target_company_id uuid,
  target_branch_name text
)
returns table (
  branch_slug text,
  active_branches integer,
  max_active_locations integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  normalized_branch_name text;
  subscription_row public.company_subscriptions%rowtype;
  active_branch_count integer := 0;
  contracted_capacity integer := 0;
  created_branch public.branches%rowtype;
begin
  normalized_branch_name := btrim(coalesce(target_branch_name, ''));

  if actor_id is null or target_company_id is null or normalized_branch_name = '' then
    raise exception 'Debes indicar una empresa y un nombre válidos para la sede.';
  end if;

  if not public.can_access_company(target_company_id) then
    raise exception 'No tienes permisos para crear sedes para esta empresa.';
  end if;

  select *
  into subscription_row
  from public.company_subscriptions cs
  where cs.company_id = target_company_id
  for update;

  if not found then
    raise exception 'La empresa no tiene una suscripción configurada para crear sedes.';
  end if;

  if subscription_row.status = 'trial' and subscription_row.trial_ends_at >= now() then
    contracted_capacity := 1;
  elsif subscription_row.status = 'active' then
    contracted_capacity := greatest(subscription_row.max_active_locations, 0);
  elsif subscription_row.status = 'payment_issue'
    and subscription_row.payment_attention_required = true
    and subscription_row.payment_grace_ends_at > now() then
    contracted_capacity := greatest(subscription_row.max_active_locations, 0);
  else
    raise exception 'Activa o recupera tu plan para agregar sedes.';
  end if;

  select count(*)::integer
  into active_branch_count
  from public.branches b
  where b.company_id = target_company_id
    and b.status = 'active'
    and b.is_active = true;

  if active_branch_count > contracted_capacity then
    raise exception 'Primero elige las sedes que seguirán activas antes de crear otra.';
  end if;

  if active_branch_count >= contracted_capacity then
    raise exception 'Has alcanzado el límite de sedes activas de tu plan. Amplía tu plan para activar otra sede.';
  end if;

  insert into public.branches (
    company_id,
    name,
    status,
    is_active,
    billing_activation_confirmed_at,
    created_by
  )
  values (
    target_company_id,
    normalized_branch_name,
    'active',
    true,
    now(),
    actor_id
  )
  returning * into created_branch;

  return query
  select created_branch.slug, active_branch_count + 1, contracted_capacity;
end;
$$;

create or replace function public.cancel_scheduled_billing_downgrade(
  target_capacity_change_id uuid,
  target_provider_subscription_record_id uuid,
  target_provider_status text,
  target_provider_version integer,
  target_provider_updated_at timestamptz,
  target_next_payment_at timestamptz,
  target_recurring_amount_cop integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  capacity_change_row public.subscription_capacity_changes%rowtype;
  intent_row public.billing_intents%rowtype;
begin
  if target_recurring_amount_cop is null or target_recurring_amount_cop <= 0 then
    raise exception 'El valor mensual restaurado no es válido.';
  end if;

  select *
  into capacity_change_row
  from public.subscription_capacity_changes scc
  where scc.id = target_capacity_change_id
  for update;

  if not found
    or capacity_change_row.status <> 'scheduled'
    or capacity_change_row.change_type <> 'downgrade' then
    raise exception 'La reducción programada ya no está disponible para cancelarse.';
  end if;

  select *
  into intent_row
  from public.billing_intents bi
  where bi.capacity_change_id = capacity_change_row.id
    and bi.company_id = capacity_change_row.company_id
    and bi.subscription_id = capacity_change_row.subscription_id
    and bi.intent_type = 'downgrade'
  order by bi.created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'No encontramos la operación de billing asociada a esta reducción.';
  end if;

  update public.billing_provider_subscriptions
  set
    provider_status = target_provider_status,
    provider_version = coalesce(target_provider_version, provider_version),
    provider_updated_at = coalesce(target_provider_updated_at, provider_updated_at),
    recurring_amount_cop = target_recurring_amount_cop,
    next_payment_at = coalesce(target_next_payment_at, next_payment_at)
  where id = target_provider_subscription_record_id
    and company_id = capacity_change_row.company_id
    and subscription_id = capacity_change_row.subscription_id
    and provider = 'mercado_pago'
    and ended_at is null;

  if not found then
    raise exception 'La suscripción externa no está disponible para cancelar la reducción.';
  end if;

  update public.subscription_capacity_changes
  set
    status = 'cancelled',
    cancelled_at = now(),
    metadata = metadata || jsonb_build_object(
      'cancelled_at', now(),
      'restored_monthly_amount_cop', target_recurring_amount_cop
    )
  where id = capacity_change_row.id;

  update public.billing_intents
  set metadata = metadata || jsonb_build_object(
    'scheduled_downgrade_cancelled_at', now(),
    'restored_monthly_amount_cop', target_recurring_amount_cop
  )
  where id = intent_row.id;

  return true;
end;
$$;

create or replace function public.complete_scheduled_downgrade_cancellation(
  target_cancellation_intent_id uuid,
  target_capacity_change_id uuid,
  target_provider_subscription_record_id uuid,
  target_provider_status text,
  target_provider_version integer,
  target_provider_updated_at timestamptz,
  target_next_payment_at timestamptz,
  target_recurring_amount_cop integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  cancellation_intent_row public.billing_intents%rowtype;
  capacity_change_row public.subscription_capacity_changes%rowtype;
begin
  if target_recurring_amount_cop is null or target_recurring_amount_cop <= 0 then
    raise exception 'El valor mensual restaurado no es válido.';
  end if;

  select *
  into cancellation_intent_row
  from public.billing_intents bi
  where bi.id = target_cancellation_intent_id
  for update;

  if not found
    or cancellation_intent_row.intent_type <> 'cancellation'
    or cancellation_intent_row.capacity_change_id <> target_capacity_change_id
    or cancellation_intent_row.status not in ('created', 'processing', 'compensation_required') then
    raise exception 'La operación de cancelación de reducción ya no está disponible.';
  end if;

  select *
  into capacity_change_row
  from public.subscription_capacity_changes scc
  where scc.id = target_capacity_change_id
    and scc.company_id = cancellation_intent_row.company_id
    and scc.subscription_id = cancellation_intent_row.subscription_id
  for update;

  if not found
    or capacity_change_row.status <> 'scheduled'
    or capacity_change_row.change_type <> 'downgrade' then
    raise exception 'La reducción programada ya no está disponible para cancelarse.';
  end if;

  update public.billing_provider_subscriptions
  set
    provider_status = target_provider_status,
    provider_version = coalesce(target_provider_version, provider_version),
    provider_updated_at = coalesce(target_provider_updated_at, provider_updated_at),
    recurring_amount_cop = target_recurring_amount_cop,
    next_payment_at = coalesce(target_next_payment_at, next_payment_at)
  where id = target_provider_subscription_record_id
    and company_id = cancellation_intent_row.company_id
    and subscription_id = cancellation_intent_row.subscription_id
    and provider = 'mercado_pago'
    and ended_at is null;

  if not found then
    raise exception 'La suscripción externa no está disponible para cancelar la reducción.';
  end if;

  update public.subscription_capacity_changes
  set
    status = 'cancelled',
    cancelled_at = now(),
    metadata = metadata || jsonb_build_object(
      'cancelled_at', now(),
      'restored_monthly_amount_cop', target_recurring_amount_cop,
      'cancellation_intent_id', cancellation_intent_row.id
    )
  where id = capacity_change_row.id;

  update public.billing_intents
  set
    status = 'succeeded',
    expires_at = null,
    completed_at = now(),
    last_error_code = null,
    last_error_message = null,
    metadata = metadata || jsonb_build_object(
      'scheduled_downgrade_cancelled_at', now(),
      'restored_monthly_amount_cop', target_recurring_amount_cop
    )
  where id = cancellation_intent_row.id;

  return true;
end;
$$;

create or replace function public.assign_company_founder(target_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid;
  subscription_row public.company_subscriptions%rowtype;
begin
  actor_id := auth.uid();

  if actor_id is null or not exists (
    select 1
    from public.user_profiles up
    where up.user_id = actor_id
      and up.global_role = 'owner'
      and up.is_active = true
  ) then
    raise exception 'Solo el owner puede asignar Founder.';
  end if;

  if target_company_id is null then
    raise exception 'La empresa indicada no es válida.';
  end if;

  perform 1
  from public.companies c
  where c.id = target_company_id
  for update;

  if not found then
    raise exception 'La empresa no existe.';
  end if;

  select *
  into subscription_row
  from public.company_subscriptions cs
  where cs.company_id = target_company_id
  for update;

  if not found then
    raise exception 'La empresa no tiene una suscripción interna.';
  end if;

  if subscription_row.plan_type = 'founder' then
    return;
  end if;

  if subscription_row.status <> 'trial' or subscription_row.plan_type <> 'operational' then
    raise exception 'Founder solo puede asignarse durante el trial, antes de activar el pago.';
  end if;

  if exists (
    select 1
    from public.billing_provider_subscriptions bps
    where bps.company_id = target_company_id
      and bps.subscription_id = subscription_row.id
      and bps.provider = 'mercado_pago'
      and bps.ended_at is null
  ) then
    raise exception 'Esta empresa tiene una suscripción activa o pendiente en Mercado Pago y requiere revisión manual antes de asignar Founder.';
  end if;

  if exists (
    select 1
    from public.billing_intents bi
    where bi.company_id = target_company_id
      and bi.subscription_id = subscription_row.id
      and bi.status in ('created', 'awaiting_customer', 'awaiting_payment', 'processing')
  ) then
    raise exception 'Esta empresa tiene una operación de Billing pendiente y requiere revisión manual antes de asignar Founder.';
  end if;

  update public.company_subscriptions
  set
    plan_type = 'founder',
    base_monthly_price_cop = 19900
  where id = subscription_row.id;

  insert into public.subscription_status_history (
    company_id,
    subscription_id,
    from_status,
    to_status,
    reason,
    source,
    actor_user_id,
    deduplication_key,
    metadata,
    occurred_at
  ) values (
    target_company_id,
    subscription_row.id,
    subscription_row.status,
    subscription_row.status,
    'founder_assigned',
    'manual',
    actor_id,
    'founder_assigned:' || subscription_row.id || ':' || gen_random_uuid(),
    jsonb_build_object(
      'fromPlanType', subscription_row.plan_type,
      'toPlanType', 'founder',
      'fromBaseMonthlyPriceCop', subscription_row.base_monthly_price_cop,
      'toBaseMonthlyPriceCop', 19900
    ),
    now()
  );
end;
$$;

drop function if exists public.delete_branch_permanently(uuid);
drop function if exists public.delete_branch_permanently(uuid, text);

create or replace function public.delete_branch_permanently(target_branch_id uuid, expected_branch_name text)
returns table (
  branch_name text,
  branch_slug text,
  file_urls text[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid;
  target_branch record;
  collected_file_urls text[];
begin
  actor_id := auth.uid();

  if actor_id is null then
    raise exception 'No tienes permisos para eliminar sedes.';
  end if;

  select
    b.id,
    b.company_id,
    b.name,
    b.slug,
    b.status
  into target_branch
  from public.branches b
  where b.id = target_branch_id
  limit 1;

  if not found then
    raise exception 'No fue posible eliminar la sede solicitada.';
  end if;

  if not (
    (
      public.is_owner()
      or public.is_super_admin()
      or public.current_profile_role() = 'company_admin'
    )
    and public.can_access_company(target_branch.company_id)
  ) then
    raise exception 'No fue posible eliminar la sede solicitada.';
  end if;

  if target_branch.status = 'active' then
    raise exception 'Desactiva la sede antes de eliminarla.';
  end if;

  if not public.can_company_operate(target_branch.company_id) then
    raise exception 'Tu cuenta no tiene operación activa. Puedes consultar y descargar reportes históricos.';
  end if;

  if trim(coalesce(expected_branch_name, '')) <> target_branch.name then
    raise exception 'Escribe el nombre exacto de la sede para confirmar la eliminación.';
  end if;

  select coalesce(array_agg(distinct file_url), array[]::text[])
  into collected_file_urls
  from (
    select bd.file_url
    from public.branch_documents bd
    where bd.branch_id = target_branch.id
      and bd.file_url is not null
    union
    select bsdf.file_url
    from public.branch_sanitary_document_files bsdf
    where bsdf.branch_id = target_branch.id
      and bsdf.file_url is not null
  ) files;

  delete from public.thermal_control_records where sede_id = target_branch.id;
  delete from public.area_sanitation_records where sede_id = target_branch.id;
  delete from public.supply_reception_records where sede_id = target_branch.id;
  delete from public.water_quality_records where sede_id = target_branch.id;
  delete from public.resumen_diario_formularios where sede_id = target_branch.id;
  delete from public.sedes_categorias_documentos where sede_id = target_branch.id;
  delete from public.branches where id = target_branch.id;

  branch_name := target_branch.name;
  branch_slug := target_branch.slug;
  file_urls := coalesce(collected_file_urls, array[]::text[]);
  return next;
end;
$$;

drop function if exists public.bootstrap_owner(uuid, text, text);

create or replace function public.bootstrap_owner(
  target_user_id uuid,
  target_phone text,
  target_name text default null,
  target_email text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_phone text;
begin
  normalized_phone := btrim(coalesce(target_phone, ''));

  if target_user_id is null
    or nullif(normalized_phone, '') is null
  then
    raise exception 'Datos de owner inválidos.';
  end if;

  if not public.is_e164_phone(normalized_phone) then
    raise exception 'El celular debe estar en formato E.164.';
  end if;

  insert into public.user_profiles (
    user_id,
    email,
    phone,
    phone_verified,
    full_name,
    global_role,
    is_active
  )
  values (
    target_user_id,
    lower(nullif(trim(coalesce(target_email, '')), '')),
    normalized_phone,
    true,
    target_name,
    'owner',
    true
  )
  on conflict (user_id) do update
  set
    email = excluded.email,
    phone = excluded.phone,
    phone_verified = true,
    full_name = excluded.full_name,
    global_role = 'owner',
    is_active = true,
    updated_at = now();
end;
$$;

drop function if exists public.provision_app_user(uuid, text, text, public.app_role, uuid);

create or replace function public.provision_app_user(
  target_user_id uuid,
  target_phone text,
  target_full_name text,
  target_role public.app_role,
  target_company_id uuid default null,
  target_email text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid;
  actor_role public.app_role;
  existing_company_admin_user_id uuid;
  normalized_phone text;
begin
  actor_id := auth.uid();
  normalized_phone := btrim(coalesce(target_phone, ''));

  if actor_id is null then
    raise exception 'No tienes permisos para crear usuarios.';
  end if;

  select up.global_role
  into actor_role
  from public.user_profiles up
  where up.user_id = actor_id
    and up.is_active = true
  limit 1;

  if actor_role is null or actor_role not in ('owner', 'super_admin') then
    raise exception 'No tienes permisos para crear usuarios.';
  end if;

  if target_role is null or target_role not in ('super_admin', 'company_admin') then
    raise exception 'No es posible crear este tipo de usuario desde esta operación.';
  end if;

  if actor_role = 'super_admin' and target_role <> 'company_admin' then
    raise exception 'Un super_admin solo puede crear company_admin.';
  end if;

  if target_user_id is null
    or nullif(normalized_phone, '') is null
    or nullif(trim(coalesce(target_full_name, '')), '') is null
  then
    raise exception 'Datos de usuario inválidos.';
  end if;

  if not public.is_e164_phone(normalized_phone) then
    raise exception 'El celular debe estar en formato E.164.';
  end if;

  if not exists (
    select 1
    from auth.users au
    where au.id = target_user_id
  ) then
    raise exception 'El usuario Auth indicado no existe.';
  end if;

  if exists (
    select 1
    from public.user_profiles up
    where up.user_id = target_user_id
  ) then
    raise exception 'El usuario ya tiene un perfil asignado.';
  end if;

  if target_role = 'company_admin' then
    if target_company_id is null then
      raise exception 'Debes indicar una empresa válida.';
    end if;

    select c.company_admin_user_id
    into existing_company_admin_user_id
    from public.companies c
    where c.id = target_company_id
      and c.is_active = true
    for update;

    if not found then
      raise exception 'No fue posible encontrar la empresa seleccionada.';
    end if;

    if existing_company_admin_user_id is not null then
      raise exception 'La empresa seleccionada ya tiene un company_admin asignado.';
    end if;
  elsif target_company_id is not null then
    raise exception 'Solo un company_admin puede tener empresa asignada.';
  end if;

  insert into public.user_profiles (
    user_id,
    email,
    phone,
    phone_verified,
    full_name,
    global_role,
    is_active,
    default_company_id
  )
  values (
    target_user_id,
    lower(nullif(trim(coalesce(target_email, '')), '')),
    normalized_phone,
    true,
    trim(target_full_name),
    target_role,
    true,
    case when target_role = 'company_admin' then target_company_id else null end
  );

  if target_role = 'company_admin' then
    update public.companies
    set company_admin_user_id = target_user_id
    where id = target_company_id;
  end if;
end;
$$;

create or replace function public.submit_demo_lead(
  p_name text,
  p_email text,
  p_role text,
  p_company_type text,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_name text;
  normalized_email text;
  normalized_role text;
  normalized_company_type text;
  normalized_message text;
begin
  if auth.role() not in ('anon', 'authenticated') then
    raise exception 'No tienes permisos para enviar esta solicitud.';
  end if;

  normalized_name := nullif(trim(coalesce(p_name, '')), '');
  normalized_email := lower(nullif(trim(coalesce(p_email, '')), ''));
  normalized_role := nullif(trim(coalesce(p_role, '')), '');
  normalized_company_type := nullif(trim(coalesce(p_company_type, '')), '');
  normalized_message := nullif(trim(coalesce(p_message, '')), '');

  if normalized_name is null
    or normalized_email is null
    or normalized_role is null
    or normalized_company_type is null
  then
    raise exception 'Faltan campos requeridos.';
  end if;

  if char_length(normalized_name) > 160
    or char_length(normalized_email) > 254
    or char_length(normalized_role) > 120
    or char_length(normalized_company_type) > 120
    or char_length(coalesce(normalized_message, '')) > 2000
  then
    raise exception 'La solicitud supera el tamaño permitido.';
  end if;

  insert into public.demo_requests (
    name,
    email,
    role,
    company_type,
    message
  )
  values (
    normalized_name,
    normalized_email,
    normalized_role,
    normalized_company_type,
    normalized_message
  );

  return jsonb_build_object('ok', true);
end;
$$;

drop function if exists public.record_whatsapp_inbound_message(uuid, text, text, text, text, text, text, integer, text, timestamptz);

create function public.record_whatsapp_inbound_message(
  p_channel_id uuid,
  p_contact_phone text,
  p_contact_name text,
  p_twilio_message_sid text,
  p_from_address text,
  p_to_address text,
  p_body text,
  p_num_media integer,
  p_twilio_status text,
  p_received_at timestamptz
)
returns table (conversation_id uuid, message_id uuid, inserted boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_conversation_id uuid;
  inserted_message_id uuid;
  message_preview text;
  is_new_conversation boolean := false;
begin
  if p_channel_id is null
    or not public.is_e164_phone(p_contact_phone)
    or nullif(trim(coalesce(p_twilio_message_sid, '')), '') is null
    or nullif(trim(coalesce(p_from_address, '')), '') is null
    or nullif(trim(coalesce(p_to_address, '')), '') is null
  then
    raise exception 'Evento de WhatsApp inválido.';
  end if;

  if char_length(coalesce(p_body, '')) > 10000 or coalesce(p_num_media, 0) < 0 then
    raise exception 'Evento de WhatsApp excede los límites permitidos.';
  end if;

  if not exists (
    select 1
    from public.whatsapp_channels channel
    where channel.id = p_channel_id
  ) then
    raise exception 'Canal de WhatsApp no disponible.';
  end if;

  message_preview := left(
    case
      when nullif(trim(coalesce(p_body, '')), '') is not null then p_body
      when coalesce(p_num_media, 0) > 0 then 'Mensaje multimedia'
      else 'Mensaje sin texto'
    end,
    500
  );

  insert into public.whatsapp_conversations (
    channel_id,
    contact_phone,
    contact_name,
    last_message_at,
    last_message_preview,
    last_message_direction,
    last_inbound_at
  )
  values (
    p_channel_id,
    p_contact_phone,
    nullif(trim(coalesce(p_contact_name, '')), ''),
    coalesce(p_received_at, now()),
    message_preview,
    'inbound',
    coalesce(p_received_at, now())
  )
  on conflict (channel_id, contact_phone) do nothing
  returning id into resolved_conversation_id;

  if resolved_conversation_id is null then
    select id
    into resolved_conversation_id
    from public.whatsapp_conversations
    where channel_id = p_channel_id
      and contact_phone = p_contact_phone;
  else
    is_new_conversation := true;
  end if;

  insert into public.whatsapp_messages (
    conversation_id,
    direction,
    twilio_message_sid,
    twilio_status,
    from_address,
    to_address,
    body,
    num_media,
    received_at,
    twilio_status_updated_at
  )
  values (
    resolved_conversation_id,
    'inbound',
    trim(p_twilio_message_sid),
    coalesce(nullif(trim(coalesce(p_twilio_status, '')), ''), 'received'),
    p_from_address,
    p_to_address,
    coalesce(p_body, ''),
    coalesce(p_num_media, 0),
    coalesce(p_received_at, now()),
    coalesce(p_received_at, now())
  )
  on conflict (twilio_message_sid) do nothing
  returning id into inserted_message_id;

  if inserted_message_id is not null then
    update public.whatsapp_conversations
    set
      contact_name = coalesce(nullif(trim(coalesce(p_contact_name, '')), ''), contact_name),
      last_message_at = coalesce(p_received_at, now()),
      last_message_preview = message_preview,
      last_message_direction = 'inbound',
      last_inbound_at = coalesce(p_received_at, now())
    where id = resolved_conversation_id
      and last_message_at <= coalesce(p_received_at, now());

    insert into public.whatsapp_inbox_events (
      event_type,
      conversation_id,
      message_id,
      contact_name,
      contact_phone,
      message_preview,
      is_new_conversation
    )
    values (
      'inbound_message',
      resolved_conversation_id,
      inserted_message_id,
      nullif(trim(coalesce(p_contact_name, '')), ''),
      p_contact_phone,
      message_preview,
      is_new_conversation
    );
  end if;

  return query select resolved_conversation_id, inserted_message_id, inserted_message_id is not null;
end;
$$;

create or replace function public.mark_whatsapp_conversation_read(
  p_conversation_id uuid,
  p_read_through timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  latest_inbound_at timestamptz;
  effective_read_at timestamptz;
begin
  if auth.uid() is null or not public.is_owner() then
    raise exception 'No autorizado para marcar conversaciones de WhatsApp.';
  end if;

  select last_inbound_at
  into latest_inbound_at
  from public.whatsapp_conversations
  where id = p_conversation_id;

  if not found or latest_inbound_at is null or p_read_through is null then
    raise exception 'Conversación de WhatsApp no disponible.';
  end if;

  effective_read_at := least(p_read_through, latest_inbound_at, now());

  insert into public.whatsapp_conversation_reads (
    conversation_id,
    user_id,
    last_read_at
  )
  values (
    p_conversation_id,
    auth.uid(),
    effective_read_at
  )
  on conflict (conversation_id, user_id) do update
  set last_read_at = greatest(
    public.whatsapp_conversation_reads.last_read_at,
    excluded.last_read_at
  );
end;
$$;

create or replace function public.get_whatsapp_unread_conversation_count()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)
  from public.whatsapp_conversations conversation
  left join public.whatsapp_conversation_reads read_cursor
    on read_cursor.conversation_id = conversation.id
    and read_cursor.user_id = auth.uid()
  where public.is_owner()
    and conversation.last_inbound_at is not null
    and (
      read_cursor.last_read_at is null
      or conversation.last_inbound_at > read_cursor.last_read_at
    )
$$;

alter table public.companies enable row level security;
alter table public.whatsapp_channels enable row level security;
alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.whatsapp_conversation_reads enable row level security;
alter table public.whatsapp_inbox_events enable row level security;
alter table public.company_subscriptions enable row level security;
alter table public.subscription_capacity_changes enable row level security;
alter table public.billing_intents enable row level security;
alter table public.billing_provider_subscriptions enable row level security;
alter table public.billing_invoices enable row level security;
alter table public.billing_payments enable row level security;
alter table public.billing_webhook_events enable row level security;
alter table public.subscription_status_history enable row level security;
alter table public.billing_reconciliation_runs enable row level security;
alter table public.user_profiles enable row level security;
alter table public.branches enable row level security;
alter table public.branch_dashboard_items enable row level security;
alter table public.branch_documents enable row level security;
alter table public.branch_chemical_products enable row level security;
alter table public.branch_staff_members enable row level security;
alter table public.branch_sanitary_document_files enable row level security;
alter table public.branch_form_qr_codes enable row level security;
alter table public.branch_refrigeration_equipment enable row level security;
alter table public.branch_sanitation_areas enable row level security;
alter table public.resumen_diario_formularios enable row level security;
alter table public.sedes_categorias_documentos enable row level security;
alter table public.thermal_control_records enable row level security;
alter table public.area_sanitation_records enable row level security;
alter table public.supply_reception_records enable row level security;
alter table public.water_quality_records enable row level security;
alter table public.demo_requests enable row level security;

drop policy if exists "companies_select_policy" on public.companies;
create policy "companies_select_policy"
on public.companies
for select
using (public.can_access_company(id));

drop policy if exists "companies_insert_policy" on public.companies;
create policy "companies_insert_policy"
on public.companies
for insert
with check (public.is_owner() or public.is_super_admin());

drop policy if exists "companies_update_policy" on public.companies;
create policy "companies_update_policy"
on public.companies
for update
using (public.is_owner() or public.is_super_admin())
with check (public.is_owner() or public.is_super_admin());

drop policy if exists "whatsapp_channels_select_policy" on public.whatsapp_channels;
create policy "whatsapp_channels_select_policy"
on public.whatsapp_channels
for select
using (public.is_owner());

drop policy if exists "whatsapp_conversations_select_policy" on public.whatsapp_conversations;
create policy "whatsapp_conversations_select_policy"
on public.whatsapp_conversations
for select
using (public.is_owner());

drop policy if exists "whatsapp_messages_select_policy" on public.whatsapp_messages;
create policy "whatsapp_messages_select_policy"
on public.whatsapp_messages
for select
using (public.is_owner());

drop policy if exists "whatsapp_conversation_reads_select_policy" on public.whatsapp_conversation_reads;
create policy "whatsapp_conversation_reads_select_policy"
on public.whatsapp_conversation_reads
for select
using (public.is_owner());

drop policy if exists "whatsapp_inbox_events_select_policy" on public.whatsapp_inbox_events;
create policy "whatsapp_inbox_events_select_policy"
on public.whatsapp_inbox_events
for select
using (public.is_owner());

drop policy if exists "company_subscriptions_select_policy" on public.company_subscriptions;
create policy "company_subscriptions_select_policy"
on public.company_subscriptions
for select
using (
  public.is_owner()
  or public.is_super_admin()
  or (
    public.current_profile_role() = 'company_admin'
    and exists (
      select 1
      from public.companies c
      where c.id = company_subscriptions.company_id
        and c.company_admin_user_id = auth.uid()
    )
  )
);

drop policy if exists "subscription_capacity_changes_select_policy" on public.subscription_capacity_changes;
create policy "subscription_capacity_changes_select_policy"
on public.subscription_capacity_changes
for select
using (public.can_access_company(company_id));

drop policy if exists "user_profiles_select_policy" on public.user_profiles;
create policy "user_profiles_select_policy"
on public.user_profiles
for select
using (
  user_id = auth.uid()
  or public.is_owner()
  or (
    public.is_super_admin()
    and global_role <> 'owner'
  )
);

drop policy if exists "user_profiles_insert_policy" on public.user_profiles;
create policy "user_profiles_insert_policy"
on public.user_profiles
for insert
with check (
  (
    public.is_owner()
    and global_role in ('super_admin', 'company_admin')
  )
  or (
    public.is_super_admin()
    and global_role = 'company_admin'
  )
);

drop policy if exists "user_profiles_update_policy" on public.user_profiles;
create policy "user_profiles_update_policy"
on public.user_profiles
for update
using (
  (
    public.is_owner()
    and global_role in ('super_admin', 'company_admin')
  )
  or (
    public.is_super_admin()
    and global_role = 'company_admin'
  )
)
with check (
  (
    public.is_owner()
    and global_role in ('super_admin', 'company_admin')
  )
  or (
    public.is_super_admin()
    and global_role = 'company_admin'
  )
);

drop policy if exists "user_profiles_self_update_policy" on public.user_profiles;

-- Decision arquitectonica:
-- user_profiles.is_active es un campo exclusivamente administrativo y nunca debe
-- modificarse desde el flujo de edicion del propio perfil. Las futuras
-- operaciones para bloquear o habilitar usuarios deben implementarse por una
-- via exclusiva de Super Administracion (Server Action, RPC u otra solucion
-- revisada en ese momento), sin reutilizar este flujo. El control de acceso por
-- membresias debe depender del estado de la suscripcion y no de is_active.
create policy "user_profiles_self_update_policy"
on public.user_profiles
for update
using (
  user_id = auth.uid()
  and is_active = true
)
with check (
  user_id = auth.uid()
  and is_active = true
  and global_role = public.current_profile_role()
);

revoke update on public.user_profiles from authenticated;
grant update (full_name) on public.user_profiles to authenticated;

drop policy if exists "branches_select_policy" on public.branches;
create policy "branches_select_policy"
on public.branches
for select
using (
  (
    (
      public.is_owner()
      or public.is_super_admin()
    )
    and public.can_access_company(company_id)
  )
  or (
    public.current_profile_role() = 'company_admin'
    and public.can_access_company(company_id)
  )
);

drop policy if exists "branches_insert_policy" on public.branches;
create policy "branches_insert_policy"
on public.branches
for insert
with check (
  (
    (
      public.is_owner()
      or public.is_super_admin()
    )
    and public.can_access_company(company_id)
    and (
      (
        status = 'active'
        and is_active = true
        and public.can_create_active_branch(company_id)
      )
      or (
        status <> 'active'
        and is_active = false
      )
    )
  )
  or (
    public.current_profile_role() = 'company_admin'
    and public.can_access_company(company_id)
    and is_active = true
    and status = 'active'
    and public.can_create_active_branch(company_id)
  )
);

drop policy if exists "branches_update_policy" on public.branches;
create policy "branches_update_policy"
on public.branches
for update
using (
  (
    public.is_owner()
    or public.is_super_admin()
    or public.current_profile_role() = 'company_admin'
  )
  and public.can_access_company(company_id)
  and status <> 'deleted'
)
with check (
  (
    public.is_owner()
    or public.is_super_admin()
    or public.current_profile_role() = 'company_admin'
  )
  and public.can_access_company(company_id)
  and public.can_write_branch_state(id, company_id, status, is_active)
);

drop policy if exists "branches_delete_policy" on public.branches;
create policy "branches_delete_policy"
on public.branches
for delete
using (
  (
    public.is_owner()
    or public.is_super_admin()
    or public.current_profile_role() = 'company_admin'
  )
  and public.can_access_company(company_id)
  and public.can_company_operate(company_id)
  and status <> 'active'
);

drop policy if exists "branch_dashboard_items_select_policy" on public.branch_dashboard_items;
create policy "branch_dashboard_items_select_policy"
on public.branch_dashboard_items
for select
using (public.can_access_branch(branch_id));

drop policy if exists "branch_dashboard_items_insert_policy" on public.branch_dashboard_items;
create policy "branch_dashboard_items_insert_policy"
on public.branch_dashboard_items
for insert
with check (
  (
    public.is_owner()
    or public.is_super_admin()
  )
  and public.can_operate_branch(branch_id)
);

drop policy if exists "branch_dashboard_items_update_policy" on public.branch_dashboard_items;
create policy "branch_dashboard_items_update_policy"
on public.branch_dashboard_items
for update
using (
  (
    public.is_owner()
    or public.is_super_admin()
  )
  and public.can_operate_branch(branch_id)
)
with check (
  (
    public.is_owner()
    or public.is_super_admin()
  )
  and public.can_operate_branch(branch_id)
);

drop policy if exists "branch_dashboard_items_delete_policy" on public.branch_dashboard_items;
create policy "branch_dashboard_items_delete_policy"
on public.branch_dashboard_items
for delete
using (
  (
    public.is_owner()
    or public.is_super_admin()
  )
  and public.can_operate_branch(branch_id)
);

drop policy if exists "branch_documents_select_policy" on public.branch_documents;
create policy "branch_documents_select_policy"
on public.branch_documents
for select
using (public.can_access_branch(branch_id));

drop policy if exists "branch_documents_insert_policy" on public.branch_documents;
create policy "branch_documents_insert_policy"
on public.branch_documents
for insert
with check (public.can_operate_branch(branch_id));

drop policy if exists "branch_documents_update_policy" on public.branch_documents;
create policy "branch_documents_update_policy"
on public.branch_documents
for update
using (public.can_operate_branch(branch_id))
with check (public.can_operate_branch(branch_id));

drop policy if exists "branch_documents_delete_policy" on public.branch_documents;
create policy "branch_documents_delete_policy"
on public.branch_documents
for delete
using (public.can_operate_branch(branch_id));

drop policy if exists "branch_chemical_products_select_policy" on public.branch_chemical_products;
create policy "branch_chemical_products_select_policy"
on public.branch_chemical_products
for select
using (public.can_access_branch(branch_id));

drop policy if exists "branch_chemical_products_insert_policy" on public.branch_chemical_products;
create policy "branch_chemical_products_insert_policy"
on public.branch_chemical_products
for insert
with check (public.can_operate_branch(branch_id));

drop policy if exists "branch_chemical_products_update_policy" on public.branch_chemical_products;
create policy "branch_chemical_products_update_policy"
on public.branch_chemical_products
for update
using (public.can_operate_branch(branch_id))
with check (public.can_operate_branch(branch_id));

drop policy if exists "branch_chemical_products_delete_policy" on public.branch_chemical_products;
create policy "branch_chemical_products_delete_policy"
on public.branch_chemical_products
for delete
using (public.can_operate_branch(branch_id));

drop policy if exists "branch_staff_members_select_policy" on public.branch_staff_members;
create policy "branch_staff_members_select_policy"
on public.branch_staff_members
for select
using (public.can_access_branch(branch_id));

drop policy if exists "branch_staff_members_insert_policy" on public.branch_staff_members;
create policy "branch_staff_members_insert_policy"
on public.branch_staff_members
for insert
with check (public.can_operate_branch(branch_id));

drop policy if exists "branch_staff_members_update_policy" on public.branch_staff_members;
create policy "branch_staff_members_update_policy"
on public.branch_staff_members
for update
using (public.can_operate_branch(branch_id))
with check (public.can_operate_branch(branch_id));

drop policy if exists "branch_staff_members_delete_policy" on public.branch_staff_members;
create policy "branch_staff_members_delete_policy"
on public.branch_staff_members
for delete
using (public.can_operate_branch(branch_id));

drop policy if exists "branch_sanitary_document_files_select_policy" on public.branch_sanitary_document_files;
create policy "branch_sanitary_document_files_select_policy"
on public.branch_sanitary_document_files
for select
using (public.can_access_branch(branch_id));

drop policy if exists "branch_sanitary_document_files_insert_policy" on public.branch_sanitary_document_files;
create policy "branch_sanitary_document_files_insert_policy"
on public.branch_sanitary_document_files
for insert
with check (public.can_operate_branch(branch_id));

drop policy if exists "branch_sanitary_document_files_update_policy" on public.branch_sanitary_document_files;
create policy "branch_sanitary_document_files_update_policy"
on public.branch_sanitary_document_files
for update
using (public.can_operate_branch(branch_id))
with check (public.can_operate_branch(branch_id));

drop policy if exists "branch_sanitary_document_files_delete_policy" on public.branch_sanitary_document_files;
create policy "branch_sanitary_document_files_delete_policy"
on public.branch_sanitary_document_files
for delete
using (public.can_operate_branch(branch_id));

drop policy if exists "branch_form_qr_codes_select_policy" on public.branch_form_qr_codes;
create policy "branch_form_qr_codes_select_policy"
on public.branch_form_qr_codes
for select
using (public.can_access_branch(branch_id));

drop policy if exists "branch_form_qr_codes_insert_policy" on public.branch_form_qr_codes;
create policy "branch_form_qr_codes_insert_policy"
on public.branch_form_qr_codes
for insert
with check (
  public.can_operate_branch(branch_id)
  and exists (
    select 1
    from public.branches b
    where b.id = branch_id
      and b.company_id = company_id
  )
);

drop policy if exists "branch_form_qr_codes_update_policy" on public.branch_form_qr_codes;
create policy "branch_form_qr_codes_update_policy"
on public.branch_form_qr_codes
for update
using (public.can_operate_branch(branch_id))
with check (public.can_operate_branch(branch_id));

drop policy if exists "branch_refrigeration_equipment_select_policy" on public.branch_refrigeration_equipment;
create policy "branch_refrigeration_equipment_select_policy"
on public.branch_refrigeration_equipment
for select
using (public.can_access_branch(branch_id));

drop policy if exists "branch_refrigeration_equipment_insert_policy" on public.branch_refrigeration_equipment;
create policy "branch_refrigeration_equipment_insert_policy"
on public.branch_refrigeration_equipment
for insert
with check (public.can_operate_branch(branch_id));

drop policy if exists "branch_refrigeration_equipment_update_policy" on public.branch_refrigeration_equipment;
create policy "branch_refrigeration_equipment_update_policy"
on public.branch_refrigeration_equipment
for update
using (public.can_operate_branch(branch_id))
with check (public.can_operate_branch(branch_id));

drop policy if exists "branch_sanitation_areas_select_policy" on public.branch_sanitation_areas;
create policy "branch_sanitation_areas_select_policy"
on public.branch_sanitation_areas
for select
using (public.can_access_branch(branch_id));

drop policy if exists "branch_sanitation_areas_insert_policy" on public.branch_sanitation_areas;
create policy "branch_sanitation_areas_insert_policy"
on public.branch_sanitation_areas
for insert
with check (public.can_operate_branch(branch_id));

drop policy if exists "branch_sanitation_areas_update_policy" on public.branch_sanitation_areas;
create policy "branch_sanitation_areas_update_policy"
on public.branch_sanitation_areas
for update
using (public.can_operate_branch(branch_id))
with check (public.can_operate_branch(branch_id));

drop policy if exists "thermal_control_records_select_policy" on public.thermal_control_records;
create policy "thermal_control_records_select_policy"
on public.thermal_control_records
for select
using (public.can_access_branch(sede_id));

drop policy if exists "thermal_control_records_delete_policy" on public.thermal_control_records;
create policy "thermal_control_records_delete_policy"
on public.thermal_control_records
for delete
using (public.can_operate_branch(sede_id));

drop policy if exists "area_sanitation_records_select_policy" on public.area_sanitation_records;
create policy "area_sanitation_records_select_policy"
on public.area_sanitation_records
for select
using (public.can_access_branch(sede_id));

drop policy if exists "area_sanitation_records_delete_policy" on public.area_sanitation_records;
create policy "area_sanitation_records_delete_policy"
on public.area_sanitation_records
for delete
using (public.can_operate_branch(sede_id));

drop policy if exists "supply_reception_records_select_policy" on public.supply_reception_records;
create policy "supply_reception_records_select_policy"
on public.supply_reception_records
for select
using (public.can_access_branch(sede_id));

drop policy if exists "supply_reception_records_delete_policy" on public.supply_reception_records;
create policy "supply_reception_records_delete_policy"
on public.supply_reception_records
for delete
using (public.can_operate_branch(sede_id));

drop policy if exists "water_quality_records_select_policy" on public.water_quality_records;
create policy "water_quality_records_select_policy"
on public.water_quality_records
for select
using (public.can_access_branch(sede_id));

drop policy if exists "water_quality_records_delete_policy" on public.water_quality_records;
create policy "water_quality_records_delete_policy"
on public.water_quality_records
for delete
using (public.can_operate_branch(sede_id));

drop policy if exists "resumen_diario_formularios_select_policy" on public.resumen_diario_formularios;
create policy "resumen_diario_formularios_select_policy"
on public.resumen_diario_formularios
for select
using (public.can_access_branch(sede_id));

drop policy if exists "resumen_diario_formularios_delete_policy" on public.resumen_diario_formularios;
create policy "resumen_diario_formularios_delete_policy"
on public.resumen_diario_formularios
for delete
using (public.can_operate_branch(sede_id));

drop policy if exists "sedes_categorias_documentos_select_policy" on public.sedes_categorias_documentos;
create policy "sedes_categorias_documentos_select_policy"
on public.sedes_categorias_documentos
for select
using (public.can_access_branch(sede_id));

drop policy if exists "sedes_categorias_documentos_delete_policy" on public.sedes_categorias_documentos;
create policy "sedes_categorias_documentos_delete_policy"
on public.sedes_categorias_documentos
for delete
using (public.can_operate_branch(sede_id));

drop policy if exists "demo_requests_select_policy" on public.demo_requests;
create policy "demo_requests_select_policy"
on public.demo_requests
for select
using (public.is_owner() or public.is_super_admin());

revoke all on table public.billing_intents from anon, authenticated;
revoke all on table public.billing_provider_subscriptions from anon, authenticated;
revoke all on table public.billing_invoices from anon, authenticated;
revoke all on table public.billing_payments from anon, authenticated;
revoke all on table public.billing_webhook_events from anon, authenticated;
revoke all on table public.subscription_status_history from anon, authenticated;
revoke all on table public.billing_reconciliation_runs from anon, authenticated;
revoke all on table public.whatsapp_channels from public, anon, authenticated;
revoke all on table public.whatsapp_conversations from public, anon, authenticated;
revoke all on table public.whatsapp_messages from public, anon, authenticated;
revoke all on table public.whatsapp_conversation_reads from public, anon, authenticated;
revoke all on table public.whatsapp_inbox_events from public, anon, authenticated;

grant select, insert, update, delete on table public.billing_intents to service_role;
grant select, insert, update, delete on table public.billing_provider_subscriptions to service_role;
grant select, insert, update, delete on table public.billing_invoices to service_role;
grant select, insert, update, delete on table public.billing_payments to service_role;
grant select, insert, update, delete on table public.billing_webhook_events to service_role;
grant select, insert, update, delete on table public.subscription_status_history to service_role;
grant select, insert, update, delete on table public.billing_reconciliation_runs to service_role;
grant select on table public.whatsapp_channels to authenticated;
grant select on table public.whatsapp_conversations to authenticated;
grant select on table public.whatsapp_messages to authenticated;
grant select on table public.whatsapp_conversation_reads to authenticated;
grant select on table public.whatsapp_inbox_events to authenticated;
grant select, insert, update, delete on table public.whatsapp_channels to service_role;
grant select, insert, update, delete on table public.whatsapp_conversations to service_role;
grant select, insert, update, delete on table public.whatsapp_messages to service_role;
grant select, insert, update, delete on table public.whatsapp_conversation_reads to service_role;
grant select, insert, update, delete on table public.whatsapp_inbox_events to service_role;

revoke all on function public.record_whatsapp_inbound_message(uuid, text, text, text, text, text, text, integer, text, timestamptz) from public, anon, authenticated;
grant execute on function public.record_whatsapp_inbound_message(uuid, text, text, text, text, text, text, integer, text, timestamptz) to service_role;

revoke all on function public.mark_whatsapp_conversation_read(uuid, timestamptz) from public, anon;
grant execute on function public.mark_whatsapp_conversation_read(uuid, timestamptz) to authenticated;

revoke all on function public.get_whatsapp_unread_conversation_count() from public, anon;
grant execute on function public.get_whatsapp_unread_conversation_count() to authenticated;

revoke all on function public.onboard_company_trial(uuid, text, text, text, text) from public;
revoke all on function public.onboard_company_trial(uuid, text, text, text, text) from anon;
grant execute on function public.onboard_company_trial(uuid, text, text, text, text) to service_role;

revoke all on function public.create_company_with_initial_branch(text, uuid, text) from public;
revoke all on function public.create_company_with_initial_branch(text, uuid, text) from anon;
grant execute on function public.create_company_with_initial_branch(text, uuid, text) to authenticated;

revoke all on function public.create_active_company_branch(uuid, text) from public;
revoke all on function public.create_active_company_branch(uuid, text) from anon;
grant execute on function public.create_active_company_branch(uuid, text) to authenticated;

revoke all on function public.update_current_company_name(text) from public, anon;
grant execute on function public.update_current_company_name(text) to authenticated;

revoke all on function public.cancel_scheduled_billing_downgrade(uuid, uuid, text, integer, timestamptz, timestamptz, integer) from public;
revoke all on function public.cancel_scheduled_billing_downgrade(uuid, uuid, text, integer, timestamptz, timestamptz, integer) from anon;
revoke all on function public.cancel_scheduled_billing_downgrade(uuid, uuid, text, integer, timestamptz, timestamptz, integer) from authenticated;
grant execute on function public.cancel_scheduled_billing_downgrade(uuid, uuid, text, integer, timestamptz, timestamptz, integer) to service_role;

revoke all on function public.complete_scheduled_downgrade_cancellation(uuid, uuid, uuid, text, integer, timestamptz, timestamptz, integer) from public;
revoke all on function public.complete_scheduled_downgrade_cancellation(uuid, uuid, uuid, text, integer, timestamptz, timestamptz, integer) from anon;
revoke all on function public.complete_scheduled_downgrade_cancellation(uuid, uuid, uuid, text, integer, timestamptz, timestamptz, integer) from authenticated;
grant execute on function public.complete_scheduled_downgrade_cancellation(uuid, uuid, uuid, text, integer, timestamptz, timestamptz, integer) to service_role;

revoke all on function public.assign_company_founder(uuid) from public;
revoke all on function public.assign_company_founder(uuid) from anon;
grant execute on function public.assign_company_founder(uuid) to authenticated;

revoke all on function public.delete_branch_permanently(uuid, text) from public;
revoke all on function public.delete_branch_permanently(uuid, text) from anon;
grant execute on function public.delete_branch_permanently(uuid, text) to authenticated;

revoke all on function public.apply_due_subscription_capacity_changes() from public;
revoke all on function public.apply_due_subscription_capacity_changes() from anon;
grant execute on function public.apply_due_subscription_capacity_changes() to service_role;

revoke all on function public.expire_due_trial_branch_access() from public, anon, authenticated;
grant execute on function public.expire_due_trial_branch_access() to service_role;

revoke all on function public.deactivate_company_branches_for_inactive_subscription(uuid) from public, anon, authenticated;
revoke all on function public.deactivate_branches_when_subscription_stops_operating() from public, anon, authenticated;

revoke all on function public.expire_stale_billing_intents(uuid) from public;
revoke all on function public.expire_stale_billing_intents(uuid) from anon;
revoke all on function public.expire_stale_billing_intents(uuid) from authenticated;
grant execute on function public.expire_stale_billing_intents(uuid) to service_role;

revoke all on function public.claim_billing_activation_attempt_closure(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_billing_activation_attempt_closure(uuid, text) to service_role;

revoke all on function public.close_billing_activation_attempt(uuid, uuid, text, timestamptz, public.billing_intent_status, text, text) from public, anon, authenticated;
grant execute on function public.close_billing_activation_attempt(uuid, uuid, text, timestamptz, public.billing_intent_status, text, text) to service_role;

revoke all on function public.complete_billing_cancellation(uuid, uuid, text, bigint, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.complete_billing_cancellation(uuid, uuid, text, bigint, timestamptz, timestamptz, timestamptz) to service_role;

revoke all on function public.apply_recurring_billing_payment_state(uuid, uuid, uuid, public.billing_payment_status, timestamptz, timestamptz, timestamptz, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.apply_recurring_billing_payment_state(uuid, uuid, uuid, public.billing_payment_status, timestamptz, timestamptz, timestamptz, integer, timestamptz) to service_role;

revoke all on function public.apply_billing_provider_cancellation_state(uuid, text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.apply_billing_provider_cancellation_state(uuid, text, timestamptz, uuid) to service_role;

revoke all on function public.complete_billing_payment_method_update(uuid, uuid, text, bigint, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.complete_billing_payment_method_update(uuid, uuid, text, bigint, timestamptz, timestamptz) to service_role;

revoke all on function public.finalize_due_subscription_cancellations() from public, anon, authenticated;
grant execute on function public.finalize_due_subscription_cancellations() to service_role;

revoke all on function public.complete_billing_activation(uuid, uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.complete_billing_activation(uuid, uuid, uuid, timestamptz, timestamptz) to service_role;

revoke all on function public.apply_billing_payment_reversal(uuid, uuid, boolean, public.company_subscription_status, integer, integer, text, integer, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.apply_billing_payment_reversal(uuid, uuid, boolean, public.company_subscription_status, integer, integer, text, integer, timestamptz, timestamptz, timestamptz) to service_role;

revoke all on function public.complete_billing_upgrade(uuid, uuid, uuid, text, integer, timestamptz, timestamptz, timestamptz) from public;
revoke all on function public.complete_billing_upgrade(uuid, uuid, uuid, text, integer, timestamptz, timestamptz, timestamptz) from anon;
revoke all on function public.complete_billing_upgrade(uuid, uuid, uuid, text, integer, timestamptz, timestamptz, timestamptz) from authenticated;
grant execute on function public.complete_billing_upgrade(uuid, uuid, uuid, text, integer, timestamptz, timestamptz, timestamptz) to service_role;

revoke all on function public.complete_scheduled_billing_downgrade(uuid, uuid, text, integer, timestamptz, timestamptz, timestamptz) from public;
revoke all on function public.complete_scheduled_billing_downgrade(uuid, uuid, text, integer, timestamptz, timestamptz, timestamptz) from anon;
revoke all on function public.complete_scheduled_billing_downgrade(uuid, uuid, text, integer, timestamptz, timestamptz, timestamptz) from authenticated;
grant execute on function public.complete_scheduled_billing_downgrade(uuid, uuid, text, integer, timestamptz, timestamptz, timestamptz) to service_role;

revoke all on function public.resolve_company_capacity_excess(uuid, uuid[]) from public;
revoke all on function public.resolve_company_capacity_excess(uuid, uuid[]) from anon;
grant execute on function public.resolve_company_capacity_excess(uuid, uuid[]) to authenticated;

revoke all on function public.provision_app_user(uuid, text, text, public.app_role, uuid, text) from public;
revoke all on function public.provision_app_user(uuid, text, text, public.app_role, uuid, text) from anon;
grant execute on function public.provision_app_user(uuid, text, text, public.app_role, uuid, text) to authenticated;

revoke all on function public.submit_demo_lead(text, text, text, text, text) from public;
grant execute on function public.submit_demo_lead(text, text, text, text, text) to anon, authenticated;

revoke all on function public.get_public_operational_form(text) from public;
revoke all on function public.get_public_operational_form_completed_dates(text) from public;
revoke all on function public.submit_public_operational_form(
  text,
  text,
  uuid,
  numeric,
  uuid,
  boolean,
  text,
  boolean,
  boolean,
  text,
  text,
  boolean,
  boolean,
  text,
  text,
  text,
  date,
  numeric,
  numeric,
  timestamptz
) from public;

grant execute on function public.get_public_operational_form(text) to anon, authenticated;
grant execute on function public.get_public_operational_form_completed_dates(text) to anon, authenticated;
grant execute on function public.submit_public_operational_form(
  text,
  text,
  uuid,
  numeric,
  uuid,
  boolean,
  text,
  boolean,
  boolean,
  text,
  text,
  boolean,
  boolean,
  text,
  text,
  text,
  date,
  numeric,
  numeric,
  timestamptz
) to anon, authenticated;

comment on function public.bootstrap_owner(uuid, text, text, text) is
'Run this manually after creating the first auth user in Supabase Auth to promote that user to owner.';

-- WhatsApp notification MVP. The cron configuration with Vault values lives in
-- supabase/notifications-mvp.sql because it depends on deployment secrets.
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
