import {
  currentDocumentCategories,
  getHistoryDocumentCategory,
  historyDocumentCategories,
  type CurrentDocumentCategoryId,
  type HistoryDocumentCategoryId,
} from "@/lib/branch-reports/config";
import { formatDateForDisplay, formatDateTimeForDisplay } from "@/lib/branch-reports/dates";
import type {
  BranchReportBranch,
  BranchReportDocumentBundle,
  BranchReportDocumentEntry,
  BranchReportDocumentFile,
  BranchReportDocumentSource,
  BranchReportNamedEntity,
  BranchReportPanelData,
  OperationalReportRecord,
  OperationalReportSection,
} from "@/lib/branch-reports/types";
import { operationalFormLabels, type OperationalFormType } from "@/lib/operational-forms";
import { getSupabaseRlsClient } from "@/lib/supabase/rls-server";
import type { BranchSanitaryDocumentKind } from "@/types/auth";

type SanitaryDocumentFileRow = {
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
  uploaded_at: string;
  updated_at: string;
};

type NamedEntityRow = {
  id: string;
  name?: string;
  full_name?: string;
};

type ThermalControlRecordRow = {
  id: string;
  fecha_hora_servidor: string;
  equipment_name: string;
  equipment_type: "refrigerator" | "freezer" | null;
  operator_name: string;
  temperature_c: number | string;
  temperature_compliant: boolean | null;
  observations: string | null;
};

type AreaSanitationRecordRow = {
  id: string;
  fecha_hora_servidor: string;
  area_name: string;
  operator_name: string;
  cleaning_type: string | null;
  used_exclusive_implements: boolean | null;
  used_authorized_chemicals: boolean | null;
  is_compliant: boolean;
};

type SupplyReceptionRecordRow = {
  id: string;
  fecha_hora_servidor: string;
  operator_name: string;
  product_name: string;
  provider_name: string | null;
  expiration_date: string | null;
  product_type: string;
  temperature_c: number | string | null;
  temperature_compliant: boolean | null;
  package_intact_date_valid: boolean;
  organoleptic_adequate: boolean;
  decision: string;
  observations: string | null;
};

type WaterQualityRecordRow = {
  id: string;
  fecha_hora_servidor: string;
  operator_name: string;
  chlorine_ppm: number | string;
  chlorine_compliant: boolean;
  ph_level: number | string;
  ph_compliant: boolean;
  observations: string | null;
};

type ReportSupabaseClient = NonNullable<Awaited<ReturnType<typeof getSupabaseRlsClient>>>;

const currentDocumentLabels: Record<CurrentDocumentCategoryId, string> = Object.fromEntries(
  currentDocumentCategories.map((category) => [category.id, category.title]),
) as Record<CurrentDocumentCategoryId, string>;

function mapDocumentFileRow(row: SanitaryDocumentFileRow): BranchReportDocumentFile {
  return {
    id: row.id,
    branchId: row.branch_id,
    companyId: row.company_id,
    documentKind: row.document_kind,
    chemicalProductId: row.chemical_product_id,
    staffMemberId: row.staff_member_id,
    fileUrl: row.file_url,
    fileName: row.file_name,
    fileSizeBytes: row.file_size_bytes,
    mimeType: row.mime_type,
    metadata: row.metadata,
    expiresAt: row.expires_at,
    uploadedAt: row.uploaded_at,
    updatedAt: row.updated_at,
  };
}

function getMetadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" ? value : "";
}

function getDocumentOwnDate(file: BranchReportDocumentFile) {
  if (file.documentKind === "acu_final_disposal_certificate") {
    return getMetadataString(file.metadata, "collectedAt");
  }

  if (
    file.documentKind === "pest_control_certificate" ||
    file.documentKind === "water_tank_cleaning_certificate" ||
    file.documentKind === "food_handling_course" ||
    file.documentKind === "medical_fitness_exam"
  ) {
    return getMetadataString(file.metadata, "issuedAt");
  }

  return file.updatedAt.slice(0, 10);
}

