import { requireBranchAccess } from "@/lib/auth/authorization";
import { operationalFormTypes } from "@/lib/operational-forms";
import { logServerError, logServerInfo } from "@/lib/server/logging";
import { getSupabaseRlsClient } from "@/lib/supabase/rls-server";
import type {
  BranchCatalogItemSummary,
  BranchCatalogItemStatus,
  BranchRefrigerationEquipmentType,
  BranchChemicalProductSummary,
  BranchDocumentSummary,
  BranchFormQrSummary,
  BranchSanitaryDocumentFileSummary,
  BranchSanitaryDocumentKind,
  BranchStaffMemberSummary,
  OperationalFormType,
} from "@/types/auth";

type BranchDashboardItemRow = {
  module_kind: "operational" | "compliance";
  title: string;
  subtitle: string;
  requires_expiration: boolean;
  sort_order: number;
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
};

type BranchCatalogRow = {
  id: string;
  branch_id: string;
  company_id: string;
  name: string;
  equipment_type?: BranchRefrigerationEquipmentType | null;
  is_active: boolean;
  status: BranchCatalogItemStatus;
};

type BranchChemicalProductRow = {
  id: string;
  branch_id: string;
  company_id: string;
  name: string;
  is_active: boolean;
  updated_at: string;
};

type BranchStaffMemberRow = {
  id: string;
  branch_id: string;
  company_id: string;
  full_name: string;
  is_active: boolean;
  updated_at: string;
};

type BranchSanitaryDocumentFileRow = {
  id: string;
  branch_id: string;
  company_id: string;
  document_kind: BranchSanitaryDocumentKind;
  chemical_product_id: string | null;
  staff_member_id: string | null;
  file_url: string;
  file_name: string;
  file_size_bytes: number;
  mime_type: string;
  metadata: Record<string, unknown>;
  expires_at: string | null;
  is_active: boolean;
  uploaded_at: string;
  updated_at: string;
};

function mapQrRows(qrRows: BranchFormQrRow[] | null | undefined) {
  return (
    qrRows?.map((qrCode) => ({
      id: qrCode.id,
      branchId: qrCode.branch_id,
      companyId: qrCode.company_id,
      formType: qrCode.form_type,
      token: qrCode.token,
      isActive: qrCode.is_active,
    })) ?? []
  );
}

async function ensureBranchQrCodes({
  supabase,
  branchId,
  companyId,
  companySlug,
  branchSlug,
  existingQrRows,
}: {
  supabase: Awaited<ReturnType<typeof getSupabaseRlsClient>>;
  branchId: string;
  companyId: string;
  companySlug: string;
  branchSlug: string;
  existingQrRows: BranchFormQrRow[] | null | undefined;
}) {
  if (!supabase) {
    return existingQrRows ?? [];
  }

  const existingFormTypes = new Set(existingQrRows?.map((qrCode) => qrCode.form_type) ?? []);
  const missingFormTypes = operationalFormTypes.filter((formType) => !existingFormTypes.has(formType));

  if (!missingFormTypes.length) {
    return existingQrRows ?? [];
  }

  logServerInfo("branch.qr.ensure_missing.start", {
    branchId,
    companyId,
    companySlug,
    branchSlug,
    missingFormTypes,
  });

  const { error: insertError } = await supabase.from("branch_form_qr_codes").upsert(
    missingFormTypes.map((formType) => ({
      branch_id: branchId,
      company_id: companyId,
      form_type: formType,
      is_active: true,
    })),
    { onConflict: "branch_id,form_type", ignoreDuplicates: true },
  );

  if (insertError) {
    logServerError("branch.qr.ensure_missing.insert_failed", insertError, {
      branchId,
      companyId,
      companySlug,
      branchSlug,
      missingFormTypes,
    });
    return existingQrRows ?? [];
  }

  const { data: refreshedQrRows, error: refreshError } = await supabase
    .from("branch_form_qr_codes")
    .select("id, branch_id, company_id, form_type, token, is_active")
    .eq("branch_id", branchId)
    .order("form_type", { ascending: true })
    .returns<BranchFormQrRow[]>();

  if (refreshError) {
    logServerError("branch.qr.ensure_missing.refresh_failed", refreshError, {
      branchId,
      companyId,
      companySlug,
      branchSlug,
    });
    return existingQrRows ?? [];
  }

  logServerInfo("branch.qr.ensure_missing.done", {
    branchId,
    companyId,
    companySlug,
    branchSlug,
    qrCount: refreshedQrRows?.length ?? 0,
  });

  return refreshedQrRows ?? [];
}

