import "server-only";

import { isE164PhoneNumber, type E164PhoneNumber } from "@/lib/phone";
import { sendWhatsAppTemplate, type WhatsAppTemplateVariables } from "@/lib/notifications/whatsapp-template.service";
import {
  SCHEDULED_WHATSAPP_CLAIM_LIMIT,
  SCHEDULED_WHATSAPP_MAX_ATTEMPTS,
  SCHEDULED_WHATSAPP_RECIPIENT_SPACING_MINUTES,
  getScheduledWhatsAppRetryDelayMinutes,
} from "@/lib/notifications/scheduled-whatsapp-policy";
import type { ScheduledWhatsAppTemplateKey } from "@/lib/notifications/types";
import { logServerError, logServerInfo } from "@/lib/server/logging";
import { dispatchAutomatedWhatsAppSupportAlert } from "@/lib/support-notifications/dispatch.server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTwilioWhatsAppStatusCallbackUrl, recordAutomatedWhatsAppTemplateMessage } from "@/lib/whatsapp-inbox/service.server";

const COLOMBIA_TIME_ZONE = "America/Bogota";
const documentReminderDays = [1, 7, 15, 30] as const;
const notificationStartHour = 8;
const MAX_SEND_CONCURRENCY = 3;

type BranchRow = { id: string; company_id: string; name: string; status: "active" | "inactive" | "deleted"; is_active: boolean };
type CompanyRow = { id: string; name: string; is_active: boolean; company_admin_user_id: string | null };
type ProfileRow = { user_id: string; full_name: string | null; phone: string; phone_verified: boolean; is_active: boolean };
type SubscriptionRow = {
  id: string;
  company_id: string;
  status: "trial" | "active" | "payment_issue" | "suspended" | "cancelled";
  trial_started_at: string;
  trial_ends_at: string;
};
type SanitaryDocumentRow = { id: string; branch_id: string; document_kind: string; staff_member_id: string | null; expires_at: string };
type BranchDocumentRow = { id: string; branch_id: string; title: string; expires_at: string };
type StaffMemberRow = { id: string; full_name: string };
type DailyFormSummaryRow = { sede_id: string; formulario_id: "thermal_control" | "area_sanitation" | "supply_reception" | "water_quality"; fecha: string; cantidad_registros: number };
type DocumentCategoryRow = { sede_id: string; categoria: "sanitation_plan" | "chemical_products" | "pest_control" | "water_tank_cleaning" | "acu_final_disposal" | "staff_records"; estado_calculado: "gris" | "rojo" | "amarillo" | "verde" };
type FounderAssignmentRow = { company_id: string; occurred_at: string };

type NotificationRecipient = { userId: string; name: string | null; phone: E164PhoneNumber };
type NotificationContext = { company: CompanyRow; branch: BranchRow; recipient: NotificationRecipient };
type TelegramAlertContext = { recipientName: string | null; recipientPhone: string; restaurantName: string; branchName: string };
type PreparedNotification = {
  context: NotificationContext;
  templateKey: ScheduledWhatsAppTemplateKey;
  deduplicationKey: string;
  variables: WhatsAppTemplateVariables;
  fallbackBody: string;
  scopeBranchId: string | null;
  priority: number;
};
type StoredDeliveryPayload = { variables: WhatsAppTemplateVariables; fallbackBody: string; telegram: TelegramAlertContext };
type ClaimedDelivery = {
  id: string;
  recipient_phone: string;
  notification_type: ScheduledWhatsAppTemplateKey;
  template_key: ScheduledWhatsAppTemplateKey;
  payload: StoredDeliveryPayload;
  attempt_count: number;
};

export type ScheduledWhatsAppNotificationRunResult = {
  enqueued: number;
  attempted: number;
  accepted: number;
  retryScheduled: number;
  skipped: number;
  failed: number;
};