function getDocumentSortTime(file: BranchReportDocumentFile) {
  const ownDate = getDocumentOwnDate(file);
  const ownTime = ownDate ? Date.parse(`${ownDate}T00:00:00`) : 0;

  if (ownTime) {
    return ownTime;
  }

  const updatedAtTime = Date.parse(file.updatedAt);
  return Number.isNaN(updatedAtTime) ? 0 : updatedAtTime;
}

function sortFilesNewestFirst(files: BranchReportDocumentFile[]) {
  return [...files].sort((left, right) => {
    const dateDelta = getDocumentSortTime(right) - getDocumentSortTime(left);

    if (dateDelta !== 0) {
      return dateDelta;
    }

    return right.id.localeCompare(left.id);
  });
}

function sortEntriesOldestFirst(entries: BranchReportDocumentEntry[]) {
  return [...entries].sort((left, right) => {
    const leftDate = left.date ? Date.parse(`${left.date}T00:00:00`) : 0;
    const rightDate = right.date ? Date.parse(`${right.date}T00:00:00`) : 0;

    if (leftDate !== rightDate) {
      return leftDate - rightDate;
    }

    return left.file.updatedAt.localeCompare(right.file.updatedAt);
  });
}

function byDocumentKind(files: BranchReportDocumentFile[], documentKind: BranchSanitaryDocumentKind) {
  return files.filter((file) => file.documentKind === documentKind);
}

function createEntry(file: BranchReportDocumentFile, label: string): BranchReportDocumentEntry {
  return {
    file,
    label,
    date: getDocumentOwnDate(file),
  };
}

function findCurrentKindFile(source: BranchReportDocumentSource, documentKind: BranchSanitaryDocumentKind) {
  return sortFilesNewestFirst(byDocumentKind(source.files, documentKind))[0] ?? null;
}

function findOwnedFile(
  source: BranchReportDocumentSource,
  documentKind: BranchSanitaryDocumentKind,
  owner: { chemicalProductId?: string; staffMemberId?: string },
) {
  return (
    source.files.find((file) => {
      if (file.documentKind !== documentKind) {
        return false;
      }

      if (owner.chemicalProductId && file.chemicalProductId !== owner.chemicalProductId) {
        return false;
      }

      if (owner.staffMemberId && file.staffMemberId !== owner.staffMemberId) {
        return false;
      }

      return true;
    }) ?? null
  );
}

function countLabel(count: number, singular: string, plural: string, suffix: string) {
  if (!count) {
    return `Sin ${plural} ${suffix}`;
  }

  return `${count} ${count === 1 ? singular : plural} ${suffix}`;
}

