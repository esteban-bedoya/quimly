"use server";

import { logServerError, logServerInfo } from "@/lib/server/logging";
import { getSupabasePublicClient } from "@/lib/supabase/public";

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

export async function submitPublicOperationalForm(
  _: PublicFormState,
  formData: FormData,
): Promise<PublicFormState> {
  const token = readString(formData, "token");
  const operatorName = readString(formData, "operatorName");

  if (!token) {
    return { error: "Este formulario no tiene un QR válido." };
  }

  if (!operatorName) {
    return { error: "Ingresa el nombre del operador para guardar el registro." };
  }

  const supabase = getSupabasePublicClient();

  if (!supabase) {
    logServerError("public_form.submit.public_client_missing", new Error("Supabase public client is not configured."), {
      tokenLength: token.length,
    });
    return { error: "Supabase no está configurado en el servidor." };
  }

  logServerInfo("public_form.submit.start", {
    tokenLength: token.length,
  });

  const { error } = await supabase.rpc("submit_public_operational_form", {
    p_token: token,
    p_operator_name: operatorName,
    p_equipment_id: readUuidOrNull(formData, "equipmentId"),
    p_temperature_c: readNumber(formData, "temperatureC"),
    p_area_id: readUuidOrNull(formData, "areaId"),
    p_is_compliant: readBooleanOrNull(formData, "isCompliant"),
    p_product_name: readString(formData, "productName") || null,
    p_product_type: readString(formData, "productType") || null,
    p_package_intact_date_valid: readBooleanOrNull(formData, "packageIntactDateValid"),
    p_organoleptic_adequate: readBooleanOrNull(formData, "organolepticAdequate"),
    p_decision: readString(formData, "decision") || null,
    p_observations: readString(formData, "observations") || null,
    p_chlorine_ppm: readNumber(formData, "chlorinePpm"),
  });

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
