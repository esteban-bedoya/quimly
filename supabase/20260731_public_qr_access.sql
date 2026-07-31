-- Printed QR tokens are permanent. The public QR RPCs run anonymously, so
-- operation entitlement must not depend on an administrator's RLS session.

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

-- Access control is enforced by the caller's RLS policy or function. This
-- helper answers only whether the company is entitled to operate. It therefore
-- also works from the anonymous public QR RPCs.
create or replace function public.can_company_operate(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.company_has_operational_entitlement(target_company_id)
$$;

revoke all on function public.company_has_operational_entitlement(uuid) from public, anon, authenticated;