function buildCurrentCategoryBundle(
  source: BranchReportDocumentSource,
  categoryId: CurrentDocumentCategoryId,
): BranchReportDocumentBundle {
  if (categoryId === "sanitation_plan") {
    const file = findCurrentKindFile(source, "sanitation_plan");
    return {
      id: categoryId,
      title: currentDocumentLabels[categoryId],
      entries: file ? [createEntry(file, "Plan de saneamiento básico")] : [],
    };
  }

  if (categoryId === "pest_control") {
    const file = findCurrentKindFile(source, "pest_control_certificate");
    return {
      id: categoryId,
      title: currentDocumentLabels[categoryId],
      entries: file ? [createEntry(file, "Certificado de control de plagas")] : [],
    };
  }

  if (categoryId === "water_tank_cleaning") {
    const file = findCurrentKindFile(source, "water_tank_cleaning_certificate");
    return {
      id: categoryId,
      title: currentDocumentLabels[categoryId],
      entries: file ? [createEntry(file, "Certificado de lavado de tanques")] : [],
    };
  }

  if (categoryId === "acu_final_disposal") {
    const file = findCurrentKindFile(source, "acu_final_disposal_certificate");
    return {
      id: categoryId,
      title: currentDocumentLabels[categoryId],
      entries: file ? [createEntry(file, "Certificado ACU más reciente")] : [],
    };
  }

  if (categoryId === "staff_records") {
    const groups = source.staffMembers
      .map((staffMember) => {
        const foodHandlingCourse = findOwnedFile(source, "food_handling_course", { staffMemberId: staffMember.id });
        const medicalFitnessExam = findOwnedFile(source, "medical_fitness_exam", { staffMemberId: staffMember.id });
        const entries = [
          foodHandlingCourse ? createEntry(foodHandlingCourse, "Curso de manipulación de alimentos") : null,
          medicalFitnessExam ? createEntry(medicalFitnessExam, "Examen de aptitud médica") : null,
        ].filter((entry): entry is BranchReportDocumentEntry => Boolean(entry));

        return { title: staffMember.name, entries };
      })
      .filter((group) => group.entries.length > 0);

    return {
      id: categoryId,
      title: currentDocumentLabels[categoryId],
      entries: groups.flatMap((group) => group.entries),
      groups,
    };
  }

  const groups = source.chemicalProducts
    .map((product) => {
      const technicalSheet = findOwnedFile(source, "chemical_technical_sheet", { chemicalProductId: product.id });
      const safetySheet = findOwnedFile(source, "chemical_safety_sheet", { chemicalProductId: product.id });
      const entries = [
        technicalSheet ? createEntry(technicalSheet, "Ficha técnica") : null,
        safetySheet ? createEntry(safetySheet, "Hoja de seguridad") : null,
      ].filter((entry): entry is BranchReportDocumentEntry => Boolean(entry));

      return { title: product.name, entries };
    })
    .filter((group) => group.entries.length > 0);

  return {
    id: categoryId,
    title: currentDocumentLabels[categoryId],
    entries: groups.flatMap((group) => group.entries),
    groups,
  };
}

function buildCurrentCategoryCountLabel(source: BranchReportDocumentSource, categoryId: CurrentDocumentCategoryId) {
  const bundle = buildCurrentCategoryBundle(source, categoryId);

  if (categoryId === "sanitation_plan") {
    return bundle.entries.length ? "1 archivo" : "Sin archivos almacenados";
  }

  if (categoryId === "pest_control" || categoryId === "water_tank_cleaning" || categoryId === "acu_final_disposal") {
    return bundle.entries.length ? "Último certificado" : "Sin certificados almacenados";
  }

  if (categoryId === "staff_records") {
    const ownerCount = bundle.groups?.length ?? 0;
    const fileCount = bundle.entries.length;
    if (!fileCount) {
      return "Sin archivos disponibles";
    }

    return `${fileCount} ${fileCount === 1 ? "archivo" : "archivos"} de ${ownerCount} ${
      ownerCount === 1 ? "colaborador" : "colaboradores"
    }`;
  }

  if (categoryId === "chemical_products") {
    const ownerCount = bundle.groups?.length ?? 0;
    const fileCount = bundle.entries.length;
    if (!fileCount) {
      return "Sin archivos disponibles";
    }

    return `${fileCount} ${fileCount === 1 ? "archivo" : "archivos"} de ${ownerCount} ${
      ownerCount === 1 ? "producto" : "productos"
    }`;
  }

  return countLabel(bundle.entries.length, "archivo", "archivos", "disponibles");
}

function getHistoricalEntries(
  source: BranchReportDocumentSource,
  categoryId: HistoryDocumentCategoryId,
  range?: { from: string; to: string } | null,
) {
  const category = getHistoryDocumentCategory(categoryId);
  const files = sortFilesNewestFirst(byDocumentKind(source.files, category.documentKind));

  return sortEntriesOldestFirst(
    files
      .filter((file) => {
        if (!range) {
          return true;
        }

        const date = getDocumentOwnDate(file);
        return Boolean(date && date >= range.from && date <= range.to);
      })
      .map((file) => createEntry(file, category.title)),
  );
}

function buildHistoricalCountLabel(source: BranchReportDocumentSource, categoryId: HistoryDocumentCategoryId) {
  const category = getHistoryDocumentCategory(categoryId);
  const count = getHistoricalEntries(source, categoryId).length;

  if (!count) {
    return `Sin ${category.filePlural} almacenados`;
  }

  return `${count} ${count === 1 ? category.fileSingular : category.filePlural}`;
}

