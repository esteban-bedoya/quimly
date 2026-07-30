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
  schema.sql            Modelo canónico, roles y RLS
  migrations/           Cambios incrementales para bases ya desplegadas
```

## Variables de entorno

Copia `.env.example` a `.env.local` y completa las credenciales de Supabase y Mercado Pago.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (solo para operaciones Auth Admin en servidor)
- `NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY` (tokenización segura de tarjeta en MercadoPago.js)

### WhatsApp Business con Twilio

La bandeja interna usa las credenciales de Twilio que ya existen en el servidor; no agrega ninguna variable pública ni expone secretos al navegador.

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `NEXT_PUBLIC_APP_URL` (debe ser la URL pública y canónica, por ejemplo `https://quimly.co`)
- `TWILIO_WHATSAPP_FROM` sigue siendo necesario para las notificaciones existentes. La bandeja responde usando el sender que recibió la conversación.
- `TWILIO_WHATSAPP_TEMPLATE_SID` identifica la plantilla de WhatsApp aprobada que usa el endpoint interno de prueba `POST /api/test/whatsapp-template`.
- `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` son opcionales. Cuando ambos estén configurados, Quimly enviará una alerta por cada mensaje entrante, por los mensajes automáticos y acuses (aceptación, entrega o fallo), y por los fallos de respuestas manuales. Sin ambos valores no se realizan envíos a Telegram.

La bandeja es una herramienta interna exclusiva del rol `owner`; no pertenece a las empresas clientes y sus tablas no usan `company_id`. Un webhook firmado registra automáticamente el sender de Quimly, el contacto por número telefónico y su conversación, incluso si el contacto nunca había escrito antes.

Para una instalación nueva, aplica `supabase/schema.sql`. Si la versión multiempresa de WhatsApp ya fue desplegada, aplica una sola vez `supabase/migrations/2026071301_whatsapp_owner_internal.sql`: la migración conserva los IDs y el historial de canales, conversaciones y mensajes, y elimina únicamente las asociaciones empresariales obsoletas. En producción, ejecuta la migración y despliega esta versión de la aplicación de forma coordinada, porque el nombre de la tabla cambia dentro de la transacción.

Para activar las notificaciones de bandeja, los contadores de no leídos y el cursor de lectura en una base existente, aplica después `supabase/migrations/2026071401_whatsapp_inbox_notifications.sql` antes de desplegar esta versión.

En Twilio, configura el webhook de mensajes entrantes del WhatsApp Sender o del Messaging Service con método `POST`:

```txt
https://quimly.co/api/webhooks/twilio/whatsapp
```

Usa exactamente el mismo dominio configurado en `NEXT_PUBLIC_APP_URL`; Twilio firma la URL completa y Quimly valida `X-Twilio-Signature` con el Auth Token antes de procesar cualquier evento. Las respuestas enviadas desde la bandeja incluyen automáticamente el callback de estado `/api/webhooks/twilio/whatsapp/status` para registrar envío, entrega, lectura o error.

WhatsApp permite texto libre durante la ventana de atención de 24 horas desde el último mensaje del cliente. Para iniciar una conversación por fuera de esa ventana, Twilio/Meta exige una plantilla aprobada. El endpoint interno `POST /api/test/whatsapp-template` usa la plantilla configurada en `TWILIO_WHATSAPP_TEMPLATE_SID` y solo permite solicitudes autenticadas del rol `owner`.

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

La finalización del acceso de suscripciones canceladas y de incidencias de cobro diferidas hasta
el fin del periodo pagado depende del job `finalize_due_subscription_cancellations`, programado
cada cinco minutos. Antes de producción, verifica la extensión, la definición del job y sus
últimas ejecuciones desde Supabase SQL Editor:

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
