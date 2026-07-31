-- Confirmación no destructiva de la migración de recuperación.

with checks as (
  select
    'RPC de finalización existe' as verificacion,
    to_regprocedure(
      'public.complete_scheduled_downgrade_cancellation(uuid,uuid,uuid,text,integer,timestamp with time zone,timestamp with time zone,integer)'
    ) is not null as ok

  union all
  select
    'RPC usa SECURITY DEFINER',
    coalesce((
      select p.prosecdef
      from pg_proc p
      where p.oid = to_regprocedure(
        'public.complete_scheduled_downgrade_cancellation(uuid,uuid,uuid,text,integer,timestamp with time zone,timestamp with time zone,integer)'
      )
    ), false)

  union all
  select
    'service_role puede finalizar la recuperación',
    has_function_privilege(
      'service_role',
      'public.complete_scheduled_downgrade_cancellation(uuid,uuid,uuid,text,integer,timestamp with time zone,timestamp with time zone,integer)',
      'EXECUTE'
    )
)
select
  verificacion,
  case when ok then 'OK' else 'REVISAR' end as estado
from checks
order by verificacion;
