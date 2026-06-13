"use server";

import { logServerError, logServerInfo } from "@/lib/server/logging";
import { readSessionTokens } from "@/lib/auth/session";
import { getCurrentUserContext } from "@/lib/auth/user-context";
import { getSupabaseAuthClient } from "@/lib/supabase/auth";
import { getSupabasePublicClient } from "@/lib/supabase/public";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type PublicFormState = {
  error?: string;
  success?: string;
};

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(formData: FormData, key: string) {
  const value = readString(formData, key);

  if (!value) {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function readUuidOrNull(formData: FormData, key: string) {
  const value = readString(formData, key);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function readBooleanOrNull(formData: FormData, key: string) {
  const value = readString(formData, key);

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return null;
}

type PublicQrCompanyRow = {
  company_id: string;
};

type CompanyAdminRow = {
  company_admin_user_id: string | null;
};

type AdminSubmissionContext = {
  accessToken: string;
  maxPastDays: 30;
};

function readRecordedAt(formData: FormData, maxPastDays: number) {
  const value = readString(formData, "recordedAt");

  if (!value) {
    return { recordedAt: null };
  }

  const recordedAt = new Date(value);

  if (Number.isNaN(recordedAt.getTime())) {
    return { error: "La fecha del registro no es válida." };
  }

  const now = new Date();
  const minDate = new Date(now.getTime() - maxPastDays * 24 * 60 * 60 * 1000);

  if (recordedAt < minDate || recordedAt > now) {
    return { error: `La fecha del registro debe estar entre ahora y máximo ${maxPastDays} días atrás.` };
  }

  return { recordedAt: recordedAt.toISOString() };
}

async function loadAdminSubmissionContext(token: string): Promise<AdminSubmissionContext | null> {
  const [session, userContext] = await Promise.all([readSessionTokens(), getCurrentUserContext()]);

  if (!session || userContext?.profile.globalRole !== "company_admin") {
    return null;
  }

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const { data: qrRow, error: qrError } = await supabase
    .from("branch_form_qr_codes")
    .select("company_id")
    .eq("token", token)
    .eq("is_active", true)
    .maybeSingle<PublicQrCompanyRow>();

  if (qrError) {
    logServerError("public_form.submit.admin_qr_lookup_failed", qrError, { tokenLength: token.length });
    return null;
  }

  if (!qrRow?.company_id) {
    return null;
  }

  const { data: companyRow, error: companyError } = await supabase
    .from("companies")
    .select("company_admin_user_id")
    .eq("id", qrRow.company_id)
    .eq("is_active", true)
    .maybeSingle<CompanyAdminRow>();

  if (companyError) {
    logServerError("public_form.submit.admin_company_lookup_failed", companyError, {
      companyId: qrRow.company_id,
      tokenLength: token.length,
    });
    return null;
  }

  if (companyRow?.company_admin_user_id !== userContext.profile.userId) {
    return null;
  }

  return {
    accessToken: session.accessToken,
    maxPastDays: 30,
  };
}

export async function submitPublicOperationalForm(
  _: PublicFormState,
  formData: FormData,
): Promise<PublicFormState> {
  const token = readString(formData, "token");
  const operatorName = readString(formData, "operatorName");

  if (!token) {
    return { error: "Este formulario no tiene un QR válido." };
  }

  const adminSubmissionContext = await loadAdminSubmissionContext(token);
  const maxPastDays = adminSubmissionContext?.maxPastDays ?? 5;
  const recordedAtResult = readRecordedAt(formData, maxPastDays);

  if (!operatorName) {
    return { error: "Ingresa el nombre del operador para guardar el registro." };
  }

  if (recordedAtResult.error) {
    return { error: recordedAtResult.error };
  }

  const supabase = adminSubmissionContext
    ? getSupabaseAuthClient(adminSubmissionContext.accessToken)
    : getSupabasePublicClient();

  if (!supabase) {
    logServerError("public_form.submit.public_client_missing", new Error("Supabase public client is not configured."), {
      tokenLength: token.length,
    });
    return { error: "Supabase no está configurado en el servidor." };
  }

  logServerInfo("public_form.submit.start", {
    tokenLength: token.length,
  });

  const payload: Record<string, boolean | number | string | null> = {
    p_token: token,
    p_operator_name: operatorName,
    p_equipment_id: readUuidOrNull(formData, "equipmentId"),
    p_temperature_c: readNumber(formData, "temperatureC"),
    p_area_id: readUuidOrNull(formData, "areaId"),
    p_is_compliant: readBooleanOrNull(formData, "isCompliant"),
    p_cleaning_type: readString(formData, "cleaningType") || null,
    p_used_exclusive_implements: readBooleanOrNull(formData, "usedExclusiveImplements"),
    p_used_authorized_chemicals: readBooleanOrNull(formData, "usedAuthorizedChemicals"),
    p_product_name: readString(formData, "productName") || null,
    p_product_type: readString(formData, "productType") || null,
    p_package_intact_date_valid: readBooleanOrNull(formData, "packageIntactDateValid"),
    p_organoleptic_adequate: readBooleanOrNull(formData, "organolepticAdequate"),
    p_decision: readString(formData, "decision") || null,
    p_observations: readString(formData, "observations") || null,
    p_chlorine_ppm: readNumber(formData, "chlorinePpm"),
    p_ph_level: readNumber(formData, "phLevel"),
  };

  if (recordedAtResult.recordedAt) {
    payload.p_recorded_at = recordedAtResult.recordedAt;
  }

  const { error } = await supabase.rpc("submit_public_operational_form", payload);

  if (error) {
    logServerError("public_form.submit.failed", error, {
      tokenLength: token.length,
    });
    return { error: error.message };
  }

  logServerInfo("public_form.submit.done", {
    tokenLength: token.length,
  });

  return { success: "Registro guardado. Puedes cerrar esta pantalla o registrar otro control." };
}
