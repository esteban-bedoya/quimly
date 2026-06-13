import { notFound } from "next/navigation";
import { cache } from "react";

import { OperationalPublicForm } from "@/components/public-forms/operational-public-form";
import { isOperationalFormType, operationalFormLabels } from "@/lib/operational-forms";
import { logServerError } from "@/lib/server/logging";
import { getSupabasePublicClient } from "@/lib/supabase/public";
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

type RefrigerationEquipmentRow = {
  id: string;
  name: string;
  equipment_type: BranchRefrigerationEquipmentType;
};

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
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
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

  return (
    <OperationalPublicForm
      token={token}
      formType={payload.form_type}
      branchName={payload.branch_name}
      companyName={payload.company_name}
      equipment={equipment}
      sanitationAreas={payload.sanitation_areas ?? []}
    />
  );
}