function requiredAdminClient() {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error("Supabase Admin no está configurado para las notificaciones programadas.");
  return client;
}

function getTimeZoneParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit", hour: "2-digit", hourCycle: "h23", minute: "2-digit", month: "2-digit", timeZone: COLOMBIA_TIME_ZONE, weekday: "short", year: "numeric",
  }).formatToParts(date).reduce<Record<string, string>>((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});

  return { dateKey: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute), weekday: parts.weekday };
}

function addDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function localDateKey(date: Date) {
  return getTimeZoneParts(date).dateKey;
}

function formatDateForMessage(dateKey: string) {
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", timeZone: "UTC", year: "numeric" }).format(new Date(`${dateKey}T00:00:00Z`));
}

function getFirstEightAmDate(date: Date) {
  const parts = getTimeZoneParts(date);
  return parts.hour < notificationStartHour || (parts.hour === notificationStartHour && parts.minute === 0) ? parts.dateKey : addDays(parts.dateKey, 1);
}

function hasReachedNotificationStart(now: Date) {
  return getTimeZoneParts(now).hour >= notificationStartHour;
}

function notificationStartAt(today: string) {
  // Colombia stays at UTC-5, without daylight saving time.
  return new Date(`${today}T13:00:00.000Z`);
}

function getBranchScopeName(companyBranches: BranchRow[]) {
  return companyBranches.length === 1 ? companyBranches[0].name : "Todas las sedes";
}

function getRecipientGreetingName(name: string | null) {
  return name?.trim() || "cliente";
}

function documentDisplayName(documentKind: string, staffName: string | null) {
  const titleByKind: Record<string, string> = {
    sanitation_plan: "Plan de Saneamiento Básico",
    pest_control_certificate: "Certificado Control de Plagas",
    water_tank_cleaning_certificate: "Certificado Lavado de Tanques",
    acu_final_disposal_certificate: "Certificado de Disposición Final de Aceites (ACU)",
    food_handling_course: "Curso de Manipulación de Alimentos",
    medical_fitness_exam: "Certificado Médico",
  };
  const title = titleByKind[documentKind] ?? documentKind;
  return staffName ? `${title} - ${staffName}` : title;
}

function pendingDocumentCategoryLabel(category: DocumentCategoryRow["categoria"]) {
  const labels: Record<DocumentCategoryRow["categoria"], string> = {
    sanitation_plan: "Plan de Saneamiento Básico",
    chemical_products: "Documentos de productos químicos",
    pest_control: "Certificado Control de Plagas",
    water_tank_cleaning: "Certificado Lavado de Tanques",
    acu_final_disposal: "Certificado de Disposición Final de Aceites (ACU)",
    staff_records: "Documentos de colaboradores",
  };
  return labels[category];
}

function weeklyDaysWithRecords(rows: DailyFormSummaryRow[], formType: DailyFormSummaryRow["formulario_id"]) {
  return rows.filter((row) => row.formulario_id === formType && row.cantidad_registros > 0).length;
}

function buildWeeklyPeriodLabel(today: string) {
  const periodEnd = addDays(today, -1);
  return `Del ${formatDateForMessage(addDays(periodEnd, -6))} al ${formatDateForMessage(periodEnd)}`;
}

function makeTelegramContext(context: NotificationContext): TelegramAlertContext {
  return { recipientName: context.recipient.name, recipientPhone: context.recipient.phone, restaurantName: context.company.name, branchName: context.branch.name };
}

