"use server";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { OperationalFormType } from "@/lib/operational-forms";

export type PublicFormState = {
  error?: string;
  success?: string;
};

type QrLookup = {
  id: string;
  branch_id: string;
  company_id: string;
  form_type: OperationalFormType;
  token: string;
  is_active: boolean;
  branch: { name: string; is_active: boolean } | { name: string; is_active: boolean }[] | null;
  company: { name: string; is_active: boolean } | { name: string; is_active: boolean }[] | null;
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

function unwrapRelation<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

async function resolveQrToken(token: string) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    throw new Error("Supabase no está configurado en el servidor.");
  }

  const { data, error } = await supabase
    .from("branch_form_qr_codes")
    .select("id, branch_id, company_id, form_type, token, is_active, branch:branches!inner(name, is_active), company:companies!inner(name, is_active)")
    .eq("token", token)
    .maybeSingle<QrLookup>();

  if (error) {
    throw new Error(error.message);
  }

  const branch = unwrapRelation(data?.branch ?? null);
  const company = unwrapRelation(data?.company ?? null);

  if (!data || !data.is_active || !branch?.is_active || !company?.is_active) {
    return null;
  }

  return data;
}

async function resolveEquipment({
  equipmentId,
  branchId,
}: {
  equipmentId: string;
  branchId: string;
}) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    throw new Error("Supabase no está configurado en el servidor.");
  }

  const { data, error } = await supabase
    .from("branch_refrigeration_equipment")
    .select("id, name")
    .eq("id", equipmentId)
    .eq("branch_id", branchId)
    .eq("is_active", true)
    .maybeSingle<{ id: string; name: string }>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function resolveSanitationArea({
  areaId,
  branchId,
}: {
  areaId: string;
  branchId: string;
}) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    throw new Error("Supabase no está configurado en el servidor.");
  }

  const { data, error } = await supabase
    .from("branch_sanitation_areas")
    .select("id, name")
    .eq("id", areaId)
    .eq("branch_id", branchId)
    .eq("is_active", true)
    .maybeSingle<{ id: string; name: string }>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
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

  const qr = await resolveQrToken(token);

  if (!qr) {
    return { error: "Este QR no está activo o ya fue regenerado. Solicita el QR vigente de la sede." };
  }

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return { error: "Supabase no está configurado en el servidor." };
  }

  if (qr.form_type === "thermal_control") {
    const equipmentId = readString(formData, "equipmentId");
    const temperatureC = readNumber(formData, "temperatureC");

    if (!equipmentId || temperatureC === null) {
      return { error: "Selecciona el equipo e ingresa una temperatura válida." };
    }

    const equipment = await resolveEquipment({ equipmentId, branchId: qr.branch_id });

    if (!equipment) {
      return { error: "El equipo seleccionado no pertenece a esta sede o no está activo." };
    }

    const { error } = await supabase.from("thermal_control_records").insert({
      sede_id: qr.branch_id,
      company_id: qr.company_id,
      tipo_formulario: qr.form_type,
      token_qr_utilizado: qr.token,
      qr_code_id: qr.id,
      equipment_id: equipment.id,
      equipment_name: equipment.name,
      operator_name: operatorName,
      temperature_c: temperatureC,
    });

    if (error) {
      return { error: error.message };
    }
  }

  if (qr.form_type === "area_sanitation") {
    const areaId = readString(formData, "areaId");
    const complianceValue = readString(formData, "isCompliant");

    if (!areaId || !["true", "false"].includes(complianceValue)) {
      return { error: "Selecciona el área y el estado de conformidad." };
    }

    const area = await resolveSanitationArea({ areaId, branchId: qr.branch_id });

    if (!area) {
      return { error: "El área seleccionada no pertenece a esta sede o no está activa." };
    }

    const { error } = await supabase.from("area_sanitation_records").insert({
      sede_id: qr.branch_id,
      company_id: qr.company_id,
      tipo_formulario: qr.form_type,
      token_qr_utilizado: qr.token,
      qr_code_id: qr.id,
      area_id: area.id,
      area_name: area.name,
      operator_name: operatorName,
      is_compliant: complianceValue === "true",
    });

    if (error) {
      return { error: error.message };
    }
  }

  if (qr.form_type === "supply_reception") {
    const productName = readString(formData, "productName");
    const providerName = readString(formData, "providerName");
    const expirationDate = readString(formData, "expirationDate");

    if (!productName || !providerName || !expirationDate) {
      return { error: "Completa producto, proveedor y fecha de vencimiento." };
    }

    const { error } = await supabase.from("supply_reception_records").insert({
      sede_id: qr.branch_id,
      company_id: qr.company_id,
      tipo_formulario: qr.form_type,
      token_qr_utilizado: qr.token,
      qr_code_id: qr.id,
      operator_name: operatorName,
      product_name: productName,
      provider_name: providerName,
      expiration_date: expirationDate,
    });

    if (error) {
      return { error: error.message };
    }
  }

  if (qr.form_type === "water_quality") {
    const chlorinePpm = readNumber(formData, "chlorinePpm");

    if (chlorinePpm === null) {
      return { error: "Ingresa la medición de cloro en ppm." };
    }

    if (chlorinePpm < 0.3 || chlorinePpm > 2.0) {
      return { error: "La medición de cloro debe estar entre 0.3 y 2.0 ppm." };
    }

    const { error } = await supabase.from("water_quality_records").insert({
      sede_id: qr.branch_id,
      company_id: qr.company_id,
      tipo_formulario: qr.form_type,
      token_qr_utilizado: qr.token,
      qr_code_id: qr.id,
      operator_name: operatorName,
      chlorine_ppm: chlorinePpm,
    });

    if (error) {
      return { error: error.message };
    }
  }

  return { success: "Registro guardado. Puedes cerrar esta pantalla o registrar otro control." };
}

