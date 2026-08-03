import "server-only";

import { isE164PhoneNumber, type E164PhoneNumber } from "@/lib/phone";
import { sendWhatsAppTemplate, type WhatsAppTemplateVariables } from "@/lib/notifications/whatsapp-template.service";
import { shouldDispatchQueuedTrialExpired, shouldDispatchQueuedTrialMidpoint, shouldSendTrialExpired, shouldSendTrialMidpoint } from "@/lib/notifications/trial-notification-policy";
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
import { getTwilioWhatsAppStatusCallbackUrl, recordAutomatedWhatsAppTemplateMessage, recordFailedAutomatedWhatsAppTemplateMessage } from "@/lib/whatsapp-inbox/service.server";

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
  plan_type: "operational" | "founder";
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
  company_id: string;
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

function hasReachedNotificationStart(now: Date) {
  return getTimeZoneParts(now).hour >= notificationStartHour;
}

function notificationStartAt(today: string) {
  // Colombia stays at UTC-5, without daylight saving time.
  return new Date(`${today}T13:00:00.000Z`);
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

function buildTrialWelcomeNotification(subscription: SubscriptionRow, context: NotificationContext): PreparedNotification {
  const endDate = localDateKey(new Date(subscription.trial_ends_at));
  const greeting = getRecipientGreetingName(context.recipient.name);
  return {
    context,
    templateKey: "trial_welcome",
    deduplicationKey: `trial_welcome:${subscription.id}`,
    variables: { "1": greeting, "2": context.company.name, "4": formatDateForMessage(endDate) },
    fallbackBody: ["👋 Bienvenido a Quimly", "", `Hola ${greeting},`, "", `Tu restaurante *${context.company.name}* ahora hace parte de Quimly y tu prueba gratuita está activa hasta el *${formatDateForMessage(endDate)}*.`, "", "Durante este periodo podrás organizar tu documentación, digitalizar tus registros operativos y empezar a tener mayor control sobre tu operación.", "", "Comienza aquí:", "https://quimly.co/login", "", "¿Necesitas ayuda para empezar? Responde este mensaje y te acompañamos.", "", "Equipo Quimly"].join("\n"),
    scopeBranchId: null,
    priority: 60,
  };
}

function buildFounderBenefitNotification(occurredAt: string, context: NotificationContext): PreparedNotification {
  const greeting = getRecipientGreetingName(context.recipient.name);
  return {
    context,
    templateKey: "founder_benefit_assigned",
    deduplicationKey: `founder_benefit_assigned:${context.company.id}:${occurredAt}`,
    variables: { "1": greeting, "2": context.company.name },
    fallbackBody: ["⭐ ¡Beneficio Founder activado!", "", `Hola ${greeting},`, "", `Tu restaurante *${context.company.name}* ahora hace parte de Founder, un beneficio exclusivo para los primeros restaurantes que confiaron en Quimly.`, "", "Como restaurante Founder, conservarás un precio preferencial mientras continúes utilizando Quimly.", "", "Gracias por ser parte de esta etapa inicial.", "", "Si necesitas ayuda, responde este mensaje y estaremos atentos para ayudarte.", "", "Equipo Quimly"].join("\n"),
    scopeBranchId: null,
    priority: 50,
  };
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
    supabase.from("company_subscriptions").select("id, company_id, status, plan_type, trial_started_at, trial_ends_at").in("company_id", companyRows.map((company) => company.id)).returns<SubscriptionRow[]>(),
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
    fallbackBody: ["⚠️ Documento próximo a vencer", "", `El documento *${document.title}* de tu restaurante está próximo a vencer.`, "", `Sede: ${context.branch.name}`, `Restaurante: ${context.company.name}`, "", `Tiempo restante: ${variables["4"]}`, `Fecha de vencimiento: *${deadline}*`, "", "Actualízalo antes de la fecha indicada y mantén tu operación preparada ante revisiones sanitarias: https://quimly.co/login", "", "Equipo Quimly"].join("\n"),
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
    supabase.from("sedes_categorias_documentos").select("sede_id, categoria, estado_calculado").in("sede_id", branchIds).in("estado_calculado", ["gris", "amarillo", "rojo"]).returns<DocumentCategoryRow[]>(),
  ]);
  if (formSummaryResult.error || documentCategoriesResult.error) throw new Error(`No fue posible preparar el resumen semanal: ${(formSummaryResult.error ?? documentCategoriesResult.error)?.message}`);

  const summariesByBranchId = new Map<string, DailyFormSummaryRow[]>();
  for (const row of formSummaryResult.data ?? []) summariesByBranchId.set(row.sede_id, [...(summariesByBranchId.get(row.sede_id) ?? []), row]);
  const missingByBranchId = new Map<string, DocumentCategoryRow[]>();
  for (const row of documentCategoriesResult.data ?? []) missingByBranchId.set(row.sede_id, [...(missingByBranchId.get(row.sede_id) ?? []), row]);
  const period = buildWeeklyPeriodLabel(today);

  return [...contextsByBranchId.values()].map((context) => {
    const rows = summariesByBranchId.get(context.branch.id) ?? [];
    const documentStatuses = missingByBranchId.get(context.branch.id) ?? [];
    const missingDocuments = documentStatuses.filter((row) => row.estado_calculado === "gris" || row.estado_calculado === "amarillo").map((row) => pendingDocumentCategoryLabel(row.categoria)).join(", ") || "Ninguno";
    const expiredDocuments = documentStatuses.filter((row) => row.estado_calculado === "rojo").map((row) => pendingDocumentCategoryLabel(row.categoria)).join(", ") || "Ninguno";
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
      "9": expiredDocuments,
    };
    return {
      context,
      templateKey: "weekly_operational_summary" as const,
      deduplicationKey: `weekly_operational_summary:${context.branch.id}:${periodStart}:${periodEnd}`,
      variables,
      fallbackBody: ["📊 Reporte semanal de tu operación", "", `Sede: ${context.branch.name}`, `Restaurante: ${context.company.name}`, "", "────────────", "", `Registros operativos durante el periodo *${period}*:`, "", `🌡️ Temperaturas: ${variables["4"]}`, `🧼 Limpieza y desinfección: ${variables["5"]}`, `💧 Agua potable: ${variables["6"]}`, `📦 Recepción de materias primas: ${variables["7"]}`, "", "────────────", "", "Documentación:", "", "📄 Documentos pendientes:", missingDocuments, "", "⚠️ Documentos vencidos:", expiredDocuments, "", "Revisa los detalles y mantén tu cumplimiento al día: https://quimly.co/login", "", "Equipo Quimly"].join("\n"),
      scopeBranchId: context.branch.id,
      priority: 100,
    };
  });
}

