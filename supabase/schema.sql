create extension if not exists pgcrypto;
create extension if not exists unaccent;

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

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text,
  global_role public.app_role not null default 'company_admin',
  is_active boolean not null default true,
  can_access_all_companies boolean not null default false,
  default_company_id uuid references public.companies (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profiles_email_lowercase check (email = lower(email)),
  constraint user_profiles_company_admin_scope check (
    global_role <> 'company_admin' or can_access_all_companies = false
  )
);

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  slug text not null,
  is_main boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, slug),
  constraint branches_slug_format check (slug = lower(slug))
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
  regenerated_at timestamptz,
  unique (branch_id, form_type),
  constraint branch_form_qr_codes_token_length check (char_length(token) >= 32)
);

create table if not exists public.branch_refrigeration_equipment (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, name)
);

create table if not exists public.branch_sanitation_areas (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, name)
);

create table if not exists public.thermal_control_records (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references public.branches (id) on delete restrict,
  company_id uuid not null references public.companies (id) on delete restrict,
  tipo_formulario public.operational_form_type not null default 'thermal_control',
  fecha_hora_servidor timestamptz not null default now(),
  created_at timestamptz not null default now(),
  token_qr_utilizado text not null,
  qr_code_id uuid references public.branch_form_qr_codes (id) on delete set null,
  equipment_id uuid references public.branch_refrigeration_equipment (id) on delete set null,
  equipment_name text not null,
  operator_name text not null,
  temperature_c numeric(5,2) not null,
  constraint thermal_control_records_tipo_check check (tipo_formulario = 'thermal_control')
);

create table if not exists public.area_sanitation_records (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references public.branches (id) on delete restrict,
  company_id uuid not null references public.companies (id) on delete restrict,
  tipo_formulario public.operational_form_type not null default 'area_sanitation',
  fecha_hora_servidor timestamptz not null default now(),
  created_at timestamptz not null default now(),
  token_qr_utilizado text not null,
  qr_code_id uuid references public.branch_form_qr_codes (id) on delete set null,
  area_id uuid references public.branch_sanitation_areas (id) on delete set null,
  area_name text not null,
  operator_name text not null,
  is_compliant boolean not null,
  constraint area_sanitation_records_tipo_check check (tipo_formulario = 'area_sanitation')
);

create table if not exists public.supply_reception_records (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references public.branches (id) on delete restrict,
  company_id uuid not null references public.companies (id) on delete restrict,
  tipo_formulario public.operational_form_type not null default 'supply_reception',
  fecha_hora_servidor timestamptz not null default now(),
  created_at timestamptz not null default now(),
  token_qr_utilizado text not null,
  qr_code_id uuid references public.branch_form_qr_codes (id) on delete set null,
  operator_name text not null,
  product_name text not null,
  provider_name text not null,
  expiration_date date not null,
  constraint supply_reception_records_tipo_check check (tipo_formulario = 'supply_reception')
);

create table if not exists public.water_quality_records (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references public.branches (id) on delete restrict,
  company_id uuid not null references public.companies (id) on delete restrict,
  tipo_formulario public.operational_form_type not null default 'water_quality',
  fecha_hora_servidor timestamptz not null default now(),
  created_at timestamptz not null default now(),
  token_qr_utilizado text not null,
  qr_code_id uuid references public.branch_form_qr_codes (id) on delete set null,
  operator_name text not null,
  chlorine_ppm numeric(4,2) not null,
  constraint water_quality_records_tipo_check check (tipo_formulario = 'water_quality'),
  constraint water_quality_records_chlorine_range check (chlorine_ppm between 0.3 and 2.0)
);

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
    'branch_sanitation_areas'
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

drop trigger if exists set_companies_updated_at on public.companies;
create trigger set_companies_updated_at
before update on public.companies
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

drop trigger if exists seed_default_branch_form_qr_codes on public.branches;
create trigger seed_default_branch_form_qr_codes
after insert on public.branches
for each row
execute function public.seed_default_branch_form_qr_codes();

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

