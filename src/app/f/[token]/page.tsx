import { notFound } from "next/navigation";

import { OperationalPublicForm } from "@/components/public-forms/operational-public-form";
import { isOperationalFormType, operationalFormLabels } from "@/lib/operational-forms";
import { logServerError } from "@/lib/server/logging";
import { getSupabasePublicClient } from "@/lib/supabase/public";
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
  equipment_type?: BranchRefrigerationEquipmentType | null;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = getSupabasePublicClient();

  if (!supabase) {
    return {
      title: "Formulario publico | Quimly",
      robots: { index: false, follow: false },
    };
  }

  const { data, error } = await supabase.rpc("get_public_operational_form", {
    p_token: token,
  });

  if (error) {
    logServerError("public_form.metadata.load_failed", error, { tokenLength: token.length });
  }

  const payload = data as PublicOperationalFormPayload | null;
  const formType = payload?.form_type;

  return {
    title: formType && isOperationalFormType(formType)
      ? `${operationalFormLabels[formType].title} | Quimly`
      : "Formulario publico | Quimly",
    robots: { index: false, follow: false },
  };
}

export default async function PublicOperationalFormPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = getSupabasePublicClient();

  if (!supabase) {
    logServerError("public_form.page.public_client_missing", new Error("Supabase public client is not configured."), {
      tokenLength: token.length,
    });
    notFound();
  }

  const { data, error } = await supabase.rpc("get_public_operational_form", {
    p_token: token,
  });

  if (error) {
    logServerError("public_form.page.load_failed", error, { tokenLength: token.length });
    throw new Error(error.message);
  }

  const payload = data as PublicOperationalFormPayload | null;

  if (!payload || !isOperationalFormType(payload.form_type)) {
    notFound();
  }

  return (
    <OperationalPublicForm
      token={token}
      formType={payload.form_type}
      branchName={payload.branch_name}
      companyName={payload.company_name}
      equipment={payload.equipment ?? []}
      sanitationAreas={payload.sanitation_areas ?? []}
    />
  );
}
