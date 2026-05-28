import { BranchDetailView } from "@/components/dashboard/branch-detail-view";
import { requireBranchAccess } from "@/lib/auth/authorization";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type {
  BranchCatalogItemSummary,
  BranchDocumentSummary,
  BranchFormQrSummary,
  OperationalFormType,
} from "@/types/auth";

export const dynamic = "force-dynamic";

type BranchDashboardItemRow = {
  module_kind: "operational" | "compliance";
  title: string;
  subtitle: string;
  requires_expiration: boolean;
  sort_order: number;
};

type BranchModuleItem = {
  title: string;
  detail: string;
  badge?: string;
};

type BranchDocumentRow = {
  id: string;
  branch_id: string;
  section_key: "manuals_protocols" | "plant_certifications" | "traceability_supplies" | "staff_records";
  title: string;
  description: string | null;
  file_url: string | null;
  expires_at: string | null;
  is_active: boolean;
  sort_order: number;
};

type BranchFormQrRow = {
  id: string;
  branch_id: string;
  company_id: string;
  form_type: OperationalFormType;
  token: string;
  is_active: boolean;
  regenerated_at: string | null;
};

type BranchCatalogRow = {
  id: string;
  branch_id: string;
  company_id: string;
  name: string;
  is_active: boolean;
};

export default async function BranchDashboardPage({
  params,
}: {
  params: Promise<{ companySlug: string; branchSlug: string }>;
}) {
  const { companySlug, branchSlug } = await params;
  const { company, branch } = await requireBranchAccess(companySlug, branchSlug);
  const supabase = getSupabaseServerClient();
  let operationalItems: BranchModuleItem[] | undefined;
  let complianceItems: BranchModuleItem[] | undefined;
  let documents: BranchDocumentSummary[] = [];
  let qrCodes: BranchFormQrSummary[] = [];
  let refrigerationEquipment: BranchCatalogItemSummary[] = [];
  let sanitationAreas: BranchCatalogItemSummary[] = [];

  if (supabase) {
    const [
      { data: dashboardItems },
      { data: branchDocuments },
      { data: branchQrCodes },
      { data: equipmentRows },
      { data: sanitationAreaRows },
    ] = await Promise.all([
      supabase
        .from("branch_dashboard_items")
        .select("module_kind, title, subtitle, requires_expiration, sort_order")
        .eq("branch_id", branch.id)
        .eq("is_active", true)
        .order("module_kind", { ascending: true })
        .order("sort_order", { ascending: true })
        .returns<BranchDashboardItemRow[]>(),
      supabase
        .from("branch_documents")
        .select(
          "id, branch_id, section_key, title, description, file_url, expires_at, is_active, sort_order",
        )
        .eq("branch_id", branch.id)
        .order("section_key", { ascending: true })
        .order("sort_order", { ascending: true })
        .returns<BranchDocumentRow[]>(),
      supabase
        .from("branch_form_qr_codes")
        .select("id, branch_id, company_id, form_type, token, is_active, regenerated_at")
        .eq("branch_id", branch.id)
        .order("form_type", { ascending: true })
        .returns<BranchFormQrRow[]>(),
      supabase
        .from("branch_refrigeration_equipment")
        .select("id, branch_id, company_id, name, is_active")
        .eq("branch_id", branch.id)
        .order("name", { ascending: true })
        .returns<BranchCatalogRow[]>(),
      supabase
        .from("branch_sanitation_areas")
        .select("id, branch_id, company_id, name, is_active")
        .eq("branch_id", branch.id)
        .order("name", { ascending: true })
        .returns<BranchCatalogRow[]>(),
    ]);

    operationalItems =
      dashboardItems
        ?.filter((item) => item.module_kind === "operational")
        .map((item) => ({
          title: item.title,
          detail: item.subtitle,
          badge: item.requires_expiration ? "Vencimiento" : undefined,
        })) ?? undefined;

    complianceItems =
      dashboardItems
        ?.filter((item) => item.module_kind === "compliance")
        .map((item) => ({
          title: item.title,
          detail: item.subtitle,
          badge: item.requires_expiration ? "Vencimiento" : undefined,
        })) ?? undefined;

    documents =
      branchDocuments?.map((document) => ({
        id: document.id,
        branchId: document.branch_id,
        sectionKey: document.section_key,
        title: document.title,
        description: document.description,
        fileUrl: document.file_url,
        expiresAt: document.expires_at,
        isActive: document.is_active,
        sortOrder: document.sort_order,
      })) ?? [];

    qrCodes =
      branchQrCodes?.map((qrCode) => ({
        id: qrCode.id,
        branchId: qrCode.branch_id,
        companyId: qrCode.company_id,
        formType: qrCode.form_type,
        token: qrCode.token,
        isActive: qrCode.is_active,
        regeneratedAt: qrCode.regenerated_at,
      })) ?? [];

    refrigerationEquipment =
      equipmentRows?.map((item) => ({
        id: item.id,
        branchId: item.branch_id,
        companyId: item.company_id,
        name: item.name,
        isActive: item.is_active,
      })) ?? [];

    sanitationAreas =
      sanitationAreaRows?.map((item) => ({
        id: item.id,
        branchId: item.branch_id,
        companyId: item.company_id,
        name: item.name,
        isActive: item.is_active,
      })) ?? [];
  }

  return (
    <BranchDetailView
      company={company}
      branch={branch}
      operationalItems={operationalItems}
      complianceItems={complianceItems}
      documents={documents}
      qrCodes={qrCodes}
      refrigerationEquipment={refrigerationEquipment}
      sanitationAreas={sanitationAreas}
    />
  );
}