async function loadNotificationData() {
  const supabase = requiredAdminClient();
  const { data: branches, error: branchesError } = await supabase
    .from("branches")
    .select("id, company_id, name, status, is_active")
    .neq("status", "deleted")
    .order("company_id", { ascending: true })
    .order("name", { ascending: true })
    .returns<BranchRow[]>();
  if (branchesError) throw new Error(`No fue posible consultar las sedes: ${branchesError.message}`);

  const allBranches = branches ?? [];
  const activeBranches = allBranches.filter((branch) => branch.status === "active" && branch.is_active);
  const companyIds = [...new Set(allBranches.map((branch) => branch.company_id))];
  if (!companyIds.length) return { allBranches, activeBranches, companies: [] as CompanyRow[], profiles: [] as ProfileRow[], subscriptions: [] as SubscriptionRow[] };

  const { data: companies, error: companiesError } = await supabase
    .from("companies")
    .select("id, name, is_active, company_admin_user_id")
    .in("id", companyIds)
    .eq("is_active", true)
    .returns<CompanyRow[]>();
  if (companiesError) throw new Error(`No fue posible consultar los restaurantes: ${companiesError.message}`);

  const companyRows = companies ?? [];
  const adminUserIds = companyRows.flatMap((company) => (company.company_admin_user_id ? [company.company_admin_user_id] : []));
  const [profilesResult, subscriptionsResult] = await Promise.all([
    adminUserIds.length
      ? supabase.from("user_profiles").select("user_id, full_name, phone, phone_verified, is_active").in("user_id", adminUserIds).returns<ProfileRow[]>()
      : Promise.resolve({ data: [] as ProfileRow[], error: null }),
    supabase.from("company_subscriptions").select("id, company_id, status, trial_started_at, trial_ends_at").in("company_id", companyRows.map((company) => company.id)).returns<SubscriptionRow[]>(),
  ]);
  if (profilesResult.error || subscriptionsResult.error) throw new Error(`No fue posible consultar los destinatarios o pruebas: ${(profilesResult.error ?? subscriptionsResult.error)?.message}`);
  return { allBranches, activeBranches, companies: companyRows, profiles: profilesResult.data ?? [], subscriptions: subscriptionsResult.data ?? [] };
}

function createNotificationContext(branch: BranchRow, companiesById: Map<string, CompanyRow>, profilesByUserId: Map<string, ProfileRow>): NotificationContext | null {
  const company = companiesById.get(branch.company_id);
  const profile = company?.company_admin_user_id ? profilesByUserId.get(company.company_admin_user_id) : null;
  if (!company || !profile || !profile.is_active || !profile.phone_verified || !isE164PhoneNumber(profile.phone)) return null;
  return { company, branch, recipient: { userId: profile.user_id, name: profile.full_name, phone: profile.phone } };
}

