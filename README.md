# Quimly

Base inicial para una plataforma de operaciones quimicas construida con:

- Next.js App Router en `src/app`
- Tailwind CSS
- Supabase como backend y PostgreSQL administrado
- Prisma opcional, listo para agregarse cuando el modelo de datos madure
- Roles multi-tenant con `owner`, `super_admin` y `company_admin`

## Estructura

```txt
src/
  app/                  Rutas, layouts, auth, Server Actions y API handlers
  components/landing/   Componentes de la pagina inicial
  components/auth/      Formularios de autenticacion
  data/                 Contenido reusable de UI
  lib/auth/             Sesion server-side y contexto del usuario
  lib/supabase/         Cliente server-side de Supabase
  types/                Tipos compartidos
supabase/
  schema.sql            Modelo multi-tenant, roles y RLS
```

## Variables de entorno

Copia `.env.example` a `.env.local` y completa las credenciales de Supabase y Mercado Pago.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (solo para operaciones Auth Admin en servidor)
- `NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY` (tokenización segura de tarjeta en MercadoPago.js)

## Auth y roles

1. Ejecuta `supabase/schema.sql` en el SQL editor de tu proyecto.
2. Crea el primer usuario en Supabase Auth.
3. Ejecuta `select public.bootstrap_owner('<user-id>', '<email>', '<nombre>');` para promoverlo a `owner`.
4. Desde ese punto, las tablas `companies`, `user_profiles` y `branches` quedan protegidas con RLS.

```bash
npm run dev
```

La vista principal queda en `http://localhost:3000`.

## Verificación de Supabase Cron

La finalización del acceso de suscripciones canceladas depende del job
`finalize_due_subscription_cancellations`, programado cada cinco minutos. Antes de producción,
verifica la extensión, la definición del job y sus últimas ejecuciones desde Supabase SQL Editor:

```sql
select extname, extversion
from pg_extension
where extname = 'pg_cron';

select jobid, jobname, schedule, command, active
from cron.job
where jobname = 'finalize_due_subscription_cancellations';

select status, start_time, end_time, return_message
from cron.job_run_details
where jobid = (
  select jobid
  from cron.job
  where jobname = 'finalize_due_subscription_cancellations'
)
order by start_time desc
limit 20;
```

El resultado esperado es una extensión `pg_cron` instalada, un único job activo con schedule
`*/5 * * * *`, el comando `select public.finalize_due_subscription_cancellations();` y ejecuciones
recientes con estado `succeeded`.
