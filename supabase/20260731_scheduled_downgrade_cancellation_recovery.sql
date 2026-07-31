-- Migración: recuperación segura al cancelar una reducción programada.
-- Ejecutar una sola vez en el SQL Editor de Supabase, con un rol administrador.

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

revoke all on function public.complete_scheduled_downgrade_cancellation(uuid, uuid, uuid, text, integer, timestamptz, timestamptz, integer) from public;
revoke all on function public.complete_scheduled_downgrade_cancellation(uuid, uuid, uuid, text, integer, timestamptz, timestamptz, integer) from anon;
revoke all on function public.complete_scheduled_downgrade_cancellation(uuid, uuid, uuid, text, integer, timestamptz, timestamptz, integer) from authenticated;
grant execute on function public.complete_scheduled_downgrade_cancellation(uuid, uuid, uuid, text, integer, timestamptz, timestamptz, integer) to service_role;