async function prepareDocumentExpiryNotifications(today: string, contextsByBranchId: Map<string, NotificationContext>) {
  const supabase = requiredAdminClient();
  const targetDates = documentReminderDays.map((days) => addDays(today, days));
  const [sanitaryResult, branchResult] = await Promise.all([
    supabase.from("branch_sanitary_document_files").select("id, branch_id, document_kind, staff_member_id, expires_at").eq("is_active", true).in("expires_at", targetDates).returns<SanitaryDocumentRow[]>(),
    supabase.from("branch_documents").select("id, branch_id, title, expires_at").eq("is_active", true).in("expires_at", targetDates).returns<BranchDocumentRow[]>(),
  ]);
  if (sanitaryResult.error || branchResult.error) throw new Error(`No fue posible consultar documentos próximos a vencer: ${(sanitaryResult.error ?? branchResult.error)?.message}`);

  const staffIds = [...new Set((sanitaryResult.data ?? []).flatMap((document) => (document.staff_member_id ? [document.staff_member_id] : [])))];
  const { data: staffMembers, error: staffError } = staffIds.length
    ? await supabase.from("branch_staff_members").select("id, full_name").in("id", staffIds).returns<StaffMemberRow[]>()
    : { data: [] as StaffMemberRow[], error: null };
  if (staffError) throw new Error(`No fue posible consultar los colaboradores de los documentos: ${staffError.message}`);
  const staffNameById = new Map((staffMembers ?? []).map((staff) => [staff.id, staff.full_name]));

  const candidates = [
    ...(sanitaryResult.data ?? []).map((document) => ({ id: document.id, branchId: document.branch_id, title: documentDisplayName(document.document_kind, document.staff_member_id ? staffNameById.get(document.staff_member_id) ?? null : null), expiresAt: document.expires_at })),
    ...(branchResult.data ?? []).map((document) => ({ id: document.id, branchId: document.branch_id, title: document.title, expiresAt: document.expires_at })),
  ];

  return candidates.flatMap((document): PreparedNotification[] => {
    const daysRemaining = documentReminderDays.find((days) => addDays(today, days) === document.expiresAt);
    const context = contextsByBranchId.get(document.branchId);
    if (!daysRemaining || !context) return [];
    const deadline = formatDateForMessage(document.expiresAt);
    const variables = { "1": context.company.name, "2": context.branch.name, "3": document.title, "4": `${daysRemaining} ${daysRemaining === 1 ? "día" : "días"}`, "5": deadline };
    return [{
      context,
      templateKey: "document_expiry_reminder",
      deduplicationKey: `document_expiry_reminder:${document.id}:${daysRemaining}:${document.expiresAt}`,
      variables,
      fallbackBody: ["Quimly", "", `Restaurante: ${context.company.name}`, `Sede: ${context.branch.name}`, "", `El documento ${document.title} vence en ${variables["4"]}, el ${deadline}.`, "", "Revísalo y actualízalo en Quimly antes de esa fecha."].join("\n"),
      scopeBranchId: context.branch.id,
      priority: daysRemaining,
    }];
  });
}

async function prepareWeeklyOperationalSummaries(today: string, contextsByBranchId: Map<string, NotificationContext>) {
  if (getTimeZoneParts(new Date(`${today}T12:00:00Z`)).weekday !== "Mon") return [] as PreparedNotification[];
  const branchIds = [...contextsByBranchId.keys()];
  if (!branchIds.length) return [] as PreparedNotification[];
  const supabase = requiredAdminClient();
  const periodEnd = addDays(today, -1);
  const periodStart = addDays(periodEnd, -6);
  const [formSummaryResult, documentCategoriesResult] = await Promise.all([
    supabase.from("resumen_diario_formularios").select("sede_id, formulario_id, fecha, cantidad_registros").in("sede_id", branchIds).gte("fecha", periodStart).lte("fecha", periodEnd).returns<DailyFormSummaryRow[]>(),
    supabase.from("sedes_categorias_documentos").select("sede_id, categoria, estado_calculado").in("sede_id", branchIds).in("estado_calculado", ["gris", "amarillo"]).returns<DocumentCategoryRow[]>(),
  ]);
  if (formSummaryResult.error || documentCategoriesResult.error) throw new Error(`No fue posible preparar el resumen semanal: ${(formSummaryResult.error ?? documentCategoriesResult.error)?.message}`);

  const summariesByBranchId = new Map<string, DailyFormSummaryRow[]>();
  for (const row of formSummaryResult.data ?? []) summariesByBranchId.set(row.sede_id, [...(summariesByBranchId.get(row.sede_id) ?? []), row]);
  const missingByBranchId = new Map<string, DocumentCategoryRow[]>();
  for (const row of documentCategoriesResult.data ?? []) missingByBranchId.set(row.sede_id, [...(missingByBranchId.get(row.sede_id) ?? []), row]);
  const period = buildWeeklyPeriodLabel(today);

  return [...contextsByBranchId.values()].map((context) => {
    const rows = summariesByBranchId.get(context.branch.id) ?? [];
    const missingDocuments = (missingByBranchId.get(context.branch.id) ?? []).map((row) => pendingDocumentCategoryLabel(row.categoria)).join(", ") || "Ninguno";
    const receptionRecords = rows.filter((row) => row.formulario_id === "supply_reception").reduce((total, row) => total + row.cantidad_registros, 0);
    const variables = {
      "1": context.company.name,
      "2": context.branch.name,
      "3": period,
      "4": `${weeklyDaysWithRecords(rows, "thermal_control")} días con registros`,
      "5": `${weeklyDaysWithRecords(rows, "area_sanitation")} días con registros`,
      "6": `${weeklyDaysWithRecords(rows, "water_quality")} días con registros`,
      "7": `${receptionRecords} ${receptionRecords === 1 ? "registro" : "registros"}`,
      "8": missingDocuments,
    };
    return {
      context,
      templateKey: "weekly_operational_summary" as const,
      deduplicationKey: `weekly_operational_summary:${context.branch.id}:${periodStart}:${periodEnd}`,
      variables,
      fallbackBody: ["Quimly", "", `Restaurante: ${context.company.name}`, `Sede: ${context.branch.name}`, `Periodo: ${period}`, "", `Temperaturas: ${variables["4"]}`, `Limpieza y desinfección: ${variables["5"]}`, `Agua potable: ${variables["6"]}`, `Recepción de materias primas: ${variables["7"]}`, `Documentos sin cargar: ${missingDocuments}`, "", "Consulta el detalle en Quimly."].join("\n"),
      scopeBranchId: context.branch.id,
      priority: 100,
    };
  });
}

