import type { NotificationType } from "@/lib/notifications/types";

type TemplateBuilders = {
  otp: (code?: string) => string;
  trial_reminder: (days: number) => string;
  subscription_expired: () => string;
};

export const notificationTemplates: TemplateBuilders = {
  otp: (code = "{{code}}") => `Tu codigo de verificacion de Quimly es ${code}. No lo compartas con nadie.`,
  trial_reminder: (days) => {
    const unit = days === 1 ? "dia" : "dias";
    return `Tu prueba de Quimly termina en ${days} ${unit}. Si necesitas ayuda para activar tu plan, estamos listos para acompanarte.`;
  },
  subscription_expired: () =>
    "Tu suscripcion de Quimly ha vencido. Para reactivar tus herramientas de gestion de calidad, actualiza tu plan.",
};

export function getNotificationTemplate(type: NotificationType) {
  return notificationTemplates[type];
}
