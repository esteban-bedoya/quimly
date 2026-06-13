import { notFound } from "next/navigation";
import { cache } from "react";

import { OperationalPublicForm } from "@/components/public-forms/operational-public-form";
import { getCurrentUserContext } from "@/lib/auth/user-context";
import { isOperationalFormType, operationalFormLabels, type OperationalFormType } from "@/lib/operational-forms";
import { getRecentWindowStartDate } from "@/lib/operational-record-dates";
import { logServerError } from "@/lib/server/logging";
import { getSupabasePublicClient } from "@/lib/supabase/public";
import { getSupabaseRlsClient } from "@/lib/supabase/rls-server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { BranchRefrigerationEquipmentType } from "@/types/auth";

export const dynamic = "force-dynamic";

type PublicOperationalFormPayload = {
  form_type: string;
  branch_name: string;
  company_name: string;
  equipment: CatalogRow[] | null;
  sanitation_areas: CatalogRow[] | null;
};

type CatalogRow = {
  id: string;
  name: string;
  equipmentType?: BranchRefrigerationEquipmentType | null;
  equipment_type?: BranchRefrigerationEquipmentType | null;
};

type PublicQrBranchRow = {
  branch_id: string;
};

type AdminAccessibleQrRow = {
  id: string;
};

type RefrigerationEquipmentRow = {
  id: string;
  name: string;
  equipment_type: BranchRefrigerationEquipmentType;
};

type OperationalRecordDateRow = {
  fecha_hora_servidor: string;
};

const operationalRecordTables: Record<OperationalFormType, string> = {
  thermal_control: "thermal_control_records",
  area_sanitation: "area_sanitation_records",
  supply_reception: "supply_reception_records",
  water_quality: "water_quality_records",
};

function formatDateKeyInTimeZone(value: string, timeZone = "America/Bogota") {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return year && month && day ? `${year}-${month}-${day}` : null;
}

const loadPublicOperationalFormPayload = cache(async (token: string) => {
  const supabase = getSupabasePublicClient();

  if (!supabase) {
    return {
      payload: null,
      error: new Error("Supabase public client is not configured."),
    };
  }

  const { data, error } = await supabase.rpc("get_public_operational_form", {
    p_token: token,
  });

  return {
    payload: data as PublicOperationalFormPayload | null,
    error,
  };
});

function getPublicFormBrowserTitle(formType: string | undefined) {
  return formType && isOperationalFormType(formType)
    ? operationalFormLabels[formType].title
    : "Quimly";
}

async function loadThermalEquipmentFromBranch(token: string, fallbackEquipment: CatalogRow[]) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return fallbackEquipment;
  }

  const { data: qrRow, error: qrError } = await supabase
    .from("branch_form_qr_codes")
    .select("branch_id")
    .eq("token", token)
    .eq("is_active", true)
    .maybeSingle<PublicQrBranchRow>();

  if (qrError) {
    logServerError("public_form.page.qr_branch_lookup_failed", qrError, { tokenLength: token.length });
    return fallbackEquipment;
  }

  if (!qrRow?.branch_id) {
    return fallbackEquipment;
  }

  const { data, error } = await supabase
    .from("branch_refrigeration_equipment")
    .select("id, name, equipment_type")
    .eq("branch_id", qrRow.branch_id)
    .eq("status", "active")
    .order("name", { ascending: true })
    .returns<RefrigerationEquipmentRow[]>();

  if (error) {
    logServerError("public_form.page.thermal_equipment_lookup_failed", error, {
      branchId: qrRow.branch_id,
      tokenLength: token.length,
    });
    return fallbackEquipment;
  }

  return (
    data?.map((item) => ({
      id: item.id,
      name: item.name,
      equipment_type: item.equipment_type,
      equipmentType: item.equipment_type,
    })) ?? fallbackEquipment
  );
}

async function loadCompletedRecordDateKeys(token: string, formType: OperationalFormType) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return [];
  }

  const tableName = operationalRecordTables[formType];
  const sinceDate = getRecentWindowStartDate(30);
  const { data, error } = await supabase
    .from(tableName)
    .select("fecha_hora_servidor")
    .eq("token_qr_utilizado", token)
    .gte("fecha_hora_servidor", sinceDate.toISOString())
    .order("fecha_hora_servidor", { ascending: false })
    .returns<OperationalRecordDateRow[]>();

  if (error) {
    logServerError("public_form.page.completed_dates_lookup_failed", error, {
      formType,
      tokenLength: token.length,
    });
    return [];
  }

  const completedDateKeys = new Set<string>();

  for (const row of data ?? []) {
    const dateKey = formatDateKeyInTimeZone(row.fecha_hora_servidor);

    if (dateKey) {
      completedDateKeys.add(dateKey);
    }
  }

  return Array.from(completedDateKeys);
}

function getAdminDisplayName(fullName: string | null, email: string) {
  return (fullName?.trim() || email).toLocaleUpperCase("es-CO");
}

function isDashboardAdminLaunch(source: string | string[] | undefined, admin: string | string[] | undefined) {
  return source === "dashboard" && admin === "1";
}

async function loadOperationalFormAdminContext({
  admin,
  source,
  token,
}: {
  admin: string | string[] | undefined;
  source: string | string[] | undefined;
  token: string;
}) {
  if (!isDashboardAdminLaunch(source, admin)) {
    return null;
  }

  const userContext = await getCurrentUserContext();

  if (userContext?.profile.globalRole !== "company_admin") {
    return null;
  }

  const supabase = await getSupabaseRlsClient();

  if (!supabase) {
    return null;
  }

  const { data: qrRow, error: qrError } = await supabase
    .from("branch_form_qr_codes")
    .select("id")
    .eq("token", token)
    .eq("is_active", true)
    .maybeSingle<AdminAccessibleQrRow>();

  if (qrError) {
    logServerError("public_form.page.admin_qr_lookup_failed", qrError, { tokenLength: token.length });
    return null;
  }

  if (!qrRow?.id) {
    return null;
  }

  return {
    administratorName: getAdminDisplayName(userContext.profile.fullName, userContext.profile.email),
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { payload, error } = await loadPublicOperationalFormPayload(token);

  if (error) {
    logServerError("public_form.metadata.load_failed", error, { tokenLength: token.length });
  }

  return {
    title: getPublicFormBrowserTitle(payload?.form_type),
    robots: { index: false, follow: false },
  };
}

export default async function PublicOperationalFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ admin?: string | string[]; source?: string | string[] }>;
}) {
  const { token } = await params;
  const { admin, source } = await searchParams;
  const { payload, error } = await loadPublicOperationalFormPayload(token);

  if (error) {
    logServerError("public_form.page.load_failed", error, { tokenLength: token.length });
    throw new Error(error.message);
  }

  if (!payload || !isOperationalFormType(payload.form_type)) {
    notFound();
  }

  const equipment =
    payload.form_type === "thermal_control"
      ? await loadThermalEquipmentFromBranch(token, payload.equipment ?? [])
      : payload.equipment ?? [];
  const completedRecordDateKeys = await loadCompletedRecordDateKeys(token, payload.form_type);
  const adminContext = await loadOperationalFormAdminContext({ admin, source, token });

  return (
    <OperationalPublicForm
      token={token}
      formType={payload.form_type}
      branchName={payload.branch_name}
      companyName={payload.company_name}
      equipment={equipment}
      sanitationAreas={payload.sanitation_areas ?? []}
      completedRecordDateKeys={completedRecordDateKeys}
      adminContext={adminContext}
    />
  );
}