function prepareTrialNotifications(now: Date, today: string, branchesByCompanyId: Map<string, BranchRow[]>, contextsByBranchId: Map<string, NotificationContext>, subscriptions: SubscriptionRow[]) {
  const notifications: PreparedNotification[] = [];
  for (const subscription of subscriptions) {
    if (subscription.status !== "trial") continue;
    const companyBranches = branchesByCompanyId.get(subscription.company_id) ?? [];
    const context = companyBranches.length ? contextsByBranchId.get(companyBranches[0].id) : null;
    if (!context) continue;
    const branchScope = getBranchScopeName(companyBranches);
    const startDate = localDateKey(new Date(subscription.trial_started_at));
    const endDate = localDateKey(new Date(subscription.trial_ends_at));
    const welcomeDate = getFirstEightAmDate(new Date(subscription.trial_started_at));
    const midpointDate = addDays(startDate, 7);
    const expiryMessageDate = addDays(endDate, 1);
    const greeting = getRecipientGreetingName(context.recipient.name);

    if (welcomeDate <= today) notifications.push({ context, templateKey: "trial_welcome", deduplicationKey: `trial_welcome:${subscription.id}`, variables: { "1": greeting, "2": context.company.name, "3": branchScope, "4": formatDateForMessage(endDate) }, fallbackBody: ["Quimly", "", `Hola, ${greeting}.`, "", "Te damos la bienvenida a Quimly.", "", `Restaurante: ${context.company.name}`, `Sede: ${branchScope}`, "", `Tu prueba gratuita está activa hasta el ${formatDateForMessage(endDate)}. Aprovecha la gestión documental y los formularios operativos para conocer Quimly.`, "", "Si necesitas ayuda en cualquier momento, responde este mensaje."].join("\n"), scopeBranchId: null, priority: 60 });
    if (midpointDate <= today) notifications.push({ context, templateKey: "trial_midpoint", deduplicationKey: `trial_midpoint:${subscription.id}`, variables: { "1": greeting, "2": context.company.name, "3": branchScope, "4": formatDateForMessage(endDate) }, fallbackBody: ["Quimly", "", `Hola, ${greeting}.`, "", "Ya transcurrió la mitad de tu prueba gratuita.", "", `Restaurante: ${context.company.name}`, `Sede: ${branchScope}`, "", `Te recomendamos registrar formularios y cargar tus documentos para aprovechar Quimly antes del ${formatDateForMessage(endDate)}.`, "", "Si necesitas ayuda en cualquier momento, responde este mensaje."].join("\n"), scopeBranchId: null, priority: 70 });
    if (expiryMessageDate <= today && new Date(subscription.trial_ends_at).getTime() < now.getTime()) notifications.push({ context, templateKey: "trial_expired", deduplicationKey: `trial_expired:${subscription.id}:${endDate}`, variables: { "1": greeting, "2": formatDateForMessage(endDate), "3": context.company.name, "4": branchScope }, fallbackBody: ["Quimly", "", `Hola, ${greeting}.`, "", `Tu prueba gratuita finalizó el ${formatDateForMessage(endDate)}.`, "", `Restaurante: ${context.company.name}`, `Sede: ${branchScope}`, "", "Esperamos que Quimly haya sido útil para tu operación. Puedes suscribirte para continuar usando la plataforma.", "", "Si necesitas ayuda o quieres conocer las opciones disponibles, responde este mensaje."].join("\n"), scopeBranchId: null, priority: 40 });
  }
  return notifications;
}

