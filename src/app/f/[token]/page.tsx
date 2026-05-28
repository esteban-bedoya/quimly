import { notFound } from "next/navigation";

import { OperationalPublicForm } from "@/components/public-forms/operational-public-form";
import { isOperationalFormType, operationalFormLabels, type OperationalFormType } from "@/lib/operational-forms";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type QrPageRow = {
  id: string;
  branch_id: string;
  company_id: string;
  form_type: string;
  token: string;
  is_active: boolean;
  branch: { name: string; is_active: boolean } | { name: string; is_active: boolean }[] | null;
  company: { name: string; is_active: boolean } | { name: string; is_active: boolean }[] | null;
};

type CatalogRow = {
  id: string;
  name: string;
};

function unwrapRelation<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return {
      title: "Formulario publico | Quimly",
      robots: { index: false, follow: false },
    };
  }

  const { data } = await supabase
    .from("branch_form_qr_codes")
    .select("form_type")
    .eq("token", token)
    .maybeSingle<{ form_type: OperationalFormType }>();

  return {
    title: data?.form_type ? `${operationalFormLabels[data.form_type].title} | Quimly` : "Formulario publico | Quimly",
    robots: { index: false, follow: false },
  };
}

export default async function PublicOperationalFormPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    notFound();
  }

  const { data, error } = await supabase
    .from("branch_form_qr_codes")
    .select("id, branch_id, company_id, form_type, token, is_active, branch:branches!inner(name, is_active), company:companies!inner(name, is_active)")
    .eq("token", token)
    .maybeSingle<QrPageRow>();

  if (error) {
    throw new Error(error.message);
  }

  const branch = unwrapRelation(data?.branch ?? null);
  const company = unwrapRelation(data?.company ?? null);

  if (
    !data ||
    !data.is_active ||
    !branch?.is_active ||
    !company?.is_active ||
    !isOperationalFormType(data.form_type)
  ) {
    notFound();
  }

  const [equipmentResult, areasResult] = await Promise.all([
    data.form_type === "thermal_control"
      ? supabase
          .from("branch_refrigeration_equipment")
          .select("id, name")
          .eq("branch_id", data.branch_id)
          .eq("is_active", true)
          .order("name", { ascending: true })
          .returns<CatalogRow[]>()
      : Promise.resolve({ data: [] as CatalogRow[], error: null }),
    data.form_type === "area_sanitation"
      ? supabase
          .from("branch_sanitation_areas")
          .select("id, name")
          .eq("branch_id", data.branch_id)
          .eq("is_active", true)
          .order("name", { ascending: true })
          .returns<CatalogRow[]>()
      : Promise.resolve({ data: [] as CatalogRow[], error: null }),
  ]);

  if (equipmentResult.error) {
    throw new Error(equipmentResult.error.message);
  }

  if (areasResult.error) {
    throw new Error(areasResult.error.message);
  }

  return (
    <OperationalPublicForm
      token={token}
      formType={data.form_type}
      branchName={branch.name}
      companyName={company.name}
      equipment={equipmentResult.data ?? []}
      sanitationAreas={areasResult.data ?? []}
    />
  );
}