function mapNamedEntity(row: NamedEntityRow): BranchReportNamedEntity {
  return {
    id: row.id,
    name: row.name ?? row.full_name ?? "Sin nombre",
  };
}

export async function loadBranchDocumentSource(
  supabase: ReportSupabaseClient,
  branch: Pick<BranchReportBranch, "id" | "companyId">,
): Promise<BranchReportDocumentSource> {
  const [filesResult, productsResult, staffResult] = await Promise.all([
    supabase
      .from("branch_sanitary_document_files")
      .select(
        "id, branch_id, company_id, document_kind, chemical_product_id, staff_member_id, file_url, file_name, file_size_bytes, mime_type, metadata, expires_at, uploaded_at, updated_at",
      )
      .eq("branch_id", branch.id)
      .eq("company_id", branch.companyId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .returns<SanitaryDocumentFileRow[]>(),
    supabase
      .from("branch_chemical_products")
      .select("id, name")
      .eq("branch_id", branch.id)
      .eq("company_id", branch.companyId)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .returns<NamedEntityRow[]>(),
    supabase
      .from("branch_staff_members")
      .select("id, full_name")
      .eq("branch_id", branch.id)
      .eq("company_id", branch.companyId)
      .eq("is_active", true)
      .order("full_name", { ascending: true })
      .returns<NamedEntityRow[]>(),
  ]);

  if (filesResult.error) {
    throw new Error(filesResult.error.message);
  }

  if (productsResult.error) {
    throw new Error(productsResult.error.message);
  }

  if (staffResult.error) {
    throw new Error(staffResult.error.message);
  }

  return {
    files: filesResult.data?.map(mapDocumentFileRow) ?? [],
    chemicalProducts: productsResult.data?.map(mapNamedEntity) ?? [],
    staffMembers: staffResult.data?.map(mapNamedEntity) ?? [],
  };
}

export async function loadBranchReportPanelData(branch: Pick<BranchReportBranch, "id" | "companyId">): Promise<BranchReportPanelData> {
  const supabase = await getSupabaseRlsClient();

  if (!supabase) {
    return {
      documentCategories: [],
      historyCategories: [],
    };
  }

  const source = await loadBranchDocumentSource(supabase, branch);

  return {
    documentCategories: currentDocumentCategories.map((category) => {
      const bundle = buildCurrentCategoryBundle(source, category.id);
      return {
        id: category.id,
        title: category.title,
        availableFileCount: bundle.entries.length,
        countLabel: buildCurrentCategoryCountLabel(source, category.id),
      };
    }),
    historyCategories: historyDocumentCategories.map((category) => {
      const entries = getHistoricalEntries(source, category.id);
      return {
        id: category.id,
        title: category.title,
        availableFileCount: entries.length,
        countLabel: buildHistoricalCountLabel(source, category.id),
      };
    }),
  };
}

export function buildCurrentDocumentBundles(
  source: BranchReportDocumentSource,
  selectedCategoryIds: CurrentDocumentCategoryId[],
) {
  return selectedCategoryIds.map((categoryId) => buildCurrentCategoryBundle(source, categoryId));
}

export function buildHistoricalDocumentBundle(
  source: BranchReportDocumentSource,
  categoryId: HistoryDocumentCategoryId,
  range?: { from: string; to: string } | null,
): BranchReportDocumentBundle {
  const category = getHistoryDocumentCategory(categoryId);
  const entries = getHistoricalEntries(source, categoryId, range);

  return {
    id: categoryId,
    title: category.title,
    entries,
  };
}

function yesNo(value: boolean | null | undefined) {
  if (value === null || value === undefined) {
    return "No aplica";
  }

  return value ? "Sí" : "No";
}

function compliantLabel(value: boolean | null | undefined) {
  if (value === null || value === undefined) {
    return "No aplica";
  }

  return value ? "Cumple" : "No cumple";
}

function formatNumber(value: number | string | null | undefined, suffix = "") {
  if (value === null || value === undefined || value === "") {
    return "No registrado";
  }

  const parsed = Number(value);
  const display = Number.isFinite(parsed) ? parsed.toLocaleString("es-CO") : String(value);
  return suffix ? `${display} ${suffix}` : display;
}

function createOperationalRecord(
  id: string,
  recordedAt: string,
  fields: Array<{ label: string; value: string | null | undefined }>,
): OperationalReportRecord {
  return {
    id,
    recordedAt,
    fields: fields
      .filter((field) => field.value !== null && field.value !== undefined && field.value !== "")
      .map((field) => ({ label: field.label, value: field.value ?? "" })),
  };
}

function sortOperationalRecords(records: OperationalReportRecord[]) {
  return [...records].sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
}

function mapThermalRecord(row: ThermalControlRecordRow): OperationalReportRecord {
  return createOperationalRecord(row.id, row.fecha_hora_servidor, [
    { label: "Fecha y hora", value: formatDateTimeForDisplay(row.fecha_hora_servidor) },
    { label: "Responsable", value: row.operator_name },
    { label: "Equipo", value: row.equipment_name },
    {
      label: "Tipo de equipo",
      value: row.equipment_type === "freezer" ? "Congelador" : row.equipment_type === "refrigerator" ? "Refrigerador" : null,
    },
    { label: "Temperatura", value: formatNumber(row.temperature_c, "°C") },
    { label: "Resultado", value: compliantLabel(row.temperature_compliant) },
    { label: "Observaciones", value: row.observations },
  ]);
}

function mapAreaRecord(row: AreaSanitationRecordRow): OperationalReportRecord {
  return createOperationalRecord(row.id, row.fecha_hora_servidor, [
    { label: "Fecha y hora", value: formatDateTimeForDisplay(row.fecha_hora_servidor) },
    { label: "Responsable", value: row.operator_name },
    { label: "Área", value: row.area_name },
    { label: "Tipo de limpieza", value: row.cleaning_type },
    { label: "Implementos exclusivos", value: yesNo(row.used_exclusive_implements) },
    { label: "Químicos autorizados", value: yesNo(row.used_authorized_chemicals) },
    { label: "Resultado", value: compliantLabel(row.is_compliant) },
  ]);
}

function mapSupplyRecord(row: SupplyReceptionRecordRow): OperationalReportRecord {
  return createOperationalRecord(row.id, row.fecha_hora_servidor, [
    { label: "Fecha y hora", value: formatDateTimeForDisplay(row.fecha_hora_servidor) },
    { label: "Responsable", value: row.operator_name },
    { label: "Producto", value: row.product_name },
    { label: "Proveedor", value: row.provider_name },
    { label: "Fecha de vencimiento", value: row.expiration_date ? formatDateForDisplay(row.expiration_date) : null },
    { label: "Tipo de producto", value: row.product_type },
    { label: "Temperatura", value: row.temperature_c !== null ? formatNumber(row.temperature_c, "°C") : null },
    { label: "Temperatura", value: compliantLabel(row.temperature_compliant) },
    { label: "Empaque y fecha", value: yesNo(row.package_intact_date_valid) },
    { label: "Condición organoléptica", value: yesNo(row.organoleptic_adequate) },
    { label: "Decisión", value: row.decision },
    { label: "Observaciones", value: row.observations },
  ]);
}

function mapWaterRecord(row: WaterQualityRecordRow): OperationalReportRecord {
  return createOperationalRecord(row.id, row.fecha_hora_servidor, [
    { label: "Fecha y hora", value: formatDateTimeForDisplay(row.fecha_hora_servidor) },
    { label: "Responsable", value: row.operator_name },
    { label: "Cloro libre residual", value: formatNumber(row.chlorine_ppm, "ppm") },
    { label: "Cloro", value: compliantLabel(row.chlorine_compliant) },
    { label: "pH", value: formatNumber(row.ph_level) },
    { label: "pH", value: compliantLabel(row.ph_compliant) },
    { label: "Observaciones", value: row.observations },
  ]);
}

export async function loadOperationalReportSections({
  supabase,
  branch,
  formTypes,
  fromIso,
  toIso,
}: {
  supabase: ReportSupabaseClient;
  branch: Pick<BranchReportBranch, "id" | "companyId">;
  formTypes: OperationalFormType[];
  fromIso: string;
  toIso: string;
}): Promise<OperationalReportSection[]> {
  const sections: OperationalReportSection[] = [];
  const wants = (formType: OperationalFormType) => formTypes.includes(formType);

  if (wants("thermal_control")) {
    const { data, error } = await supabase
      .from("thermal_control_records")
      .select("id, fecha_hora_servidor, equipment_name, equipment_type, operator_name, temperature_c, temperature_compliant, observations")
      .eq("sede_id", branch.id)
      .eq("company_id", branch.companyId)
      .gte("fecha_hora_servidor", fromIso)
      .lte("fecha_hora_servidor", toIso)
      .order("fecha_hora_servidor", { ascending: true })
      .returns<ThermalControlRecordRow[]>();

    if (error) {
      throw new Error(error.message);
    }

    sections.push({
      formType: "thermal_control",
      title: operationalFormLabels.thermal_control.title,
      records: sortOperationalRecords(data?.map(mapThermalRecord) ?? []),
    });
  }

  if (wants("area_sanitation")) {
    const { data, error } = await supabase
      .from("area_sanitation_records")
      .select("id, fecha_hora_servidor, area_name, operator_name, cleaning_type, used_exclusive_implements, used_authorized_chemicals, is_compliant")
      .eq("sede_id", branch.id)
      .eq("company_id", branch.companyId)
      .gte("fecha_hora_servidor", fromIso)
      .lte("fecha_hora_servidor", toIso)
      .order("fecha_hora_servidor", { ascending: true })
      .returns<AreaSanitationRecordRow[]>();

    if (error) {
      throw new Error(error.message);
    }

    sections.push({
      formType: "area_sanitation",
      title: operationalFormLabels.area_sanitation.title,
      records: sortOperationalRecords(data?.map(mapAreaRecord) ?? []),
    });
  }

  if (wants("supply_reception")) {
    const { data, error } = await supabase
      .from("supply_reception_records")
      .select("id, fecha_hora_servidor, operator_name, product_name, provider_name, expiration_date, product_type, temperature_c, temperature_compliant, package_intact_date_valid, organoleptic_adequate, decision, observations")
      .eq("sede_id", branch.id)
      .eq("company_id", branch.companyId)
      .gte("fecha_hora_servidor", fromIso)
      .lte("fecha_hora_servidor", toIso)
      .order("fecha_hora_servidor", { ascending: true })
      .returns<SupplyReceptionRecordRow[]>();

    if (error) {
      throw new Error(error.message);
    }

    sections.push({
      formType: "supply_reception",
      title: operationalFormLabels.supply_reception.title,
      records: sortOperationalRecords(data?.map(mapSupplyRecord) ?? []),
    });
  }

  if (wants("water_quality")) {
    const { data, error } = await supabase
      .from("water_quality_records")
      .select("id, fecha_hora_servidor, operator_name, chlorine_ppm, chlorine_compliant, ph_level, ph_compliant, observations")
      .eq("sede_id", branch.id)
      .eq("company_id", branch.companyId)
      .gte("fecha_hora_servidor", fromIso)
      .lte("fecha_hora_servidor", toIso)
      .order("fecha_hora_servidor", { ascending: true })
      .returns<WaterQualityRecordRow[]>();

    if (error) {
      throw new Error(error.message);
    }

    sections.push({
      formType: "water_quality",
      title: operationalFormLabels.water_quality.title,
      records: sortOperationalRecords(data?.map(mapWaterRecord) ?? []),
    });
  }

  return sections;
}

export function getTotalOperationalRecords(sections: OperationalReportSection[]) {
  return sections.reduce((total, section) => total + section.records.length, 0);
}