async function prepareFounderBenefitNotifications(today: string, branchesByCompanyId: Map<string, BranchRow[]>, contextsByBranchId: Map<string, NotificationContext>) {
  const yesterdayAtEight = notificationStartAt(addDays(today, -1)).toISOString();
  const { data: assignments, error } = await requiredAdminClient()
    .from("subscription_status_history")
    .select("company_id, occurred_at")
    .eq("reason", "founder_assigned")
    .gte("occurred_at", yesterdayAtEight)
    .returns<FounderAssignmentRow[]>();
  if (error) throw new Error(`No fue posible consultar las asignaciones Founder: ${error.message}`);

  return (assignments ?? []).flatMap((assignment): PreparedNotification[] => {
    if (getFirstEightAmDate(new Date(assignment.occurred_at)) > today) return [];
    const companyBranches = branchesByCompanyId.get(assignment.company_id) ?? [];
    const context = companyBranches.length ? contextsByBranchId.get(companyBranches[0].id) : null;
    if (!context) return [];
    const greeting = getRecipientGreetingName(context.recipient.name);
    const branchScope = getBranchScopeName(companyBranches);
    return [{ context, templateKey: "founder_benefit_assigned", deduplicationKey: `founder_benefit_assigned:${assignment.company_id}:${assignment.occurred_at}`, variables: { "1": greeting, "2": context.company.name, "3": branchScope }, fallbackBody: ["Quimly", "", `Hola, ${greeting}.`, "", "Tu beneficio Founder fue activado.", "", `Restaurante: ${context.company.name}`, `Sede: ${branchScope}`, "", "Ahora cuentas con las condiciones especiales asociadas a Founder. Puedes revisar el detalle de tu plan en Quimly.", "", "Si necesitas ayuda en cualquier momento, responde este mensaje."].join("\n"), scopeBranchId: null, priority: 50 }];
  });
}

async function enqueueNotifications(notifications: PreparedNotification[], now: Date, today: string, result: ScheduledWhatsAppNotificationRunResult) {
  const supabase = requiredAdminClient();
  const baseTime = new Date(Math.max(notificationStartAt(today).getTime(), now.getTime()));
  const recipientPositions = new Map<string, number>();
  const ordered = [...notifications].sort((left, right) => left.context.recipient.phone.localeCompare(right.context.recipient.phone) || left.priority - right.priority || left.deduplicationKey.localeCompare(right.deduplicationKey));

  for (const notification of ordered) {
    const position = recipientPositions.get(notification.context.recipient.phone) ?? 0;
    recipientPositions.set(notification.context.recipient.phone, position + 1);
    const scheduledFor = new Date(baseTime.getTime() + position * SCHEDULED_WHATSAPP_RECIPIENT_SPACING_MINUTES * 60_000).toISOString();
    const payload: StoredDeliveryPayload = { variables: notification.variables, fallbackBody: notification.fallbackBody, telegram: makeTelegramContext(notification.context) };
    const { data, error } = await supabase
      .from("whatsapp_notification_deliveries")
      .upsert({ company_id: notification.context.company.id, branch_id: notification.scopeBranchId, recipient_user_id: notification.context.recipient.userId, recipient_phone: notification.context.recipient.phone, notification_type: notification.templateKey, template_key: notification.templateKey, deduplication_key: notification.deduplicationKey, payload, status: "pending", scheduled_for: scheduledFor, next_attempt_at: scheduledFor }, { onConflict: "deduplication_key", ignoreDuplicates: true })
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error) throw new Error(`No fue posible encolar la notificación: ${error.message}`);
    if (data?.id) result.enqueued += 1;
    else result.skipped += 1;
  }
}

