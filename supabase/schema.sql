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

drop policy if exists "demo_requests_select_policy" on public.demo_requests;
create policy "demo_requests_select_policy"
on public.demo_requests
for select
using (public.is_owner() or public.is_super_admin());

comment on function public.bootstrap_owner(uuid, text, text) is
'Run this manually after creating the first auth user in Supabase Auth to promote that user to owner.';