export type BranchModuleSummary = {
  title: string;
  detail: string;
  badge?: string;
};

export async function loadBranchDashboardData(companySlug: string, branchSlug: string) {
  const { company, branch } = await requireBranchAccess(companySlug, branchSlug);
  const supabase = await getSupabaseRlsClient();
  let operationalItems: BranchModuleSummary[] | undefined;
  let complianceItems: BranchModuleSummary[] | undefined;
  let documents: BranchDocumentSummary[] = [];
  let qrCodes: BranchFormQrSummary[] = [];
  let refrigerationEquipment: BranchCatalogItemSummary[] = [];
  let sanitationAreas: BranchCatalogItemSummary[] = [];
  let chemicalProducts: BranchChemicalProductSummary[] = [];
  let staffMembers: BranchStaffMemberSummary[] = [];
  let sanitaryDocumentFiles: BranchSanitaryDocumentFileSummary[] = [];

  if (supabase) {
    logServerInfo("branch.view.load.start", {
      branchId: branch.id,
      companyId: company.id,
      companySlug,
      branchSlug,
    });

    const [
      dashboardItemsResult,
      branchDocumentsResult,
      branchQrCodesResult,
      equipmentRowsResult,
      sanitationAreaRowsResult,
      chemicalProductRowsResult,
      staffMemberRowsResult,
      sanitaryDocumentFileRowsResult,
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
        .select("id, branch_id, company_id, form_type, token, is_active")
        .eq("branch_id", branch.id)
        .order("form_type", { ascending: true })
        .returns<BranchFormQrRow[]>(),
      supabase
        .from("branch_refrigeration_equipment")
        .select("id, branch_id, company_id, name, equipment_type, is_active, status")
        .eq("branch_id", branch.id)
        .neq("status", "archived")
        .order("name", { ascending: true })
        .returns<BranchCatalogRow[]>(),
      supabase
        .from("branch_sanitation_areas")
        .select("id, branch_id, company_id, name, is_active, status")
        .eq("branch_id", branch.id)
        .neq("status", "archived")
        .order("name", { ascending: true })
        .returns<BranchCatalogRow[]>(),
      supabase
        .from("branch_chemical_products")
        .select("id, branch_id, company_id, name, is_active, updated_at")
        .eq("branch_id", branch.id)
        .eq("is_active", true)
        .order("name", { ascending: true })
        .returns<BranchChemicalProductRow[]>(),
      supabase
        .from("branch_staff_members")
        .select("id, branch_id, company_id, full_name, is_active, updated_at")
        .eq("branch_id", branch.id)
        .eq("is_active", true)
        .order("full_name", { ascending: true })
        .returns<BranchStaffMemberRow[]>(),
      supabase
        .from("branch_sanitary_document_files")
        .select(
          "id, branch_id, company_id, document_kind, chemical_product_id, staff_member_id, file_url, file_name, file_size_bytes, mime_type, metadata, expires_at, is_active, uploaded_at, updated_at",
        )
        .eq("branch_id", branch.id)
        .eq("is_active", true)
        .order("uploaded_at", { ascending: false })
        .returns<BranchSanitaryDocumentFileRow[]>(),
    ]);

    const queryResults = {
      dashboardItems: dashboardItemsResult,
      branchDocuments: branchDocumentsResult,
      branchQrCodes: branchQrCodesResult,
      equipmentRows: equipmentRowsResult,
      sanitationAreaRows: sanitationAreaRowsResult,
      chemicalProductRows: chemicalProductRowsResult,
      staffMemberRows: staffMemberRowsResult,
      sanitaryDocumentFileRows: sanitaryDocumentFileRowsResult,
    };

    for (const [queryName, result] of Object.entries(queryResults)) {
      if (result.error) {
        logServerError("branch.view.query_failed", result.error, {
          queryName,
          branchId: branch.id,
          companyId: company.id,
          companySlug,
          branchSlug,
        });
      }
    }

    const branchQrCodes = await ensureBranchQrCodes({
      supabase,
      branchId: branch.id,
      companyId: branch.companyId,
      companySlug,
      branchSlug,
      existingQrRows: branchQrCodesResult.data,
    });

    const dashboardItems = dashboardItemsResult.data;
    const branchDocuments = branchDocumentsResult.data;
    const equipmentRows = equipmentRowsResult.data;
    const sanitationAreaRows = sanitationAreaRowsResult.data;
    const chemicalProductRows = chemicalProductRowsResult.data;
    const staffMemberRows = staffMemberRowsResult.data;
    const sanitaryDocumentFileRows = sanitaryDocumentFileRowsResult.data;

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

    qrCodes = mapQrRows(branchQrCodes);

    refrigerationEquipment =
      equipmentRows?.map((item) => ({
        id: item.id,
        branchId: item.branch_id,
        companyId: item.company_id,
        name: item.name,
        equipmentType: item.equipment_type ?? null,
        isActive: item.is_active,
        status: item.status,
      })) ?? [];

    sanitationAreas =
      sanitationAreaRows?.map((item) => ({
        id: item.id,
        branchId: item.branch_id,
        companyId: item.company_id,
        name: item.name,
        isActive: item.is_active,
        status: item.status,
      })) ?? [];

    chemicalProducts =
      chemicalProductRows?.map((item) => ({
        id: item.id,
        branchId: item.branch_id,
        companyId: item.company_id,
        name: item.name,
        isActive: item.is_active,
        updatedAt: item.updated_at,
      })) ?? [];

    staffMembers =
      staffMemberRows?.map((item) => ({
        id: item.id,
        branchId: item.branch_id,
        companyId: item.company_id,
        fullName: item.full_name,
        isActive: item.is_active,
        updatedAt: item.updated_at,
      })) ?? [];

    sanitaryDocumentFiles =
      sanitaryDocumentFileRows?.map((item) => ({
        id: item.id,
        branchId: item.branch_id,
        companyId: item.company_id,
        documentKind: item.document_kind,
        chemicalProductId: item.chemical_product_id,
        staffMemberId: item.staff_member_id,
        fileUrl: item.file_url,
        fileName: item.file_name,
        fileSizeBytes: item.file_size_bytes,
        mimeType: item.mime_type,
        metadata: item.metadata,
        expiresAt: item.expires_at,
        isActive: item.is_active,
        uploadedAt: item.uploaded_at,
        updatedAt: item.updated_at,
      })) ?? [];

    logServerInfo("branch.view.load.done", {
      branchId: branch.id,
      companyId: company.id,
      companySlug,
      branchSlug,
      qrCount: qrCodes.length,
      documentCount: documents.length,
      sanitaryDocumentFileCount: sanitaryDocumentFiles.length,
      chemicalProductCount: chemicalProducts.length,
      staffMemberCount: staffMembers.length,
      refrigerationEquipmentCount: refrigerationEquipment.length,
      sanitationAreaCount: sanitationAreas.length,
    });
  } else {
    logServerError("branch.view.rls_client_missing", new Error("Supabase RLS client is not configured."), {
      branchId: branch.id,
      companyId: company.id,
      companySlug,
      branchSlug,
    });
  }

  return {
    company,
    branch,
    operationalItems,
    complianceItems,
    documents,
    qrCodes,
    refrigerationEquipment,
    sanitationAreas,
    chemicalProducts,
    staffMembers,
    sanitaryDocumentFiles,
  };
}