create or replace function public.can_access_all_companies()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select up.can_access_all_companies
      from public.user_profiles up
      where up.user_id = auth.uid()
        and up.is_active = true
      limit 1
    ),
    false
  )
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
    or (
      public.is_super_admin()
      and public.can_access_all_companies()
    )
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
      and b.is_active = true
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
            'name', equipment.name
          )
          order by equipment.name
        )
        from public.branch_refrigeration_equipment equipment
        where equipment.branch_id = qr.branch_id
          and equipment.is_active = true
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
          and area.is_active = true
      ),
      '[]'::jsonb
    )
  )
  into form_payload
  from public.branch_form_qr_codes qr
  join public.branches b on b.id = qr.branch_id
  join public.companies c on c.id = qr.company_id
  where qr.token = p_token
    and qr.is_active = true
    and b.is_active = true
    and c.is_active = true
  limit 1;

  return form_payload;
end;
$$;

create or replace function public.submit_public_operational_form(
  p_token text,
  p_operator_name text,
  p_equipment_id uuid default null,
  p_temperature_c numeric default null,
  p_area_id uuid default null,
  p_is_compliant boolean default null,
  p_product_name text default null,
  p_provider_name text default null,
  p_expiration_date date default null,
  p_chlorine_ppm numeric default null
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
    qr.token
  into qr_record
  from public.branch_form_qr_codes qr
  join public.branches b on b.id = qr.branch_id
  join public.companies c on c.id = qr.company_id
  where qr.token = p_token
    and qr.is_active = true
    and b.is_active = true
    and c.is_active = true
  limit 1;

  if qr_record.id is null then
    raise exception 'Este QR no está activo o ya fue regenerado. Solicita el QR vigente de la sede.';
  end if;

  if qr_record.form_type = 'thermal_control' then
    if p_equipment_id is null or p_temperature_c is null then
      raise exception 'Selecciona el equipo e ingresa una temperatura válida.';
    end if;

    select equipment.id, equipment.name
    into equipment_record
    from public.branch_refrigeration_equipment equipment
    where equipment.id = p_equipment_id
      and equipment.branch_id = qr_record.branch_id
      and equipment.is_active = true
    limit 1;

    if equipment_record.id is null then
      raise exception 'El equipo seleccionado no pertenece a esta sede o no está activo.';
    end if;

    insert into public.thermal_control_records (
      sede_id,
      company_id,
      tipo_formulario,
      token_qr_utilizado,
      qr_code_id,
      equipment_id,
      equipment_name,
      operator_name,
      temperature_c
    )
    values (
      qr_record.branch_id,
      qr_record.company_id,
      qr_record.form_type,
      qr_record.token,
      qr_record.id,
      equipment_record.id,
      equipment_record.name,
      trim(p_operator_name),
      p_temperature_c
    );

    return jsonb_build_object('ok', true);
  end if;

  if qr_record.form_type = 'area_sanitation' then
    if p_area_id is null or p_is_compliant is null then
      raise exception 'Selecciona el área y el estado de conformidad.';
    end if;

    select area.id, area.name
    into area_record
    from public.branch_sanitation_areas area
    where area.id = p_area_id
      and area.branch_id = qr_record.branch_id
      and area.is_active = true
    limit 1;

    if area_record.id is null then
      raise exception 'El área seleccionada no pertenece a esta sede o no está activa.';
    end if;

    insert into public.area_sanitation_records (
      sede_id,
      company_id,
      tipo_formulario,
      token_qr_utilizado,
      qr_code_id,
      area_id,
      area_name,
      operator_name,
      is_compliant
    )
    values (
      qr_record.branch_id,
      qr_record.company_id,
      qr_record.form_type,
      qr_record.token,
      qr_record.id,
      area_record.id,
      area_record.name,
      trim(p_operator_name),
      p_is_compliant
    );

    return jsonb_build_object('ok', true);
  end if;

  if qr_record.form_type = 'supply_reception' then
    if nullif(trim(p_product_name), '') is null
      or nullif(trim(p_provider_name), '') is null
      or p_expiration_date is null then
      raise exception 'Completa producto, proveedor y fecha de vencimiento.';
    end if;

    insert into public.supply_reception_records (
      sede_id,
      company_id,
      tipo_formulario,
      token_qr_utilizado,
      qr_code_id,
      operator_name,
      product_name,
      provider_name,
      expiration_date
    )
    values (
      qr_record.branch_id,
      qr_record.company_id,
      qr_record.form_type,
      qr_record.token,
      qr_record.id,
      trim(p_operator_name),
      trim(p_product_name),
      trim(p_provider_name),
      p_expiration_date
    );

    return jsonb_build_object('ok', true);
  end if;

  if qr_record.form_type = 'water_quality' then
    if p_chlorine_ppm is null then
      raise exception 'Ingresa la medición de cloro en ppm.';
    end if;

    if p_chlorine_ppm < 0.3 or p_chlorine_ppm > 2.0 then
      raise exception 'La medición de cloro debe estar entre 0.3 y 2.0 ppm.';
    end if;

    insert into public.water_quality_records (
      sede_id,
      company_id,
      tipo_formulario,
      token_qr_utilizado,
      qr_code_id,
      operator_name,
      chlorine_ppm
    )
    values (
      qr_record.branch_id,
      qr_record.company_id,
      qr_record.form_type,
      qr_record.token,
      qr_record.id,
      trim(p_operator_name),
      p_chlorine_ppm
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
  end if;

  if new.is_main and not new.is_active then
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
  new_company_id uuid;
begin
  insert into public.companies (name, created_by)
  values (company_name, actor_user_id)
  returning id into new_company_id;

  insert into public.branches (company_id, name, is_main, is_active, created_by)
  values (new_company_id, main_branch_name, true, true, actor_user_id);

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
  target_company_id uuid;
begin
  select b.company_id
  into target_company_id
  from public.branches b
  where b.id = target_branch_id;

  if target_company_id is null then
    raise exception 'La sede indicada no existe.';
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
    is_active = true
  where id = target_branch_id;
end;
$$;

create or replace function public.bootstrap_owner(
  target_user_id uuid,
  target_email text,
  target_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (
    user_id,
    email,
    full_name,
    global_role,
    is_active,
    can_access_all_companies
  )
  values (
    target_user_id,
    lower(target_email),
    target_name,
    'owner',
    true,
    true
  )
  on conflict (user_id) do update
  set
    email = excluded.email,
    full_name = excluded.full_name,
    global_role = 'owner',
    is_active = true,
    can_access_all_companies = true,
    updated_at = now();
end;
$$;

alter table public.companies enable row level security;
alter table public.user_profiles enable row level security;
alter table public.branches enable row level security;
alter table public.branch_dashboard_items enable row level security;
alter table public.branch_documents enable row level security;
alter table public.branch_form_qr_codes enable row level security;
alter table public.branch_refrigeration_equipment enable row level security;
alter table public.branch_sanitation_areas enable row level security;
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
  public.is_owner()
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
  user_id = auth.uid()
  or public.is_owner()
  or (
    public.is_super_admin()
    and global_role = 'company_admin'
  )
)
with check (
  (
    user_id = auth.uid()
    and global_role = public.current_profile_role()
  )
  or public.is_owner()
  or (
    public.is_super_admin()
    and global_role = 'company_admin'
  )
);

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
    and is_active = true
    and public.can_access_company(company_id)
  )
);