function prepareTrialNotifications(now: Date, today: string, branchesByCompanyId: Map<string, BranchRow[]>, contextsByBranchId: Map<string, NotificationContext>, subscriptions: SubscriptionRow[]) {
  const notifications: PreparedNotification[] = [];
  for (const subscription of subscriptions) {
    if (subscription.status !== "trial" || subscription.plan_type !== "operational") continue;
    const companyBranches = branchesByCompanyId.get(subscription.company_id) ?? [];
    const context = companyBranches.length ? contextsByBranchId.get(companyBranches[0].id) : null;
    if (!context) continue;
    const startDate = localDateKey(new Date(subscription.trial_started_at));
    const endDate = localDateKey(new Date(subscription.trial_ends_at));
    const trialEndsAt = new Date(subscription.trial_ends_at);
    const midpointDate = addDays(startDate, 7);
    const greeting = getRecipientGreetingName(context.recipient.name);

    // A delayed cron run may still send the midpoint reminder, but never after
    // the trial has ended. Once it ends, the only lifecycle message is expiry.
    if (shouldSendTrialMidpoint({ midpointDate, now, today, trialEndsAt })) notifications.push({ context, templateKey: "trial_midpoint", deduplicationKey: `trial_midpoint:${subscription.id}`, variables: { "1": greeting, "2": context.company.name, "4": formatDateForMessage(endDate) }, fallbackBody: ["🚀 Ya estás a mitad de tu prueba", "", `Hola ${greeting},`, "", `Tu restaurante *${context.company.name}* sigue disfrutando de Quimly hasta el *${formatDateForMessage(endDate)}*.`, "", "Este es el mejor momento para completar tus registros y cargar tu documentación, así podrás aprovechar al máximo la plataforma antes de que finalice tu prueba.", "", "Ingresa aquí:", "https://quimly.co/login", "", "¿Necesitas ayuda? Responde este mensaje y te acompañamos.", "", "Equipo Quimly"].join("\n"), scopeBranchId: null, priority: 70 });
    if (shouldSendTrialExpired({ now, trialEndsAt })) notifications.push({ context, templateKey: "trial_expired", deduplicationKey: `trial_expired:${subscription.id}:${endDate}`, variables: { "1": greeting, "2": formatDateForMessage(endDate), "3": context.company.name }, fallbackBody: ["⏳ Tu prueba gratuita finalizó", "", `Hola ${greeting},`, "", `Tu prueba gratuita finalizó el *${formatDateForMessage(endDate)}*.`, "", `Restaurante: ${context.company.name}`, "", "Esperamos que durante estos días hayas descubierto cómo Quimly puede ayudarte a organizar tu documentación y simplificar el seguimiento de tu operación.", "", "Activa tu plan y continúa gestionando tu operación desde Quimly:", "https://quimly.co/login", "", "¿Tienes alguna pregunta? Responde este mensaje y con gusto te ayudaremos.", "", "Equipo Quimly"].join("\n"), scopeBranchId: null, priority: 40 });
  }
  return notifications;
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

type PendingDeliveryRow = ClaimedDelivery & {
  status: "pending" | "processing" | "sent" | "delivered" | "failed";
  deduplication_key: string;
};

const immediateDeliveryFields = "id, company_id, recipient_phone, notification_type, template_key, payload, attempt_count, status, deduplication_key";

async function loadImmediateNotificationContext(companyId: string) {
  const supabase = requiredAdminClient();
  const [companyResult, branchesResult, subscriptionResult] = await Promise.all([
    supabase.from("companies").select("id, name, is_active, company_admin_user_id").eq("id", companyId).eq("is_active", true).maybeSingle<CompanyRow>(),
    supabase.from("branches").select("id, company_id, name, status, is_active").eq("company_id", companyId).neq("status", "deleted").order("name", { ascending: true }).returns<BranchRow[]>(),
    supabase.from("company_subscriptions").select("id, company_id, status, plan_type, trial_started_at, trial_ends_at").eq("company_id", companyId).maybeSingle<SubscriptionRow>(),
  ]);

  const firstError = companyResult.error ?? branchesResult.error ?? subscriptionResult.error;
  if (firstError) {
    throw new Error(`No fue posible preparar la notificación inmediata: ${firstError.message}`);
  }

  const company = companyResult.data;
  const companyBranches = branchesResult.data ?? [];
  const subscription = subscriptionResult.data;
  const primaryBranch = companyBranches.find((branch) => branch.status === "active" && branch.is_active) ?? companyBranches[0];

  if (!company || !subscription || !primaryBranch || !company.company_admin_user_id) {
    throw new Error("La empresa no tiene la información necesaria para enviar una notificación inmediata.");
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("user_id, full_name, phone, phone_verified, is_active")
    .eq("user_id", company.company_admin_user_id)
    .maybeSingle<ProfileRow>();

  if (profileError) {
    throw new Error(`No fue posible consultar el destinatario: ${profileError.message}`);
  }

  const context = profile ? createNotificationContext(primaryBranch, new Map([[company.id, company]]), new Map([[profile.user_id, profile]])) : null;
  if (!context) {
    throw new Error("La empresa no tiene un número de WhatsApp verificado y válido para la notificación inmediata.");
  }

  return { context, companyBranches, subscription };
}

async function dispatchImmediateNotification(notification: PreparedNotification) {
  const supabase = requiredAdminClient();
  const result: ScheduledWhatsAppNotificationRunResult = { enqueued: 0, attempted: 0, accepted: 0, retryScheduled: 0, skipped: 0, failed: 0 };
  const now = new Date().toISOString();
  const payload: StoredDeliveryPayload = {
    variables: notification.variables,
    fallbackBody: notification.fallbackBody,
    telegram: makeTelegramContext(notification.context),
  };
  const deliveryValues = {
    company_id: notification.context.company.id,
    branch_id: notification.scopeBranchId,
    recipient_user_id: notification.context.recipient.userId,
    recipient_phone: notification.context.recipient.phone,
    notification_type: notification.templateKey,
    template_key: notification.templateKey,
    deduplication_key: notification.deduplicationKey,
    payload,
    status: "pending",
    scheduled_for: now,
    next_attempt_at: now,
  };
  const { data: insertedDelivery, error: insertError } = await supabase
    .from("whatsapp_notification_deliveries")
    .upsert(deliveryValues, { onConflict: "deduplication_key", ignoreDuplicates: true })
    .select(immediateDeliveryFields)
    .maybeSingle<PendingDeliveryRow>();

  if (insertError) {
    throw new Error(`No fue posible encolar la notificación inmediata: ${insertError.message}`);
  }

  const { data: existingDelivery, error: existingError } = insertedDelivery
    ? { data: insertedDelivery, error: null }
    : await supabase
        .from("whatsapp_notification_deliveries")
        .select(immediateDeliveryFields)
        .eq("deduplication_key", notification.deduplicationKey)
        .maybeSingle<PendingDeliveryRow>();

  if (existingError || !existingDelivery) {
    throw new Error(existingError?.message ?? "No fue posible recuperar la notificación inmediata.");
  }

  if (!insertedDelivery) {
    result.skipped += 1;
  } else {
    result.enqueued += 1;
  }

  if (existingDelivery.status !== "pending") {
    return result;
  }

  const { data: claimedDelivery, error: claimError } = await supabase
    .from("whatsapp_notification_deliveries")
    .update({
      status: "processing",
      attempt_count: existingDelivery.attempt_count + 1,
      last_attempt_at: now,
      processing_started_at: now,
      error_message: null,
    })
    .eq("id", existingDelivery.id)
    .eq("status", "pending")
    .eq("attempt_count", existingDelivery.attempt_count)
    .select("id, company_id, recipient_phone, notification_type, template_key, payload, attempt_count")
    .maybeSingle<ClaimedDelivery>();

  if (claimError) {
    throw new Error(`No fue posible reclamar la notificación inmediata: ${claimError.message}`);
  }

  if (claimedDelivery) {
    await dispatchClaimedDelivery(claimedDelivery, result);
  }

  return result;
}

export async function sendTrialWelcomeWhatsAppImmediately({ companyId }: { companyId: string }) {
  const { context, subscription } = await loadImmediateNotificationContext(companyId);
  if (subscription.status !== "trial") {
    return null;
  }

  return dispatchImmediateNotification(buildTrialWelcomeNotification(subscription, context));
}

export async function sendFounderBenefitWhatsAppImmediately({ companyId }: { companyId: string }) {
  const { context } = await loadImmediateNotificationContext(companyId);
  const { data: assignment, error } = await requiredAdminClient()
    .from("subscription_status_history")
    .select("company_id, occurred_at")
    .eq("company_id", companyId)
    .eq("reason", "founder_assigned")
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle<FounderAssignmentRow>();

  if (error || !assignment) {
    throw new Error(error?.message ?? "No fue posible encontrar la asignación Founder recién creada.");
  }

  return dispatchImmediateNotification(buildFounderBenefitNotification(assignment.occurred_at, context));
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

async function cancelObsoleteDelivery(delivery: ClaimedDelivery, errorMessage: string, result: ScheduledWhatsAppNotificationRunResult) {
  const { error } = await requiredAdminClient()
    .from("whatsapp_notification_deliveries")
    .update({
      status: "failed",
      next_attempt_at: new Date().toISOString(),
      processing_started_at: null,
      twilio_status: "failed",
      error_message: errorMessage,
    })
    .eq("id", delivery.id);

  if (error) throw new Error(`No fue posible cancelar la entrega obsoleta de WhatsApp: ${error.message}`);

  result.skipped += 1;
  logServerInfo("whatsapp.scheduled_notification_cancelled_as_obsolete", {
    deliveryId: delivery.id,
    notificationType: delivery.notification_type,
    attemptCount: delivery.attempt_count,
  });
}

async function isQueuedTrialNotificationStillRelevant(delivery: ClaimedDelivery, now: Date) {
  const { data: subscription, error } = await requiredAdminClient()
    .from("company_subscriptions")
    .select("status, plan_type, trial_ends_at")
    .eq("company_id", delivery.company_id)
    .maybeSingle<Pick<SubscriptionRow, "status" | "plan_type" | "trial_ends_at">>();

  if (error) throw new Error(`No fue posible validar la vigencia de la prueba antes del reintento: ${error.message}`);
  if (!subscription) return false;

  const input = {
    now,
    subscriptionStatus: subscription.status,
    planType: subscription.plan_type,
    trialEndsAt: new Date(subscription.trial_ends_at),
  };
  return delivery.notification_type === "trial_midpoint"
    ? shouldDispatchQueuedTrialMidpoint(input)
    : shouldDispatchQueuedTrialExpired(input);
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

  if (delivery.notification_type === "trial_midpoint" || delivery.notification_type === "trial_expired") {
    try {
      const stillValid = await isQueuedTrialNotificationStillRelevant(delivery, new Date());
      if (!stillValid) {
        const description = delivery.notification_type === "trial_midpoint"
          ? "La prueba ya no está vigente; se canceló el recordatorio de mitad de prueba."
          : "La suscripción ya no está en prueba gratuita; se canceló el aviso de prueba finalizada.";
        await cancelObsoleteDelivery(delivery, description, result);
        return;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "No fue posible validar la vigencia de la prueba antes del envío.";
      await scheduleRetryOrFail(delivery, errorMessage, result);
      logServerError("whatsapp.scheduled_notification_trial_validity_check_failed", error, {
        deliveryId: delivery.id,
        attemptCount: delivery.attempt_count,
      });
      return;
    }
  }

  result.attempted += 1;
  let message: Awaited<ReturnType<typeof sendWhatsAppTemplate>>;
  try {
    message = await sendWhatsAppTemplate({ to: delivery.recipient_phone, templateKey: delivery.template_key, variables: payload.variables, statusCallback: getTwilioWhatsAppStatusCallbackUrl() });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Twilio no pudo aceptar el mensaje automático.";
    try {
      await recordFailedAutomatedWhatsAppTemplateMessage({
        to: delivery.recipient_phone,
        fallbackBody: payload.fallbackBody,
        origin: delivery.notification_type,
        error,
        notificationAttempt: delivery.attempt_count,
        notificationMaxAttempts: SCHEDULED_WHATSAPP_MAX_ATTEMPTS,
      });
    } catch (persistenceError) {
      logServerError("whatsapp.scheduled_notification_failure_inbox_persistence_failed", persistenceError, { deliveryId: delivery.id });
    }
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
    const inboxMessage = await recordAutomatedWhatsAppTemplateMessage({ to: delivery.recipient_phone, message, fallbackBody: payload.fallbackBody, origin: delivery.notification_type, notificationAttempt: delivery.attempt_count, notificationMaxAttempts: SCHEDULED_WHATSAPP_MAX_ATTEMPTS });
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
  if (!hasReachedNotificationStart(now)) {
    // Welcome and Founder messages are sent immediately. If Twilio is briefly
    // unavailable, their retry must not wait for the next 8:00 a. m. run.
    // New scheduled reminders are still generated only after 8:00 a. m.
    await dispatchDueDeliveries(result);
    logServerInfo("whatsapp.immediate_notification_retries_completed", { ...result });
    return result;
  }
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
  ])).flat();
  notifications.push(...prepareTrialNotifications(now, today, branchesByCompanyId, allContextsByBranchId, data.subscriptions));
  await enqueueNotifications(notifications, now, today, result);
  await dispatchDueDeliveries(result);
  logServerInfo("whatsapp.scheduled_notifications_completed", { today, ...result });
  return result;
}