function parseDeliveryPayload(payload: unknown): StoredDeliveryPayload | null {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as Partial<StoredDeliveryPayload>;
  if (!value.variables || !value.fallbackBody || !value.telegram) return null;
  return value as StoredDeliveryPayload;
}

async function scheduleRetryOrFail(delivery: ClaimedDelivery, errorMessage: string, result: ScheduledWhatsAppNotificationRunResult) {
  const terminal = delivery.attempt_count >= SCHEDULED_WHATSAPP_MAX_ATTEMPTS;
  const nextAttemptAt = new Date(Date.now() + getScheduledWhatsAppRetryDelayMinutes(delivery.attempt_count) * 60_000).toISOString();
  const { error } = await requiredAdminClient().from("whatsapp_notification_deliveries").update({ status: terminal ? "failed" : "pending", next_attempt_at: terminal ? new Date().toISOString() : nextAttemptAt, error_message: errorMessage.slice(0, 1_000), twilio_status: terminal ? "failed" : null }).eq("id", delivery.id);
  if (error) throw new Error(`No fue posible guardar el reintento de WhatsApp: ${error.message}`);
  const payload = parseDeliveryPayload(delivery.payload);
  if (payload) await dispatchAutomatedWhatsAppSupportAlert({ notificationType: delivery.notification_type, ...payload.telegram, body: payload.fallbackBody, status: terminal ? "failed" : "retry_scheduled", errorMessage });
  if (terminal) result.failed += 1;
  else result.retryScheduled += 1;
}

async function dispatchClaimedDelivery(delivery: ClaimedDelivery, result: ScheduledWhatsAppNotificationRunResult) {
  if (delivery.attempt_count > SCHEDULED_WHATSAPP_MAX_ATTEMPTS) {
    await scheduleRetryOrFail(delivery, "Un intento anterior no terminó antes del tiempo de recuperación de la cola.", result);
    return;
  }

  const payload = parseDeliveryPayload(delivery.payload);
  if (!payload || !isE164PhoneNumber(delivery.recipient_phone)) {
    await scheduleRetryOrFail(delivery, "La entrega programada no tiene un destinatario o contenido válido.", result);
    return;
  }
  result.attempted += 1;
  let message: Awaited<ReturnType<typeof sendWhatsAppTemplate>>;
  try {
    message = await sendWhatsAppTemplate({ to: delivery.recipient_phone, templateKey: delivery.template_key, variables: payload.variables, statusCallback: getTwilioWhatsAppStatusCallbackUrl() });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Twilio no pudo aceptar el mensaje automático.";
    await scheduleRetryOrFail(delivery, errorMessage, result);
    logServerError("whatsapp.scheduled_notification_attempt_failed", error, { deliveryId: delivery.id, notificationType: delivery.notification_type, attemptCount: delivery.attempt_count });
    return;
  }

  const { error: acceptedError } = await requiredAdminClient().from("whatsapp_notification_deliveries").update({ status: "sent", twilio_message_sid: message.sid, twilio_status: message.status ?? "queued", error_message: null, sent_at: new Date().toISOString(), processing_started_at: null, telegram_failure_notified_for_sid: null }).eq("id", delivery.id);
  if (acceptedError) {
    logServerError("whatsapp.scheduled_notification_acceptance_persistence_failed", acceptedError, { deliveryId: delivery.id, twilioMessageSid: message.sid });
    return;
  }

  try {
    const inboxMessage = await recordAutomatedWhatsAppTemplateMessage({ to: delivery.recipient_phone, message, fallbackBody: payload.fallbackBody });
    const { error: inboxReferenceError } = await requiredAdminClient().from("whatsapp_notification_deliveries").update({ whatsapp_message_id: inboxMessage.messageId }).eq("id", delivery.id);
    if (inboxReferenceError) logServerError("whatsapp.scheduled_notification_inbox_reference_failed", inboxReferenceError, { deliveryId: delivery.id });
  } catch (error) {
    logServerError("whatsapp.scheduled_notification_inbox_persistence_failed", error, { deliveryId: delivery.id, twilioMessageSid: message.sid });
  }

  await dispatchAutomatedWhatsAppSupportAlert({ notificationType: delivery.notification_type, ...payload.telegram, body: payload.fallbackBody, status: "accepted" });
  result.accepted += 1;
}

