create extension if not exists pgcrypto;

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

create table if not exists public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  is_active boolean not null default true,
  assigned_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id)
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

drop trigger if exists set_companies_updated_at on public.companies;
create trigger set_companies_updated_at
before update on public.companies
for each row
execute function public.set_updated_at();

drop trigger if exists set_user_profiles_updated_at on public.user_profiles;
create trigger set_user_profiles_updated_at
before update on public.user_profiles
for each row
execute function public.set_updated_at();

drop trigger if exists set_company_memberships_updated_at on public.company_memberships;
create trigger set_company_memberships_updated_at
before update on public.company_memberships
for each row
execute function public.set_updated_at();

create or replace function public.current_profile_role()
returns public.app_role
language sql
stable
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
as $$
  select
    public.is_owner()
    or (
      public.is_super_admin()
      and public.can_access_all_companies()
    )
    or exists (
      select 1
      from public.company_memberships cm
      join public.user_profiles up
        on up.user_id = cm.user_id
      where cm.user_id = auth.uid()
        and cm.company_id = target_company_id
        and cm.is_active = true
        and up.is_active = true
    )
$$;

create or replace function public.can_manage_user(target_user_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.is_owner()
    or exists (
      select 1
      from public.user_profiles actor
      join public.user_profiles target
        on target.user_id = target_user_id
      where actor.user_id = auth.uid()
        and actor.is_active = true
        and actor.global_role = 'super_admin'
        and target.global_role = 'company_admin'
    )
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
alter table public.company_memberships enable row level security;
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
  or public.can_manage_user(user_id)
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

drop policy if exists "company_memberships_select_policy" on public.company_memberships;
create policy "company_memberships_select_policy"
on public.company_memberships
for select
using (
  user_id = auth.uid()
  or public.can_access_company(company_id)
);

drop policy if exists "company_memberships_insert_policy" on public.company_memberships;
create policy "company_memberships_insert_policy"
on public.company_memberships
for insert
with check (
  public.is_owner()
  or (
    public.is_super_admin()
    and exists (
      select 1
      from public.user_profiles up
      where up.user_id = company_memberships.user_id
        and up.global_role = 'company_admin'
    )
  )
);

drop policy if exists "company_memberships_update_policy" on public.company_memberships;
create policy "company_memberships_update_policy"
on public.company_memberships
for update
using (
  public.is_owner()
  or (
    public.is_super_admin()
    and exists (
      select 1
      from public.user_profiles up
      where up.user_id = company_memberships.user_id
        and up.global_role = 'company_admin'
    )
  )
)
with check (
  public.is_owner()
  or (
    public.is_super_admin()
    and exists (
      select 1
      from public.user_profiles up
      where up.user_id = company_memberships.user_id
        and up.global_role = 'company_admin'
    )
  )
);

drop policy if exists "demo_requests_select_policy" on public.demo_requests;
create policy "demo_requests_select_policy"
on public.demo_requests
for select
using (public.is_owner() or public.is_super_admin());

comment on function public.bootstrap_owner(uuid, text, text) is
'Run this manually after creating the first auth user in Supabase Auth to promote that user to owner.';