drop policy if exists "branches_insert_policy" on public.branches;
create policy "branches_insert_policy"
on public.branches
for insert
with check (
  (
    public.is_owner()
    or public.is_super_admin()
  )
  and public.can_access_company(company_id)
);

drop policy if exists "branches_update_policy" on public.branches;
create policy "branches_update_policy"
on public.branches
for update
using (
  (
    public.is_owner()
    or public.is_super_admin()
  )
  and public.can_access_company(company_id)
)
with check (
  (
    public.is_owner()
    or public.is_super_admin()
  )
  and public.can_access_company(company_id)
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
  and public.can_access_branch(branch_id)
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
  and public.can_access_branch(branch_id)
)
with check (
  (
    public.is_owner()
    or public.is_super_admin()
  )
  and public.can_access_branch(branch_id)
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
  and public.can_access_branch(branch_id)
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
with check (public.can_access_branch(branch_id));

drop policy if exists "branch_documents_update_policy" on public.branch_documents;
create policy "branch_documents_update_policy"
on public.branch_documents
for update
using (public.can_access_branch(branch_id))
with check (public.can_access_branch(branch_id));

drop policy if exists "branch_documents_delete_policy" on public.branch_documents;
create policy "branch_documents_delete_policy"
on public.branch_documents
for delete
using (public.can_access_branch(branch_id));

drop policy if exists "branch_form_qr_codes_select_policy" on public.branch_form_qr_codes;
create policy "branch_form_qr_codes_select_policy"
on public.branch_form_qr_codes
for select
using (public.can_access_branch(branch_id));

drop policy if exists "branch_form_qr_codes_insert_policy" on public.branch_form_qr_codes;
create policy "branch_form_qr_codes_insert_policy"
on public.branch_form_qr_codes
for insert
with check (public.can_access_company(company_id));

drop policy if exists "branch_form_qr_codes_update_policy" on public.branch_form_qr_codes;
create policy "branch_form_qr_codes_update_policy"
on public.branch_form_qr_codes
for update
using (public.can_access_branch(branch_id))
with check (public.can_access_branch(branch_id));

drop policy if exists "branch_refrigeration_equipment_select_policy" on public.branch_refrigeration_equipment;
create policy "branch_refrigeration_equipment_select_policy"
on public.branch_refrigeration_equipment
for select
using (public.can_access_branch(branch_id));

drop policy if exists "branch_refrigeration_equipment_insert_policy" on public.branch_refrigeration_equipment;
create policy "branch_refrigeration_equipment_insert_policy"
on public.branch_refrigeration_equipment
for insert
with check (public.can_access_branch(branch_id));

drop policy if exists "branch_refrigeration_equipment_update_policy" on public.branch_refrigeration_equipment;
create policy "branch_refrigeration_equipment_update_policy"
on public.branch_refrigeration_equipment
for update
using (public.can_access_branch(branch_id))
with check (public.can_access_branch(branch_id));

drop policy if exists "branch_sanitation_areas_select_policy" on public.branch_sanitation_areas;
create policy "branch_sanitation_areas_select_policy"
on public.branch_sanitation_areas
for select
using (public.can_access_branch(branch_id));

drop policy if exists "branch_sanitation_areas_insert_policy" on public.branch_sanitation_areas;
create policy "branch_sanitation_areas_insert_policy"
on public.branch_sanitation_areas
for insert
with check (public.can_access_branch(branch_id));

drop policy if exists "branch_sanitation_areas_update_policy" on public.branch_sanitation_areas;
create policy "branch_sanitation_areas_update_policy"
on public.branch_sanitation_areas
for update
using (public.can_access_branch(branch_id))
with check (public.can_access_branch(branch_id));

drop policy if exists "thermal_control_records_select_policy" on public.thermal_control_records;
create policy "thermal_control_records_select_policy"
on public.thermal_control_records
for select
using (public.can_access_branch(sede_id));

drop policy if exists "area_sanitation_records_select_policy" on public.area_sanitation_records;
create policy "area_sanitation_records_select_policy"
on public.area_sanitation_records
for select
using (public.can_access_branch(sede_id));

drop policy if exists "supply_reception_records_select_policy" on public.supply_reception_records;
create policy "supply_reception_records_select_policy"
on public.supply_reception_records
for select
using (public.can_access_branch(sede_id));

drop policy if exists "water_quality_records_select_policy" on public.water_quality_records;
create policy "water_quality_records_select_policy"
on public.water_quality_records
for select
using (public.can_access_branch(sede_id));

drop policy if exists "demo_requests_select_policy" on public.demo_requests;
create policy "demo_requests_select_policy"
on public.demo_requests
for select
using (public.is_owner() or public.is_super_admin());

revoke all on function public.get_public_operational_form(text) from public;
revoke all on function public.submit_public_operational_form(
  text,
  text,
  uuid,
  numeric,
  uuid,
  boolean,
  text,
  text,
  date,
  numeric
) from public;

grant execute on function public.get_public_operational_form(text) to anon, authenticated;
grant execute on function public.submit_public_operational_form(
  text,
  text,
  uuid,
  numeric,
  uuid,
  boolean,
  text,
  text,
  date,
  numeric
) to anon, authenticated;

comment on function public.bootstrap_owner(uuid, text, text) is
'Run this manually after creating the first auth user in Supabase Auth to promote that user to owner.';
