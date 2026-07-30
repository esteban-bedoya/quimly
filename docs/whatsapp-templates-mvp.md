# Plantillas WhatsApp para el MVP

Registra estas seis plantillas en Twilio Content Template Builder, en español (`es`). Usa las categorías indicadas como solicitud inicial; Meta determina la categoría final.

No uses emojis en estas plantillas. Al registrarlas, incluye muestras realistas de cada variable y conserva el texto exactamente como está.

## Configuración después de la aprobación

Guarda los seis Content SID aprobados en las variables de entorno de la aplicación:

```text
TWILIO_WHATSAPP_DOCUMENT_EXPIRY_TEMPLATE_SID=
TWILIO_WHATSAPP_WEEKLY_SUMMARY_TEMPLATE_SID=
TWILIO_WHATSAPP_TRIAL_WELCOME_TEMPLATE_SID=
TWILIO_WHATSAPP_TRIAL_MIDPOINT_TEMPLATE_SID=
TWILIO_WHATSAPP_TRIAL_EXPIRED_TEMPLATE_SID=
TWILIO_WHATSAPP_FOUNDER_BENEFIT_TEMPLATE_SID=
WHATSAPP_NOTIFICATIONS_CRON_SECRET=
```

`WHATSAPP_NOTIFICATIONS_CRON_SECRET` debe coincidir exactamente con el secreto `quimly_notification_cron_secret` guardado en Supabase Vault al configurar el cron.

## 1. `document_expiry_reminder`

- Categoría solicitada: `Utility`
- Variables: restaurante, sede, documento, días restantes, fecha exacta.

```text
Quimly

Restaurante: {{1}}
Sede: {{2}}

El documento {{3}} vence en {{4}}, el {{5}}.

Revísalo y actualízalo en Quimly antes de esa fecha.
```

Muestra de variables:

```json
{
  "1": "Restaurante La Casona",
  "2": "Sede Centro",
  "3": "Certificado Médico - Juan Pérez",
  "4": "15 días",
  "5": "15 de agosto de 2026"
}
```

Para el recordatorio de un día, la aplicación envía `1 día`; para los demás, por ejemplo, `15 días`.

## 2. `weekly_operational_summary`

- Categoría solicitada: `Utility`
- Variables: restaurante, sede, periodo, cuatro datos de formularios y documentos sin cargar.

```text
Quimly

Restaurante: {{1}}
Sede: {{2}}
Periodo: {{3}}

Temperaturas: {{4}}
Limpieza y desinfección: {{5}}
Agua potable: {{6}}
Recepción de materias primas: {{7}}
Documentos sin cargar: {{8}}

Consulta el detalle en Quimly.
```

Muestra de variables:

```json
{
  "1": "Restaurante La Casona",
  "2": "Sede Centro",
  "3": "Del 20 de julio de 2026 al 26 de julio de 2026",
  "4": "7 días con registros",
  "5": "6 días con registros",
  "6": "7 días con registros",
  "7": "4 registros",
  "8": "Documentos de productos químicos"
}
```

## 3. `trial_welcome`

- Categoría solicitada: `Marketing`

```text
Quimly

Hola, {{1}}.

Te damos la bienvenida a Quimly.

Restaurante: {{2}}
Sede: {{3}}

Tu prueba gratuita está activa hasta el {{4}}. Aprovecha la gestión documental y los formularios operativos para conocer Quimly.

Si necesitas ayuda en cualquier momento, responde este mensaje.
```

## 4. `trial_midpoint`

- Categoría solicitada: `Marketing`

```text
Quimly

Hola, {{1}}.

Ya transcurrió la mitad de tu prueba gratuita.

Restaurante: {{2}}
Sede: {{3}}

Te recomendamos registrar formularios y cargar tus documentos para aprovechar Quimly antes del {{4}}.

Si necesitas ayuda en cualquier momento, responde este mensaje.
```

## 5. `trial_expired`

- Categoría solicitada: `Marketing`

```text
Quimly

Hola, {{1}}.

Tu prueba gratuita finalizó el {{2}}.

Restaurante: {{3}}
Sede: {{4}}

Esperamos que Quimly haya sido útil para tu operación. Puedes suscribirte para continuar usando la plataforma.

Si necesitas ayuda o quieres conocer las opciones disponibles, responde este mensaje.
```

## 6. `founder_benefit_assigned`

- Categoría solicitada: `Marketing`

```text
Quimly

Hola, {{1}}.

Tu beneficio Founder fue activado.

Restaurante: {{2}}
Sede: {{3}}

Ahora cuentas con las condiciones especiales asociadas a Founder. Puedes revisar el detalle de tu plan en Quimly.

Si necesitas ayuda en cualquier momento, responde este mensaje.
```

Para las cuatro últimas plantillas, usa muestras de nombre, restaurante, sede y fecha equivalentes a las anteriores. La aplicación muestra `Todas las sedes` cuando el mensaje corresponde a una cuenta con más de una sede.
