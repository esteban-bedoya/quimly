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
    where typname = 'company_subscription_status'
  ) then
    create type public.company_subscription_status as enum ('trial', 'active', 'payment_issue', 'cancelled');
  end if;
end $$;

alter type public.company_subscription_status add value if not exists 'trial';
alter type public.company_subscription_status add value if not exists 'payment_issue';
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

create table if not exists public.company_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies (id) on delete cascade,
  status public.company_subscription_status not null default 'trial',
  plan_type public.company_plan_type not null default 'operational',
  trial_started_at timestamptz not null default now(),
  trial_ends_at timestamptz not null default (now() + interval '14 days'),
  current_period_ends_at timestamptz,
  base_monthly_price_cop integer not null default 24900,
  additional_site_monthly_price_cop integer not null default 19900,
  included_active_sites integer not null default 1,
  max_active_locations integer not null default 1,
  payment_provider text not null default 'mercado_pago',
  payment_method_status public.payment_method_status not null default 'pending',
  mercado_pago_customer_id text,
  mercado_pago_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_subscriptions_id_company_unique unique (id, company_id),
  constraint company_subscriptions_trial_period_check check (trial_ends_at > trial_started_at),
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
add column if not exists additional_site_monthly_price_cop integer not null default 19900;

alter table if exists public.company_subscriptions
alter column base_monthly_price_cop set default 24900;

alter table if exists public.company_subscriptions
alter column additional_site_monthly_price_cop set default 19900;

update public.company_subscriptions
set base_monthly_price_cop = 24900
where plan_type = 'operational'
  and base_monthly_price_cop = 25000;

update public.company_subscriptions
set base_monthly_price_cop = 19900
where plan_type = 'founder'
  and base_monthly_price_cop in (24900, 25000);

update public.company_subscriptions
set additional_site_monthly_price_cop = 19900
where additional_site_monthly_price_cop = 15000;

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
  email text unique,
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

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  slug text not null,
  is_main boolean not null default false,
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
    or is_main = true
    or billing_activation_confirmed_at is not null
  )
);

alter table if exists public.branches
add column if not exists status public.site_status not null default 'active';

alter table if exists public.branches
add column if not exists billing_activation_confirmed_at timestamptz;

alter table if exists public.branches
add column if not exists mercado_pago_activation_payment_id text;

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
  or is_main = true
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
begin
  if tg_table_name = 'companies' then
    new.slug = public.slugify(new.name);
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

drop trigger if exists set_company_subscriptions_updated_at on public.company_subscriptions;
create trigger set_company_subscriptions_updated_at
before update on public.company_subscriptions
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

create or replace function public.can_company_operate(target_company_id uuid)
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
      and public.can_access_company(cs.company_id)
      and (
        cs.status = 'active'
        or (
          cs.status = 'trial'
          and cs.trial_ends_at >= now()
        )
      )
  )
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
begin
  for scheduled_change in
    select
      scc.id,
      scc.subscription_id,
      scc.requested_max_active_locations
    from public.subscription_capacity_changes scc
    where scc.status = 'scheduled'
      and scc.effective_at <= now()
    order by scc.effective_at asc, scc.created_at asc
    for update skip locked
  loop
    update public.company_subscriptions
    set max_active_locations = scheduled_change.requested_max_active_locations
    where id = scheduled_change.subscription_id;

    get diagnostics changed_count = row_count;

    if changed_count <> 1 then
      continue;
    end if;

    update public.subscription_capacity_changes
    set
      status = 'applied',
      applied_at = now()
    where id = scheduled_change.id
      and status = 'scheduled';

    get diagnostics changed_count = row_count;

    if changed_count = 1 then
      applied_count := applied_count + 1;
    end if;
  end loop;

  return applied_count;
end;
$$;

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
    raise exception 'Selecciona exactamente % sede(s) activa(s) para continuar operando.', contracted_capacity;
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
    and not public.company_requires_capacity_resolution(qr.company_id)
    and (
      cs.status = 'active'
      or (
        cs.status = 'trial'
        and cs.trial_ends_at >= now()
      )
    )
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
    and not public.company_requires_capacity_resolution(qr.company_id)
    and (
      cs.status = 'active'
      or (
        cs.status = 'trial'
        and cs.trial_ends_at >= now()
      )
    )
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
    and not public.company_requires_capacity_resolution(qr.company_id)
    and (
      cs.status = 'active'
      or (
        cs.status = 'trial'
        and cs.trial_ends_at >= now()
      )
    )
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

