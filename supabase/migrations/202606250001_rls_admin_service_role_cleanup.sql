begin;

alter table public.user_profiles
  drop constraint if exists user_profiles_company_admin_scope;

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

  insert into public.branches (company_id, name, is_main, is_active, created_by)
  values (new_company_id, coalesce(nullif(trim(main_branch_name), ''), 'Sede Principal'), true, true, actor_id);

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
    is_active
  )
  values (
    target_user_id,
    lower(target_email),
    target_name,
    'owner',
    true
  )
  on conflict (user_id) do update
  set
    email = excluded.email,
    full_name = excluded.full_name,
    global_role = 'owner',
    is_active = true,
    updated_at = now();
end;
$$;

create or replace function public.provision_app_user(
  target_user_id uuid,
  target_email text,
  target_full_name text,
  target_role public.app_role,
  target_company_id uuid default null
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
begin
  actor_id := auth.uid();

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
    or nullif(trim(coalesce(target_email, '')), '') is null
    or nullif(trim(coalesce(target_full_name, '')), '') is null
  then
    raise exception 'Datos de usuario inválidos.';
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
    full_name,
    global_role,
    is_active,
    default_company_id
  )
  values (
    target_user_id,
    lower(trim(target_email)),
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

drop policy if exists "companies_delete_policy" on public.companies;

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

drop policy if exists "branches_delete_policy" on public.branches;

drop policy if exists "demo_requests_select_policy" on public.demo_requests;
create policy "demo_requests_select_policy"
on public.demo_requests
for select
using (public.is_owner() or public.is_super_admin());

drop policy if exists "demo_requests_insert_policy" on public.demo_requests;
drop policy if exists "demo_requests_update_policy" on public.demo_requests;
drop policy if exists "demo_requests_delete_policy" on public.demo_requests;

revoke all on function public.create_company_with_main_branch(text, uuid, text) from public;
revoke all on function public.create_company_with_main_branch(text, uuid, text) from anon;
grant execute on function public.create_company_with_main_branch(text, uuid, text) to authenticated;

revoke all on function public.set_main_branch(uuid) from public;
revoke all on function public.set_main_branch(uuid) from anon;
grant execute on function public.set_main_branch(uuid) to authenticated;

revoke all on function public.provision_app_user(uuid, text, text, public.app_role, uuid) from public;
revoke all on function public.provision_app_user(uuid, text, text, public.app_role, uuid) from anon;
grant execute on function public.provision_app_user(uuid, text, text, public.app_role, uuid) to authenticated;

revoke all on function public.submit_demo_lead(text, text, text, text, text) from public;
grant execute on function public.submit_demo_lead(text, text, text, text, text) to anon, authenticated;

drop function if exists public.can_access_all_companies();

alter table public.user_profiles
  drop column if exists can_access_all_companies;

commit;
