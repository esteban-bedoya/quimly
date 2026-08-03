# Plantillas WhatsApp aprobadas

Estas siete plantillas aprobadas en Twilio reemplazan todas las plantillas anteriores. La aplicación mantiene los Content SID en variables de entorno para que no queden fijados en el código.

## Configuración

```text
TWILIO_WHATSAPP_DOCUMENT_EXPIRY_TEMPLATE_SID=HX78e55764a0703c071893dc7bfaca8143
TWILIO_WHATSAPP_TEMPLATE_SID=HXc220b5474f3535d173d99765d23caaf8
TWILIO_WHATSAPP_TRIAL_WELCOME_TEMPLATE_SID=HXa19809e3c6e723a5a45a4528d13266a4
TWILIO_WHATSAPP_TRIAL_MIDPOINT_TEMPLATE_SID=HXe875da97562216f388976c4cd39c62ae
TWILIO_WHATSAPP_TRIAL_EXPIRED_TEMPLATE_SID=HX7dcdea25f7003297e4f214bf907ba053
TWILIO_WHATSAPP_WEEKLY_SUMMARY_TEMPLATE_SID=HX6ed51057f3fc4fe663e46dd999a977b8
TWILIO_WHATSAPP_FOUNDER_BENEFIT_TEMPLATE_SID=HX9001b22347768d30ff562c874c4b04c8
WHATSAPP_NOTIFICATIONS_CRON_SECRET=
```

`WHATSAPP_NOTIFICATIONS_CRON_SECRET` debe coincidir exactamente con el secreto `quimly_notification_cron_secret` guardado en Supabase Vault al configurar el cron.

## 1. `quimly_document_expiry_alert`

- Content SID: `HX78e55764a0703c071893dc7bfaca8143`
- Variables: restaurante `{{1}}`, sede `{{2}}`, documento `{{3}}`, tiempo restante `{{4}}`, fecha de vencimiento `{{5}}`.

```text
⚠️ Documento próximo a vencer

El documento *{{3}}* de tu restaurante está próximo a vencer.

Sede: {{2}}
Restaurante: {{1}}

Tiempo restante: {{4}}
Fecha de vencimiento: *{{5}}*

Actualízalo antes de la fecha indicada y mantén tu operación preparada ante revisiones sanitarias: https://quimly.co/login

Equipo Quimly
```

## 2. `quimly_contact_message_confirmation`

- Content SID: `HXc220b5474f3535d173d99765d23caaf8`
- Variable: nombre `{{1}}`.
- Se envía como acuse automático al recibir un mensaje y desde la prueba interna.

```text
Hola {{1}}, recibimos tu mensaje correctamente.

Nuestro equipo Quimly ya tiene tu solicitud y la revisará para ayudarte lo antes posible.

Mientras tanto, seguimos trabajando para que tu operación sea más organizada y fácil de gestionar.

Equipo Quimly
```

## 3. `quimly_trial_welcome`

- Content SID: `HXa19809e3c6e723a5a45a4528d13266a4`
- Variables: nombre `{{1}}`, restaurante `{{2}}`, fecha final de prueba `{{4}}`.

```text
👋 Bienvenido a Quimly

Hola {{1}},

Tu restaurante *{{2}}* ahora hace parte de Quimly y tu prueba gratuita está activa hasta el *{{4}}*.

Durante este periodo podrás organizar tu documentación, digitalizar tus registros operativos y empezar a tener mayor control sobre tu operación.

Comienza aquí:
https://quimly.co/login

¿Necesitas ayuda para empezar? Responde este mensaje y te acompañamos.

Equipo Quimly
```

## 4. `quimly_trial_midpoint`

- Content SID: `HXe875da97562216f388976c4cd39c62ae`
- Variables: nombre `{{1}}`, restaurante `{{2}}`, fecha final de prueba `{{4}}`.

```text
🚀 Ya estás a mitad de tu prueba

Hola {{1}},

Tu restaurante *{{2}}* sigue disfrutando de Quimly hasta el *{{4}}*.

Este es el mejor momento para completar tus registros y cargar tu documentación, así podrás aprovechar al máximo la plataforma antes de que finalice tu prueba.

Ingresa aquí:
https://quimly.co/login

¿Necesitas ayuda? Responde este mensaje y te acompañamos.

Equipo Quimly
```

## 5. `quimly_trial_expired`

- Content SID: `HX7dcdea25f7003297e4f214bf907ba053`
- Variables: nombre `{{1}}`, fecha de finalización `{{2}}`, restaurante `{{3}}`.

```text
⏳ Tu prueba gratuita finalizó

Hola {{1}},

Tu prueba gratuita finalizó el *{{2}}*.

Restaurante: {{3}}

Esperamos que durante estos días hayas descubierto cómo Quimly puede ayudarte a organizar tu documentación y simplificar el seguimiento de tu operación.

Activa tu plan y continúa gestionando tu operación desde Quimly:
https://quimly.co/login

¿Tienes alguna pregunta? Responde este mensaje y con gusto te ayudaremos.

Equipo Quimly
```

## 6. `quimly_weekly_operations_status`

- Content SID: `HX6ed51057f3fc4fe663e46dd999a977b8`
- Variables: restaurante `{{1}}`, sede `{{2}}`, periodo `{{3}}`, registros de temperaturas `{{4}}`, limpieza `{{5}}`, agua potable `{{6}}`, recepción de materias primas `{{7}}`, documentos pendientes `{{8}}` y documentos vencidos `{{9}}`.

```text
📊 Reporte semanal de tu operación

Sede: {{2}}
Restaurante: {{1}}

────────────

Registros operativos durante el periodo *{{3}}*:

🌡️ Temperaturas: {{4}}
🧼 Limpieza y desinfección: {{5}}
💧 Agua potable: {{6}}
📦 Recepción de materias primas: {{7}}

────────────

Documentación:

📄 Documentos pendientes:
{{8}}

⚠️ Documentos vencidos:
{{9}}

Revisa los detalles y mantén tu cumplimiento al día: https://quimly.co/login

Equipo Quimly
```

## 7. `quimly_founder_benefit_activation`

- Content SID: `HX9001b22347768d30ff562c874c4b04c8`
- Variables: nombre `{{1}}`, restaurante `{{2}}`.

```text
⭐ ¡Beneficio Founder activado!

Hola {{1}},

Tu restaurante *{{2}}* ahora hace parte de Founder, un beneficio exclusivo para los primeros restaurantes que confiaron en Quimly.

Como restaurante Founder, conservarás un precio preferencial mientras continúes utilizando Quimly.

Gracias por ser parte de esta etapa inicial.

Si necesitas ayuda, responde este mensaje y estaremos atentos para ayudarte.

Equipo Quimly
```
