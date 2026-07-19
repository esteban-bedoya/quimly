-- Permite crear y cerrar de forma segura checkouts de reactivación.
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
        and cs.status in ('trial', 'cancelled')
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
    raise exception 'La activación o reactivación no reservó su cierre antes de cancelar el preapproval.';
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
    raise exception 'La suscripción externa de la activación o reactivación no está disponible.';
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
    raise exception 'La activación o reactivación no está disponible.';
  end if;

  if intent_row.status = 'succeeded' then
    return false;
  end if;

  if intent_row.intent_type not in ('activation', 'recovery')
    or intent_row.requested_max_active_locations is null
    or intent_row.expected_immediate_amount_cop is null
    or coalesce((intent_row.metadata ->> 'activationClosureRequested')::boolean, false) then
    raise exception 'La activación o reactivación no admite la aplicación del pago.';
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
    raise exception 'El pago aprobado no corresponde a la activación o reactivación.';
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
    or (intent_row.intent_type = 'recovery' and subscription_row.status <> 'cancelled') then
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

revoke all on function public.expire_stale_billing_intents(uuid) from public, anon, authenticated;
grant execute on function public.expire_stale_billing_intents(uuid) to service_role;

revoke all on function public.claim_billing_activation_attempt_closure(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_billing_activation_attempt_closure(uuid, text) to service_role;

revoke all on function public.close_billing_activation_attempt(uuid, uuid, text, timestamptz, public.billing_intent_status, text, text) from public, anon, authenticated;
grant execute on function public.close_billing_activation_attempt(uuid, uuid, text, timestamptz, public.billing_intent_status, text, text) to service_role;

revoke all on function public.complete_billing_activation(uuid, uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.complete_billing_activation(uuid, uuid, uuid, timestamptz, timestamptz) to service_role;