async function mapWithConcurrency<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (items.length) {
      const item = items.shift();
      if (item) await worker(item);
    }
  });
  await Promise.all(workers);
}

async function dispatchDueDeliveries(result: ScheduledWhatsAppNotificationRunResult) {
  const { data, error } = await requiredAdminClient().rpc("claim_due_whatsapp_notification_deliveries", { p_limit: SCHEDULED_WHATSAPP_CLAIM_LIMIT }).returns<ClaimedDelivery[]>();
  if (error) throw new Error(`No fue posible reclamar entregas de WhatsApp: ${error.message}`);
  const deliveries = (data ?? []) as unknown as ClaimedDelivery[];
  await mapWithConcurrency([...deliveries], MAX_SEND_CONCURRENCY, (delivery) => dispatchClaimedDelivery(delivery, result));
}

export async function runScheduledWhatsAppNotifications(now = new Date()): Promise<ScheduledWhatsAppNotificationRunResult> {
  const result: ScheduledWhatsAppNotificationRunResult = { enqueued: 0, attempted: 0, accepted: 0, retryScheduled: 0, skipped: 0, failed: 0 };
  if (!hasReachedNotificationStart(now)) return result;
  const today = localDateKey(now);
  const data = await loadNotificationData();
  const companiesById = new Map(data.companies.map((company) => [company.id, company]));
  const profilesByUserId = new Map(data.profiles.map((profile) => [profile.user_id, profile]));
  const allContextsByBranchId = new Map(data.allBranches.flatMap((branch) => {
    const context = createNotificationContext(branch, companiesById, profilesByUserId);
    return context ? [[branch.id, context] as const] : [];
  }));
  const activeContextsByBranchId = new Map(data.activeBranches.flatMap((branch) => {
    const context = allContextsByBranchId.get(branch.id);
    return context ? [[branch.id, context] as const] : [];
  }));
  const branchesByCompanyId = new Map<string, BranchRow[]>();
  for (const branch of data.allBranches) branchesByCompanyId.set(branch.company_id, [...(branchesByCompanyId.get(branch.company_id) ?? []), branch]);

  const notifications = (await Promise.all([
    prepareDocumentExpiryNotifications(today, activeContextsByBranchId),
    prepareWeeklyOperationalSummaries(today, activeContextsByBranchId),
    prepareFounderBenefitNotifications(today, branchesByCompanyId, allContextsByBranchId),
  ])).flat();
  notifications.push(...prepareTrialNotifications(now, today, branchesByCompanyId, allContextsByBranchId, data.subscriptions));
  await enqueueNotifications(notifications, now, today, result);
  await dispatchDueDeliveries(result);
  logServerInfo("whatsapp.scheduled_notifications_completed", { today, ...result });
  return result;
}
