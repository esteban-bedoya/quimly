import { requireBranchAccess } from "@/lib/auth/authorization";
import { operationalFormTypes } from "@/lib/operational-forms";
import {
  getOperationalRecordDateLimits,
  getOperationalRecordDateStatus,
  type OperationalRecordDateStatus,
} from "@/lib/operational-record-dates";
import { logServerError, logServerInfo } from "@/lib/server/logging";
import { getSupabaseRlsClient } from "@/lib/supabase/rls-server";
import type {
  BranchCatalogItemSummary,
  BranchCatalogItemStatus,
  BranchRefrigerationEquipmentType,
  BranchChemicalProductSummary,
  BranchDocumentSummary,
  BranchFormQrSummary,
  BranchSanitaryDocumentCategory,
  BranchSanitaryDocumentCategoryStatusMap,
  BranchSanitaryDocumentStatusColor,
  BranchSanitaryDocumentFileSummary,
  BranchSanitaryDocumentKind,
  BranchStaffMemberSummary,
  OperationalFormType,
} from "@/types/auth";

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

type OperationalRecordSummaryRow = {
  formulario_id: OperationalFormType;
  fecha: string;
  cantidad_registros: number;
};

type BranchDocumentCategoryStatusRow = {
  sede_id: string;
  categoria: BranchSanitaryDocumentCategory;
  estado_calculado: BranchSanitaryDocumentStatusColor;
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

function getEmptyOperationalRecordDateStatuses() {
  return operationalFormTypes.reduce<Partial<Record<OperationalFormType, OperationalRecordDateStatus>>>(
    (statuses, formType) => {
      statuses[formType] = "missing";
      return statuses;
    },
    {},
  );
}

function mapDocumentCategoryStatusRows(rows: BranchDocumentCategoryStatusRow[] | null | undefined) {
  return (rows ?? []).reduce<BranchSanitaryDocumentCategoryStatusMap>((statuses, item) => {
    statuses[item.categoria] = item.estado_calculado;
    return statuses;
  }, {} as BranchSanitaryDocumentCategoryStatusMap);
}

async function loadOperationalRecordDateStatuses({
  supabase,
  branchId,
  companyId,
  companySlug,
  branchSlug,
}: {
  supabase: Awaited<ReturnType<typeof getSupabaseRlsClient>>;
  branchId: string;
  companyId: string;
  companySlug: string;
  branchSlug: string;
}) {
  const statuses = getEmptyOperationalRecordDateStatuses();
  const now = new Date();
  const recordDateLimits = getOperationalRecordDateLimits(30, now);
  const minDate = recordDateLimits.min.slice(0, 10);
  const maxDate = recordDateLimits.max.slice(0, 10);

  if (!supabase) {
    return statuses;
  }

  const result = await supabase
    .from("resumen_diario_formularios")
    .select("formulario_id, fecha, cantidad_registros")
    .eq("sede_id", branchId)
    .gte("fecha", minDate)
    .lte("fecha", maxDate)
    .gt("cantidad_registros", 0)
    .returns<OperationalRecordSummaryRow[]>();

  if (result.error) {
    logServerError("branch.view.operational_record_summary_failed", result.error, {
      branchId,
      companyId,
      companySlug,
      branchSlug,
    });
    return statuses;
  }

  for (const formType of operationalFormTypes) {
    statuses[formType] = getOperationalRecordDateStatus({
      completedDateKeys:
        result.data
          ?.filter((record) => record.formulario_id === formType && record.cantidad_registros > 0)
          .map((record) => record.fecha) ?? [],
      min: recordDateLimits.min,
      max: recordDateLimits.max,
    });
  }

  return statuses;
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

export async function loadBranchDashboardData(companySlug: string, branchSlug: string) {
  const { company, branch } = await requireBranchAccess(companySlug, branchSlug);
  const supabase = await getSupabaseRlsClient();
  let documents: BranchDocumentSummary[] = [];
  let qrCodes: BranchFormQrSummary[] = [];
  let refrigerationEquipment: BranchCatalogItemSummary[] = [];
  let sanitationAreas: BranchCatalogItemSummary[] = [];
  let chemicalProducts: BranchChemicalProductSummary[] = [];
  let staffMembers: BranchStaffMemberSummary[] = [];
  let sanitaryDocumentFiles: BranchSanitaryDocumentFileSummary[] = [];
  let sanitaryDocumentCategoryStatuses = {} as BranchSanitaryDocumentCategoryStatusMap;
  let operationalRecordDateStatuses = getEmptyOperationalRecordDateStatuses();

  if (supabase) {
    logServerInfo("branch.view.load.start", {
      branchId: branch.id,
      companyId: company.id,
      companySlug,
      branchSlug,
    });

    const [
      branchDocumentsResult,
      branchQrCodesResult,
      equipmentRowsResult,
      sanitationAreaRowsResult,
      chemicalProductRowsResult,
      staffMemberRowsResult,
      sanitaryDocumentFileRowsResult,
      sanitaryDocumentCategoryStatusRowsResult,
    ] = await Promise.all([
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
      supabase
        .from("sedes_categorias_documentos")
        .select("sede_id, categoria, estado_calculado")
        .eq("sede_id", branch.id)
        .returns<BranchDocumentCategoryStatusRow[]>(),
    ]);

    const queryResults = {
      branchDocuments: branchDocumentsResult,
      branchQrCodes: branchQrCodesResult,
      equipmentRows: equipmentRowsResult,
      sanitationAreaRows: sanitationAreaRowsResult,
      chemicalProductRows: chemicalProductRowsResult,
      staffMemberRows: staffMemberRowsResult,
      sanitaryDocumentFileRows: sanitaryDocumentFileRowsResult,
      sanitaryDocumentCategoryStatusRows: sanitaryDocumentCategoryStatusRowsResult,
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
    operationalRecordDateStatuses = await loadOperationalRecordDateStatuses({
      supabase,
      branchId: branch.id,
      companyId: company.id,
      companySlug,
      branchSlug,
    });

    const branchDocuments = branchDocumentsResult.data;
    const equipmentRows = equipmentRowsResult.data;
    const sanitationAreaRows = sanitationAreaRowsResult.data;
    const chemicalProductRows = chemicalProductRowsResult.data;
    const staffMemberRows = staffMemberRowsResult.data;
    const sanitaryDocumentFileRows = sanitaryDocumentFileRowsResult.data;
    const sanitaryDocumentCategoryStatusRows = sanitaryDocumentCategoryStatusRowsResult.data;

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

    sanitaryDocumentCategoryStatuses = mapDocumentCategoryStatusRows(sanitaryDocumentCategoryStatusRows);

    logServerInfo("branch.view.load.done", {
      branchId: branch.id,
      companyId: company.id,
      companySlug,
      branchSlug,
      qrCount: qrCodes.length,
      documentCount: documents.length,
      sanitaryDocumentFileCount: sanitaryDocumentFiles.length,
      sanitaryDocumentCategoryStatusCount: sanitaryDocumentCategoryStatusRows?.length ?? 0,
      chemicalProductCount: chemicalProducts.length,
      staffMemberCount: staffMembers.length,
      refrigerationEquipmentCount: refrigerationEquipment.length,
      sanitationAreaCount: sanitationAreas.length,
      operationalRecordDateStatuses,
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
    documents,
    qrCodes,
    operationalRecordDateStatuses,
    refrigerationEquipment,
    sanitationAreas,
    chemicalProducts,
    staffMembers,
    sanitaryDocumentFiles,
    sanitaryDocumentCategoryStatuses,
  };
}
