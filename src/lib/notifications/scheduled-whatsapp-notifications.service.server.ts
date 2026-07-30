import "server-only";

import { isE164PhoneNumber, type E164PhoneNumber } from "@/lib/phone";
import { sendWhatsAppTemplate, type WhatsAppTemplateVariables } from "@/lib/notifications/whatsapp-template.service";
import type { ScheduledWhatsAppTemplateKey } from "@/lib/notifications/types";
import { logServerError, logServerInfo } from "@/lib/server/logging";
import { dispatchAutomatedWhatsAppSupportAlert } from "@/lib/support-notifications/dispatch.server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTwilioWhatsAppStatusCallbackUrl, recordAutomatedWhatsAppTemplateMessage } from "@/lib/whatsapp-inbox/service.server";

const COLOMBIA_TIME_ZONE = "America/Bogota";
const documentReminderDays = new Set([30, 15, 7, 1]);

type BranchRow = {
  id: string;
  company_id: string;
  name: string;
  status: "active" | "inactive" | "deleted";
  is_active: boolean;
};

type CompanyRow = {
  id: string;
  name: string;
  is_active: boolean;
  company_admin_user_id: string | null;
};

type ProfileRow = {
  user_id: string;
  full_name: string | null;
  phone: string;
  phone_verified: boolean;
  is_active: boolean;
};

type SubscriptionRow = {
  id: string;
  company_id: string;
  status: "trial" | "active" | "payment_issue" | "suspended" | "cancelled";
  trial_started_at: string;
  trial_ends_at: string;
};

type SanitaryDocumentRow = {
  id: string;
  branch_id: string;
  document_kind: string;
  staff_member_id: string | null;
  expires_at: string | null;
  is_active: boolean;
};

type BranchDocumentRow = {
  id: string;
  branch_id: string;
  title: string;
  expires_at: string | null;
  is_active: boolean;
};

type StaffMemberRow = {
  id: string;
  full_name: string;
};

type DailyFormSummaryRow = {
  sede_id: string;
  formulario_id: "thermal_control" | "area_sanitation" | "supply_reception" | "water_quality";
  fecha: string;
  cantidad_registros: number;
};

type DocumentCategoryRow = {
  sede_id: string;
  categoria: "sanitation_plan" | "chemical_products" | "pest_control" | "water_tank_cleaning" | "acu_final_disposal" | "staff_records";
  estado_calculado: "gris" | "rojo" | "amarillo" | "verde";
};

type FounderAssignmentRow = {
  company_id: string;
  occurred_at: string;
};

type NotificationDeliveryRow = {
  id: string;
};

type NotificationRecipient = {
  userId: string;
  name: string | null;
  phone: E164PhoneNumber;
};

type NotificationContext = {
  company: CompanyRow;
  branch: BranchRow;
  recipient: NotificationRecipient;
};

export type ScheduledWhatsAppNotificationRunResult = {
  attempted: number;
  sent: number;
  skipped: number;
  failed: number;
};

function requiredAdminClient() {
  const client = getSupabaseAdminClient();

  if (!client) {
    throw new Error("Supabase Admin no está configurado para las notificaciones programadas.");
  }

  return client;
}

function getTimeZoneParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone: COLOMBIA_TIME_ZONE,
    weekday: "short",
    year: "numeric",
  }).formatToParts(date).reduce<Record<string, string>>((result, part) => {
    if (part.type !== "literal") {
      result[part.type] = part.value;
    }

    return result;
  }, {});

  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: parts.weekday,
  };
}

function addDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(fromDateKey: string, toDateKey: string) {
  const from = Date.parse(`${fromDateKey}T00:00:00Z`);
  const to = Date.parse(`${toDateKey}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

function localDateKey(date: Date) {
  return getTimeZoneParts(date).dateKey;
}

function formatDateForMessage(dateKey: string) {
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(`${dateKey}T00:00:00Z`));
}

function getFirstEightAmDate(date: Date) {
  const parts = getTimeZoneParts(date);
  return parts.hour < 8 || (parts.hour === 8 && parts.minute === 0) ? parts.dateKey : addDays(parts.dateKey, 1);
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

function weeklyDaysWithRecords(formRows: DailyFormSummaryRow[], formType: DailyFormSummaryRow["formulario_id"]) {
  return formRows.filter((row) => row.formulario_id === formType && row.cantidad_registros > 0).length;
}

function buildWeeklyPeriodLabel(today: string) {
  const periodEnd = addDays(today, -1);
  const periodStart = addDays(periodEnd, -6);
  return `Del ${formatDateForMessage(periodStart)} al ${formatDateForMessage(periodEnd)}`;
}

async function reserveDelivery({
  companyId,
  branchId,
  recipient,
  notificationType,
  templateKey,
  deduplicationKey,
  payload,
}: {
  companyId: string;
  branchId: string | null;
  recipient: NotificationRecipient;
  notificationType: ScheduledWhatsAppTemplateKey;
  templateKey: ScheduledWhatsAppTemplateKey;
  deduplicationKey: string;
  payload: Record<string, unknown>;
}) {
  const supabase = requiredAdminClient();
  const { data, error } = await supabase
    .from("whatsapp_notification_deliveries")
    .upsert(
      {
        company_id: companyId,
        branch_id: branchId,
        recipient_user_id: recipient.userId,
        recipient_phone: recipient.phone,
        notification_type: notificationType,
        template_key: templateKey,
        deduplication_key: deduplicationKey,
        payload,
        status: "pending",
      },
      { onConflict: "deduplication_key", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle<NotificationDeliveryRow>();

  if (error) {
    throw new Error(`No fue posible reservar la notificación: ${error.message}`);
  }

  return data?.id ?? null;
}

async function markDelivery({
  deliveryId,
  status,
  twilioMessageSid = null,
  twilioStatus = null,
  whatsappMessageId = null,
  errorMessage = null,
}: {
  deliveryId: string;
  status: "sent" | "failed";
  twilioMessageSid?: string | null;
  twilioStatus?: string | null;
  whatsappMessageId?: string | null;
  errorMessage?: string | null;
}) {
  const { error } = await requiredAdminClient()
    .from("whatsapp_notification_deliveries")
    .update({
      status,
      twilio_message_sid: twilioMessageSid,
      twilio_status: twilioStatus,
      whatsapp_message_id: whatsappMessageId,
      error_message: errorMessage?.slice(0, 1_000) ?? null,
      sent_at: status === "sent" ? new Date().toISOString() : null,
    })
    .eq("id", deliveryId);

  if (error) {
    throw new Error(`No fue posible actualizar la notificación: ${error.message}`);
  }
}

async function sendScheduledNotification({
  context,
  templateKey,
  deduplicationKey,
  variables,
  fallbackBody,
  scopeBranchId,
  result,
}: {
  context: NotificationContext;
  templateKey: ScheduledWhatsAppTemplateKey;
  deduplicationKey: string;
  variables: WhatsAppTemplateVariables;
  fallbackBody: string;
  scopeBranchId: string | null;
  result: ScheduledWhatsAppNotificationRunResult;
}) {
  const deliveryId = await reserveDelivery({
    companyId: context.company.id,
    branchId: scopeBranchId,
    recipient: context.recipient,
    notificationType: templateKey,
    templateKey,
    deduplicationKey,
    payload: { variables, fallbackBody },
  });

  if (!deliveryId) {
    result.skipped += 1;
    return;
  }

  result.attempted += 1;

  try {
    const message = await sendWhatsAppTemplate({
      to: context.recipient.phone,
      templateKey,
      variables,
      statusCallback: getTwilioWhatsAppStatusCallbackUrl(),
    });
    const inboxMessage = await recordAutomatedWhatsAppTemplateMessage({
      to: context.recipient.phone,
      message,
      fallbackBody,
    });

    await markDelivery({
      deliveryId,
      status: "sent",
      twilioMessageSid: message.sid,
      twilioStatus: message.status ?? "queued",
      whatsappMessageId: inboxMessage.messageId,
    });
    await dispatchAutomatedWhatsAppSupportAlert({
      notificationType: templateKey,
      recipientName: context.recipient.name,
      recipientPhone: context.recipient.phone,
      restaurantName: context.company.name,
      branchName: context.branch.name,
      body: fallbackBody,
      status: "sent",
    });
    result.sent += 1;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Twilio no pudo enviar el mensaje automático.";

    try {
      await markDelivery({ deliveryId, status: "failed", errorMessage });
    } catch (persistenceError) {
      logServerError("whatsapp.notification_delivery_failure_persistence_failed", persistenceError, {
        deliveryId,
        notificationType: templateKey,
      });
    }

    await dispatchAutomatedWhatsAppSupportAlert({
      notificationType: templateKey,
      recipientName: context.recipient.name,
      recipientPhone: context.recipient.phone,
      restaurantName: context.company.name,
      branchName: context.branch.name,
      body: fallbackBody,
      status: "failed",
      errorMessage,
    });
    result.failed += 1;
    logServerError("whatsapp.scheduled_notification_failed", error, {
      deliveryId,
      notificationType: templateKey,
      companyId: context.company.id,
      branchId: scopeBranchId,
    });
  }
}

async function loadNotificationData() {
  const supabase = requiredAdminClient();
  const { data: branches, error: branchesError } = await supabase
    .from("branches")
    .select("id, company_id, name, status, is_active")
    .neq("status", "deleted")
    .returns<BranchRow[]>();

  if (branchesError) {
    throw new Error(`No fue posible consultar las sedes activas: ${branchesError.message}`);
  }

  const allBranches = branches ?? [];
  const activeBranches = allBranches.filter((branch) => branch.status === "active" && branch.is_active);
  const companyIds = [...new Set(allBranches.map((branch) => branch.company_id))];

  if (companyIds.length === 0) {
    return {
      allBranches,
      activeBranches,
      companies: [] as CompanyRow[],
      profiles: [] as ProfileRow[],
      subscriptions: [] as SubscriptionRow[],
    };
  }

  const { data: companies, error: companiesError } = await supabase
    .from("companies")
    .select("id, name, is_active, company_admin_user_id")
    .in("id", companyIds)
    .eq("is_active", true)
    .returns<CompanyRow[]>();

  if (companiesError) {
    throw new Error(`No fue posible consultar los restaurantes: ${companiesError.message}`);
  }

  const companyRows = companies ?? [];
  const adminUserIds = companyRows.flatMap((company) => (company.company_admin_user_id ? [company.company_admin_user_id] : []));
  const [profilesResult, subscriptionsResult] = await Promise.all([
    adminUserIds.length > 0
      ? supabase
          .from("user_profiles")
          .select("user_id, full_name, phone, phone_verified, is_active")
          .in("user_id", adminUserIds)
          .returns<ProfileRow[]>()
      : Promise.resolve({ data: [] as ProfileRow[], error: null }),
    supabase
      .from("company_subscriptions")
      .select("id, company_id, status, trial_started_at, trial_ends_at")
      .in("company_id", companyIds)
      .returns<SubscriptionRow[]>(),
  ]);

  if (profilesResult.error || subscriptionsResult.error) {
    throw new Error(`No fue posible consultar los destinatarios o pruebas: ${(profilesResult.error ?? subscriptionsResult.error)?.message}`);
  }

  return {
    allBranches,
    activeBranches,
    companies: companyRows,
    profiles: profilesResult.data ?? [],
    subscriptions: subscriptionsResult.data ?? [],
  };
}

function createNotificationContext({
  branch,
  companiesById,
  profilesByUserId,
}: {
  branch: BranchRow;
  companiesById: Map<string, CompanyRow>;
  profilesByUserId: Map<string, ProfileRow>;
}): NotificationContext | null {
  const company = companiesById.get(branch.company_id);
  const profile = company?.company_admin_user_id ? profilesByUserId.get(company.company_admin_user_id) : null;

  if (!company || !profile || !profile.is_active || !profile.phone_verified || !isE164PhoneNumber(profile.phone)) {
    return null;
  }

  return {
    company,
    branch,
    recipient: { userId: profile.user_id, name: profile.full_name, phone: profile.phone },
  };
}

async function sendDocumentExpiryNotifications({
  today,
  contextsByBranchId,
  result,
}: {
  today: string;
  contextsByBranchId: Map<string, NotificationContext>;
  result: ScheduledWhatsAppNotificationRunResult;
}) {
  const supabase = requiredAdminClient();
  const [{ data: sanitaryDocuments, error: sanitaryError }, { data: branchDocuments, error: branchDocumentsError }, { data: staffMembers, error: staffError }] = await Promise.all([
    supabase
      .from("branch_sanitary_document_files")
      .select("id, branch_id, document_kind, staff_member_id, expires_at, is_active")
      .eq("is_active", true)
      .not("expires_at", "is", null)
      .returns<SanitaryDocumentRow[]>(),
    supabase
      .from("branch_documents")
      .select("id, branch_id, title, expires_at, is_active")
      .eq("is_active", true)
      .not("expires_at", "is", null)
      .returns<BranchDocumentRow[]>(),
    supabase.from("branch_staff_members").select("id, full_name").returns<StaffMemberRow[]>(),
  ]);

  if (sanitaryError || branchDocumentsError || staffError) {
    throw new Error(`No fue posible consultar documentos próximos a vencer: ${(sanitaryError ?? branchDocumentsError ?? staffError)?.message}`);
  }

  const staffNameById = new Map((staffMembers ?? []).map((staff) => [staff.id, staff.full_name]));
  const candidates = [
    ...(sanitaryDocuments ?? []).flatMap((document) =>
      document.expires_at
        ? [{ id: document.id, branchId: document.branch_id, title: documentDisplayName(document.document_kind, document.staff_member_id ? staffNameById.get(document.staff_member_id) ?? null : null), expiresAt: document.expires_at }]
        : [],
    ),
    ...(branchDocuments ?? []).flatMap((document) =>
      document.expires_at ? [{ id: document.id, branchId: document.branch_id, title: document.title, expiresAt: document.expires_at }] : [],
    ),
  ];

  for (const document of candidates) {
    const daysRemaining = daysBetween(today, document.expiresAt);

    if (!documentReminderDays.has(daysRemaining)) {
      continue;
    }

    const context = contextsByBranchId.get(document.branchId);

    if (!context) {
      continue;
    }

    const deadline = formatDateForMessage(document.expiresAt);
    const variables = {
      "1": context.company.name,
      "2": context.branch.name,
      "3": document.title,
      "4": `${daysRemaining} ${daysRemaining === 1 ? "día" : "días"}`,
      "5": deadline,
    };
    const fallbackBody = [
      "Quimly",
      "",
      `Restaurante: ${context.company.name}`,
      `Sede: ${context.branch.name}`,
      "",
      `El documento ${document.title} vence en ${daysRemaining} ${daysRemaining === 1 ? "día" : "días"}, el ${deadline}.`,
      "",
      "Revísalo y actualízalo en Quimly antes de esa fecha.",
    ].join("\n");

    await sendScheduledNotification({
      context,
      templateKey: "document_expiry_reminder",
      deduplicationKey: `document_expiry_reminder:${document.id}:${daysRemaining}:${document.expiresAt}`,
      variables,
      fallbackBody,
      scopeBranchId: context.branch.id,
      result,
    });
  }
}

async function sendWeeklyOperationalSummaries({
  today,
  contextsByBranchId,
  result,
}: {
  today: string;
  contextsByBranchId: Map<string, NotificationContext>;
  result: ScheduledWhatsAppNotificationRunResult;
}) {
  if (getTimeZoneParts(new Date(`${today}T12:00:00Z`)).weekday !== "Mon") {
    return;
  }

  const supabase = requiredAdminClient();
  const periodEnd = addDays(today, -1);
  const periodStart = addDays(periodEnd, -6);
  const branchIds = [...contextsByBranchId.keys()];

  if (branchIds.length === 0) {
    return;
  }

  const [formSummaryResult, documentCategoriesResult] = await Promise.all([
    supabase
      .from("resumen_diario_formularios")
      .select("sede_id, formulario_id, fecha, cantidad_registros")
      .in("sede_id", branchIds)
      .gte("fecha", periodStart)
      .lte("fecha", periodEnd)
      .returns<DailyFormSummaryRow[]>(),
    supabase
      .from("sedes_categorias_documentos")
      .select("sede_id, categoria, estado_calculado")
      .in("sede_id", branchIds)
      .eq("estado_calculado", "gris")
      .returns<DocumentCategoryRow[]>(),
  ]);

  if (formSummaryResult.error || documentCategoriesResult.error) {
    throw new Error(`No fue posible preparar el resumen semanal: ${(formSummaryResult.error ?? documentCategoriesResult.error)?.message}`);
  }

  const summariesByBranchId = new Map<string, DailyFormSummaryRow[]>();
  for (const row of formSummaryResult.data ?? []) {
    summariesByBranchId.set(row.sede_id, [...(summariesByBranchId.get(row.sede_id) ?? []), row]);
  }
  const missingCategoriesByBranchId = new Map<string, DocumentCategoryRow[]>();
  for (const row of documentCategoriesResult.data ?? []) {
    missingCategoriesByBranchId.set(row.sede_id, [...(missingCategoriesByBranchId.get(row.sede_id) ?? []), row]);
  }

  for (const context of contextsByBranchId.values()) {
    const formRows = summariesByBranchId.get(context.branch.id) ?? [];
    const missingDocuments = (missingCategoriesByBranchId.get(context.branch.id) ?? [])
      .map((row) => pendingDocumentCategoryLabel(row.categoria))
      .join(", ") || "Ninguno";
    const thermalDays = weeklyDaysWithRecords(formRows, "thermal_control");
    const sanitationDays = weeklyDaysWithRecords(formRows, "area_sanitation");
    const waterDays = weeklyDaysWithRecords(formRows, "water_quality");
    const receptionRecords = formRows
      .filter((row) => row.formulario_id === "supply_reception")
      .reduce((total, row) => total + row.cantidad_registros, 0);
    const period = buildWeeklyPeriodLabel(today);
    const variables = {
      "1": context.company.name,
      "2": context.branch.name,
      "3": period,
      "4": `${thermalDays} días con registros`,
      "5": `${sanitationDays} días con registros`,
      "6": `${waterDays} días con registros`,
      "7": `${receptionRecords} ${receptionRecords === 1 ? "registro" : "registros"}`,
      "8": missingDocuments,
    };
    const fallbackBody = [
      "Quimly",
      "",
      `Restaurante: ${context.company.name}`,
      `Sede: ${context.branch.name}`,
      `Periodo: ${period}`,
      "",
      `Temperaturas: ${variables["4"]}`,
      `Limpieza y desinfección: ${variables["5"]}`,
      `Agua potable: ${variables["6"]}`,
      `Recepción de materias primas: ${variables["7"]}`,
      `Documentos sin cargar: ${missingDocuments}`,
      "",
      "Consulta el detalle en Quimly.",
    ].join("\n");

    await sendScheduledNotification({
      context,
      templateKey: "weekly_operational_summary",
      deduplicationKey: `weekly_operational_summary:${context.branch.id}:${periodStart}:${periodEnd}`,
      variables,
      fallbackBody,
      scopeBranchId: context.branch.id,
      result,
    });
  }
}

async function sendTrialNotifications({
  now,
  today,
  branchesByCompanyId,
  contextsByBranchId,
  subscriptions,
  result,
}: {
  now: Date;
  today: string;
  branchesByCompanyId: Map<string, BranchRow[]>;
  contextsByBranchId: Map<string, NotificationContext>;
  subscriptions: SubscriptionRow[];
  result: ScheduledWhatsAppNotificationRunResult;
}) {
  for (const subscription of subscriptions) {
    if (subscription.status !== "trial") {
      continue;
    }

    const companyBranches = branchesByCompanyId.get(subscription.company_id) ?? [];
    const representativeBranch = companyBranches[0];
    const context = representativeBranch ? contextsByBranchId.get(representativeBranch.id) : null;

    if (!context) {
      continue;
    }

    const branchScope = getBranchScopeName(companyBranches);
    const startDate = localDateKey(new Date(subscription.trial_started_at));
    const endDate = localDateKey(new Date(subscription.trial_ends_at));
    const welcomeDate = getFirstEightAmDate(new Date(subscription.trial_started_at));
    const midpointDate = addDays(startDate, 7);
    const expiryMessageDate = addDays(endDate, 1);

    if (today === welcomeDate) {
      const variables = {
        "1": getRecipientGreetingName(context.recipient.name),
        "2": context.company.name,
        "3": branchScope,
        "4": formatDateForMessage(endDate),
      };
      const fallbackBody = [
        "Quimly",
        "",
        `Hola, ${getRecipientGreetingName(context.recipient.name)}.`,
        "",
        "Te damos la bienvenida a Quimly.",
        "",
        `Restaurante: ${context.company.name}`,
        `Sede: ${branchScope}`,
        "",
        `Tu prueba gratuita está activa hasta el ${variables["4"]}. Aprovecha la gestión documental y los formularios operativos para conocer Quimly.`,
        "",
        "Si necesitas ayuda en cualquier momento, responde este mensaje.",
      ].join("\n");

      await sendScheduledNotification({
        context,
        templateKey: "trial_welcome",
        deduplicationKey: `trial_welcome:${subscription.id}`,
        variables,
        fallbackBody,
        scopeBranchId: null,
        result,
      });
    }

    if (today === midpointDate) {
      const variables = {
        "1": getRecipientGreetingName(context.recipient.name),
        "2": context.company.name,
        "3": branchScope,
        "4": formatDateForMessage(endDate),
      };
      const fallbackBody = [
        "Quimly",
        "",
        `Hola, ${getRecipientGreetingName(context.recipient.name)}.`,
        "",
        "Ya transcurrió la mitad de tu prueba gratuita.",
        "",
        `Restaurante: ${context.company.name}`,
        `Sede: ${branchScope}`,
        "",
        `Te recomendamos registrar formularios y cargar tus documentos para aprovechar Quimly antes del ${variables["4"]}.`,
        "",
        "Si necesitas ayuda en cualquier momento, responde este mensaje.",
      ].join("\n");

      await sendScheduledNotification({
        context,
        templateKey: "trial_midpoint",
        deduplicationKey: `trial_midpoint:${subscription.id}`,
        variables,
        fallbackBody,
        scopeBranchId: null,
        result,
      });
    }

    if (today === expiryMessageDate && new Date(subscription.trial_ends_at).getTime() < now.getTime()) {
      const variables = {
        "1": getRecipientGreetingName(context.recipient.name),
        "2": formatDateForMessage(endDate),
        "3": context.company.name,
        "4": branchScope,
      };
      const fallbackBody = [
        "Quimly",
        "",
        `Hola, ${getRecipientGreetingName(context.recipient.name)}.`,
        "",
        `Tu prueba gratuita finalizó el ${variables["2"]}.`,
        "",
        `Restaurante: ${context.company.name}`,
        `Sede: ${branchScope}`,
        "",
        "Esperamos que Quimly haya sido útil para tu operación. Puedes suscribirte para continuar usando la plataforma.",
        "",
        "Si necesitas ayuda o quieres conocer las opciones disponibles, responde este mensaje.",
      ].join("\n");

      await sendScheduledNotification({
        context,
        templateKey: "trial_expired",
        deduplicationKey: `trial_expired:${subscription.id}:${endDate}`,
        variables,
        fallbackBody,
        scopeBranchId: null,
        result,
      });
    }
  }
}

async function sendFounderBenefitNotifications({
  today,
  branchesByCompanyId,
  contextsByBranchId,
  result,
}: {
  today: string;
  branchesByCompanyId: Map<string, BranchRow[]>;
  contextsByBranchId: Map<string, NotificationContext>;
  result: ScheduledWhatsAppNotificationRunResult;
}) {
  const { data: assignments, error } = await requiredAdminClient()
    .from("subscription_status_history")
    .select("company_id, occurred_at")
    .eq("reason", "founder_assigned")
    .returns<FounderAssignmentRow[]>();

  if (error) {
    throw new Error(`No fue posible consultar las asignaciones Founder: ${error.message}`);
  }

  for (const assignment of assignments ?? []) {
    if (getFirstEightAmDate(new Date(assignment.occurred_at)) !== today) {
      continue;
    }

    const companyBranches = branchesByCompanyId.get(assignment.company_id) ?? [];
    const representativeBranch = companyBranches[0];
    const context = representativeBranch ? contextsByBranchId.get(representativeBranch.id) : null;

    if (!context) {
      continue;
    }

    const branchScope = getBranchScopeName(companyBranches);
    const variables = {
      "1": getRecipientGreetingName(context.recipient.name),
      "2": context.company.name,
      "3": branchScope,
    };
    const fallbackBody = [
      "Quimly",
      "",
      `Hola, ${getRecipientGreetingName(context.recipient.name)}.`,
      "",
      "Tu beneficio Founder fue activado.",
      "",
      `Restaurante: ${context.company.name}`,
      `Sede: ${branchScope}`,
      "",
      "Ahora cuentas con las condiciones especiales asociadas a Founder. Puedes revisar el detalle de tu plan en Quimly.",
      "",
      "Si necesitas ayuda en cualquier momento, responde este mensaje.",
    ].join("\n");

    await sendScheduledNotification({
      context,
      templateKey: "founder_benefit_assigned",
      deduplicationKey: `founder_benefit_assigned:${assignment.company_id}:${assignment.occurred_at}`,
      variables,
      fallbackBody,
      scopeBranchId: null,
      result,
    });
  }
}

export async function runScheduledWhatsAppNotifications(now = new Date()): Promise<ScheduledWhatsAppNotificationRunResult> {
  const result: ScheduledWhatsAppNotificationRunResult = { attempted: 0, sent: 0, skipped: 0, failed: 0 };
  const today = localDateKey(now);
  const data = await loadNotificationData();
  const companiesById = new Map(data.companies.map((company) => [company.id, company]));
  const profilesByUserId = new Map(data.profiles.map((profile) => [profile.user_id, profile]));
  const allContextsByBranchId = new Map(
    data.allBranches.flatMap((branch) => {
      const context = createNotificationContext({ branch, companiesById, profilesByUserId });
      return context ? [[branch.id, context] as const] : [];
    }),
  );
  const activeContextsByBranchId = new Map(
    data.activeBranches.flatMap((branch) => {
      const context = allContextsByBranchId.get(branch.id);
      return context ? [[branch.id, context] as const] : [];
    }),
  );
  const branchesByCompanyId = new Map<string, BranchRow[]>();

  for (const branch of data.allBranches) {
    branchesByCompanyId.set(branch.company_id, [...(branchesByCompanyId.get(branch.company_id) ?? []), branch]);
  }

  await sendDocumentExpiryNotifications({ today, contextsByBranchId: activeContextsByBranchId, result });
  await sendWeeklyOperationalSummaries({ today, contextsByBranchId: activeContextsByBranchId, result });
  await sendTrialNotifications({
    now,
    today,
    branchesByCompanyId,
    contextsByBranchId: allContextsByBranchId,
    subscriptions: data.subscriptions,
    result,
  });
  await sendFounderBenefitNotifications({ today, branchesByCompanyId, contextsByBranchId: allContextsByBranchId, result });

  logServerInfo("whatsapp.scheduled_notifications_completed", { today, ...result });
  return result;
}