create or replace function public.validate_branch_rules()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  existing_branch_count integer;
begin
  if current_setting('app.allow_main_branch_switch', true) = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    select count(*)
    from public.branches b
    where b.company_id = new.company_id
    into existing_branch_count;

    if existing_branch_count = 0 and not new.is_main then
      raise exception 'La primera sede de una empresa debe ser la sede principal.';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if old.is_main and not new.is_main then
      raise exception 'La sede principal no puede dejar de ser principal sin asignar otra sede principal primero.';
    end if;

    if old.is_main and not new.is_active then
      raise exception 'La sede principal no puede desactivarse. Asigna otra sede principal primero.';
    end if;

    if old.is_main and new.status <> 'active' then
      raise exception 'La sede principal debe permanecer activa.';
    end if;
  end if;

  if new.is_main and (not new.is_active or new.status <> 'active') then
    raise exception 'La sede principal debe permanecer activa.';
  end if;

  return new;
end;
$$;

drop trigger if exists branches_validate_rules on public.branches;
create trigger branches_validate_rules
before insert or update on public.branches
for each row
execute function public.validate_branch_rules();

create unique index if not exists branches_one_main_per_company_idx
on public.branches (company_id)
where is_main = true;

drop function if exists public.onboard_company_trial(uuid, text, text, text);

create or replace function public.onboard_company_trial(
  target_user_id uuid,
  target_phone text,
  target_admin_name text,
  target_company_name text
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

  insert into public.branches (
    company_id,
    name,
    is_main,
    status,
    is_active,
    billing_activation_confirmed_at,
    created_by
  )
  values (
    new_company_id,
    'Sede Principal',
    true,
    'active',
    true,
    now(),
    target_user_id
  );

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

  return new_company_id;
end;
$$;

create or replace function public.create_company_with_main_branch(
  company_name text,
  actor_user_id uuid default null,
  main_branch_name text default 'Sede Principal'
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

  insert into public.branches (
    company_id,
    name,
    is_main,
    status,
    is_active,
    billing_activation_confirmed_at,
    created_by
  )
  values (
    new_company_id,
    coalesce(nullif(trim(main_branch_name), ''), 'Sede Principal'),
    true,
    'active',
    true,
    now(),
    actor_id
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
  )
  on conflict (company_id) do nothing;

  return new_company_id;
end;
$$;

create or replace function public.set_main_branch(target_branch_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid;
  actor_role public.app_role;
  target_company_id uuid;
  target_status public.site_status;
begin
  actor_id := auth.uid();

  if actor_id is null then
    raise exception 'No tienes permisos para modificar sedes.';
  end if;

  select up.global_role
  into actor_role
  from public.user_profiles up
  where up.user_id = actor_id
    and up.is_active = true
  limit 1;

  if actor_role is null or actor_role not in ('owner', 'super_admin') then
    raise exception 'No tienes permisos para modificar sedes.';
  end if;

  select
    b.company_id,
    b.status
  into
    target_company_id,
    target_status
  from public.branches b
  where b.id = target_branch_id;

  if target_company_id is null then
    raise exception 'La sede indicada no existe.';
  end if;

  if target_status <> 'active' then
    raise exception 'Activa la sede antes de marcarla como principal.';
  end if;

  perform set_config('app.allow_main_branch_switch', 'on', true);

  update public.branches
  set is_main = false
  where company_id = target_company_id
    and is_main = true
    and id <> target_branch_id;

  update public.branches
  set
    is_main = true,
    status = 'active',
    is_active = true,
    billing_activation_confirmed_at = coalesce(billing_activation_confirmed_at, now())
  where id = target_branch_id;
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
    b.is_main,
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

  if target_branch.is_main then
    raise exception 'La sede principal no se puede eliminar. Primero asigna otra sede principal.';
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

alter table public.companies enable row level security;
alter table public.company_subscriptions enable row level security;
alter table public.subscription_capacity_changes enable row level security;
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
    and is_main = false
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
  and is_main = false
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

revoke all on function public.onboard_company_trial(uuid, text, text, text) from public;
revoke all on function public.onboard_company_trial(uuid, text, text, text) from anon;
grant execute on function public.onboard_company_trial(uuid, text, text, text) to service_role;

revoke all on function public.create_company_with_main_branch(text, uuid, text) from public;
revoke all on function public.create_company_with_main_branch(text, uuid, text) from anon;
grant execute on function public.create_company_with_main_branch(text, uuid, text) to authenticated;

revoke all on function public.set_main_branch(uuid) from public;
revoke all on function public.set_main_branch(uuid) from anon;
grant execute on function public.set_main_branch(uuid) to authenticated;

revoke all on function public.delete_branch_permanently(uuid, text) from public;
revoke all on function public.delete_branch_permanently(uuid, text) from anon;
grant execute on function public.delete_branch_permanently(uuid, text) to authenticated;

revoke all on function public.apply_due_subscription_capacity_changes() from public;
revoke all on function public.apply_due_subscription_capacity_changes() from anon;
grant execute on function public.apply_due_subscription_capacity_changes() to service_role;

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
