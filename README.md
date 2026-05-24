# Quimly

Base inicial para una plataforma de operaciones quimicas construida con:

- Next.js App Router en `src/app`
- Tailwind CSS
- Supabase como backend y PostgreSQL administrado
- Prisma opcional, listo para agregarse cuando el modelo de datos madure

## Estructura

```txt
src/
  app/                  Rutas, layouts, Server Actions y API handlers
  components/landing/   Componentes de la pagina inicial
  data/                 Contenido reusable de UI
  lib/supabase/         Cliente server-side de Supabase
  types/                Tipos compartidos
supabase/
  schema.sql            Tabla inicial para solicitudes de demo
```

## Variables de entorno

Copia `env.example` a `.env.local` y completa las credenciales de Supabase.

```bash
npm run dev
```

La vista principal queda en `http://localhost:3000`.
