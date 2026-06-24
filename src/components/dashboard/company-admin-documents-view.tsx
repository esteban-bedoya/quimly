"use client";

import { useCallback, useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";

import {
  archiveBranchChemicalProductAction,
  archiveBranchSanitaryDocumentFileAction,
  archiveBranchStaffMemberAction,
  saveBranchChemicalProductAction,
  saveBranchSanitaryDocumentFileAction,
  saveBranchStaffMemberAction,
} from "@/app/dashboard/actions";
import type {
  BranchChemicalProductSummary,
  BranchSanitaryDocumentCategoryStatusMap,
  BranchSanitaryDocumentStatusColor,
  BranchSanitaryDocumentFileSummary,
  BranchSanitaryDocumentKind,
  BranchStaffMemberSummary,
} from "@/types/auth";
import { DatePicker } from "@/components/ui/date-time-picker";

const BASE_MAX_FILE_SIZE_BYTES = 1.5 * 1024 * 1024;
const SANITATION_PLAN_MAX_FILE_SIZE_BYTES = 6 * 1024 * 1024;
const ACTION_MESSAGE_AUTO_DISMISS_MS = 8000;
const DOCUMENTS_HOME_EVENT = "quimly:documents-home";
const DOCUMENT_DATE_INPUT_LABEL = "Fecha expedición";
const DOCUMENT_VALIDITY_INPUT_LABEL = "Vigencia";
const DOCUMENT_DATE_PDF_REQUIRED_MESSAGE = "Para asignar la fecha debe subir el PDF";
const DOCUMENT_VALIDITY_PDF_REQUIRED_MESSAGE = "Para asignar la vigencia debe subir el PDF";
const DOCUMENT_FUTURE_DATE_ERROR_MESSAGE = "La fecha de expedición no puede ser mayor a la fecha actual.";
const DOCUMENT_VALIDITY_OPTIONS = ["1", "2", "3", "6", "12", "24"] as const;
const DEFAULT_STAFF_VALIDITY_MONTHS = "12";
const REQUIRED_NAME_ERROR_INPUT_CLASS =
  "!border-rose-500 !bg-rose-50 !shadow-[0_0_0_3px_rgb(244_63_94_/_0.18),0_10px_24px_rgb(18_17_15_/_0.07)]";

type UploadedPdf = {
  id: string;
  name: string;
  size: number;
  selectedAt: string;
  previewUrl: string | null;
  sourceFile?: File;
  isObjectUrl?: boolean;
};

type FileInputState = {
  file: UploadedPdf | null;
  error: string | null;
};

type DocumentSectionId =
  | "sanitation_plan"
  | "chemical_products"
  | "pest_control"
  | "water_tank_cleaning"
  | "acu_final_disposal"
  | "staff_records";

type DocumentSectionMeta = {
  id: DocumentSectionId;
  title: string;
  description: string;
};

type DocumentMenuItem = {
  sectionId: DocumentSectionId;
  title: string;
};

type DocumentMenuBadgeState = {
  label: string;
  tone?: "neutral" | "success" | "warning" | "danger";
};

type DocumentStatus = "Al día" | "Vigente" | "Archivo" | "Vencido" | "Incompleto" | "Sin registro" | "Completo";

type SanitationPlanRecord = {
  id: string;
  name: string;
  pdf: UploadedPdf;
  updatedAt: string;
};

type DatedDocumentRecord = {
  id: string;
  issuedAt: string;
  expiresAt: string;
  validityMonths: string;
  updatedAt: string;
  pdf: UploadedPdf | null;
};

type AcuCollectionRecord = {
  id: string;
  collectedAt: string;
  pdf: UploadedPdf;
  updatedAt: string;
};

type ChemicalProductRecord = {
  id: string;
  name: string;
  technicalSheet: FileInputState;
  safetySheet: FileInputState;
  updatedAt: string;
};

type StaffRecord = {
  id: string;
  fullName: string;
  foodHandlingIssuedAt: string;
  foodHandlingExpiresAt: string;
  foodHandlingValidityMonths: string;
  foodHandlingPdf: FileInputState;
  medicalExamIssuedAt: string;
  medicalExamExpiresAt: string;
  medicalExamValidityMonths: string;
  medicalExamPdf: FileInputState;
  updatedAt: string;
};

type DocumentFormData = {
  editingId: string | null;
  pdf: FileInputState;
  issuedAt: string;
  validityMonths: string;
  collectedAt: string;
  productName: string;
  technicalSheet: FileInputState;
  safetySheet: FileInputState;
  fullName: string;
  foodHandlingIssuedAt: string;
  foodHandlingValidityMonths: string;
  foodHandlingDateMessage: string;
  foodHandlingPdf: FileInputState;
  medicalExamIssuedAt: string;
  medicalExamValidityMonths: string;
  medicalExamDateMessage: string;
  medicalExamPdf: FileInputState;
};

type AdminMessage = {
  tone: "success" | "error";
  text: string;
};

type RequiredNameField = "productName" | "fullName";

type DeleteConfirmation = {
  onConfirm: () => void;
};

const DOCUMENT_SECTIONS: DocumentSectionMeta[] = [
  {
    id: "sanitation_plan",
    title: "Plan de saneamiento básico",
    description:
      "Administre el soporte normativo unificado que integra los cuatro programas de control sanitario: limpieza, plagas, residuos y agua potable.",
  },
  {
    id: "chemical_products",
    title: "Fichas de productos químicos",
    description:
      "Administre los soportes normativos por producto químico: fichas técnicas y hojas de seguridad.",
  },
  {
    id: "pest_control",
    title: "Certificado de control de plagas",
    description: "Administre los soportes normativos de los certificados de fumigación.",
  },
  {
    id: "water_tank_cleaning",
    title: "Certificado de lavado de tanques de agua potable",
    description: "Administre los soportes normativos de los certificados de lavado y desinfección de tanques de agua.",
  },
  {
    id: "acu_final_disposal",
    title: "Certificado disposición final de aceites (ACU)",
    description:
      "Administre los soportes normativos de los certificados de recolección emitidos por cada entrega de aceite de cocina usado (ACU).",
  },
  {
    id: "staff_records",
    title: "Fichas de colaboradores",
    description:
      "Administre los soportes normativos por colaborador: curso de manipulación de alimentos y exámenes médicos de aptitud.",
  },
];

const DOCUMENT_MENU_ITEMS: DocumentMenuItem[] = [
  {
    sectionId: "sanitation_plan",
    title: "Plan de saneamiento básico (limpieza, plagas, residuos y agua potable)",
  },
  {
    sectionId: "pest_control",
    title: "Certificado de control de plagas",
  },
  {
    sectionId: "water_tank_cleaning",
    title: "Certificado de lavado de tanques de agua potable",
  },
  {
    sectionId: "acu_final_disposal",
    title: "Certificado disposición final de aceites (ACU)",
  },
  {
    sectionId: "staff_records",
    title: "Fichas de colaboradores (cursos manipulación de alimentos y exámenes de aptitud médica)",
  },
  {
    sectionId: "chemical_products",
    title: "Fichas de productos químicos (fichas técnicas y hojas de seguridad)",
  },
];

const DOCUMENT_REGISTER_ACTION_LABELS: Record<DocumentSectionId, { create: string; replace?: string }> = {
  sanitation_plan: {
    create: "Agregar plan",
    replace: "Reemplazar plan",
  },
  chemical_products: {
    create: "Agregar producto",
  },
  pest_control: {
    create: "Agregar certificado",
  },
  water_tank_cleaning: {
    create: "Agregar certificado",
  },
  acu_final_disposal: {
    create: "Agregar certificado",
  },
  staff_records: {
    create: "Agregar colaborador",
  },
};

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 100000)}`;
}

function formatFileSize(size: number) {
  const megabytes = size / (1024 * 1024);
  return `${megabytes.toFixed(megabytes >= 1 ? 1 : 2)} MB`;
}

function formatFileLimitLabel(size: number) {
  return formatFileSize(size);
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return "Fecha no disponible";
  }

  const day = new Intl.DateTimeFormat("es-CO", { day: "2-digit" }).format(date);
  const month = new Intl.DateTimeFormat("es-CO", { month: "short" }).format(date).replace(".", "");
  const year = new Intl.DateTimeFormat("es-CO", { year: "numeric" }).format(date);

  return `${day} ${month} ${year}`;
}

function formatDateInputValue(value: string) {
  if (!value) {
    return "";
  }

  const [year, month, day] = value.split("-");

  if (!year || !month || !day) {
    return "";
  }

  return `${day}/${month}/${year}`;
}

function getTodayDateValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function isFutureDocumentDate(value: string) {
  return Boolean(value && value > getTodayDateValue());
}

function createEmptyFileState(): FileInputState {
  return {
    file: null,
    error: null,
  };
}

function createEmptyDocumentFormData(): DocumentFormData {
  return {
    editingId: null,
    pdf: createEmptyFileState(),
    issuedAt: "",
    validityMonths: "3",
    collectedAt: "",
    productName: "",
    technicalSheet: createEmptyFileState(),
    safetySheet: createEmptyFileState(),
    fullName: "",
    foodHandlingIssuedAt: "",
    foodHandlingValidityMonths: DEFAULT_STAFF_VALIDITY_MONTHS,
    foodHandlingDateMessage: "",
    foodHandlingPdf: createEmptyFileState(),
    medicalExamIssuedAt: "",
    medicalExamValidityMonths: DEFAULT_STAFF_VALIDITY_MONTHS,
    medicalExamDateMessage: "",
    medicalExamPdf: createEmptyFileState(),
  };
}

function revokeUploadedPdf(file: UploadedPdf | null) {
  if (!file?.previewUrl || !file.isObjectUrl) {
    return;
  }

  URL.revokeObjectURL(file.previewUrl);
}

function addMonthsToDate(value: string, months: number) {
  if (!value) {
    return "";
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  date.setMonth(date.getMonth() + months);

  return date.toISOString().slice(0, 10);
}

function getValidityMonthsNumber(value: string) {
  const months = Number(value);
  return Number.isFinite(months) && months > 0 ? months : 0;
}

function getValidityOptionBaseLabel(value: string) {
  const months = getValidityMonthsNumber(value);
  return months === 1 ? "1 mes" : `${months} meses`;
}

function getValidityOptionLabel(value: string, suggestedMonths: string) {
  const label = getValidityOptionBaseLabel(value);
  return value === suggestedMonths ? `${label} (Sugerido)` : label;
}

function getCalculatedExpirationDate(issuedAt: string, validityMonths: string) {
  return addMonthsToDate(issuedAt, getValidityMonthsNumber(validityMonths));
}

function getDateStatus(expiresAt: string): DocumentStatus {
  if (!expiresAt) {
    return "Sin registro";
  }

  return isExpired(expiresAt) ? "Vencido" : "Al día";
}

function getDatedRecordStatus(record: DatedDocumentRecord): DocumentStatus {
  if (!record.pdf) {
    return "Sin registro";
  }

  return getDateStatus(record.expiresAt);
}

function getAcuRecordStatus(recordIndex: number): DocumentStatus {
  return recordIndex === 0 ? "Vigente" : "Archivo";
}

function getProductStatus(product: ChemicalProductRecord): DocumentStatus {
  return product.technicalSheet.file && product.safetySheet.file ? "Completo" : "Incompleto";
}

function getStaffStatusBadges(record: StaffRecord): DocumentStatus[] {
  const hasCourse = Boolean(record.foodHandlingPdf.file);
  const hasMedicalExam = Boolean(record.medicalExamPdf.file);
  const courseExpired = hasCourse && isExpired(record.foodHandlingExpiresAt);
  const medicalExamExpired = hasMedicalExam && isExpired(record.medicalExamExpiresAt);
  const isIncomplete = !hasCourse || !hasMedicalExam || !record.foodHandlingIssuedAt || !record.medicalExamIssuedAt;

  if (!hasCourse && !hasMedicalExam) {
    return ["Sin registro"];
  }

  if (courseExpired || medicalExamExpired) {
    return isIncomplete ? ["Vencido", "Incompleto"] : ["Vencido"];
  }

  if (isIncomplete) {
    return ["Incompleto"];
  }

  return ["Al día"];
}

function getDocumentDateTime(value: string) {
  const time = Date.parse(`${value}T00:00:00`);
  return Number.isNaN(time) ? 0 : time;
}

function getDocumentTimestamp(value: string) {
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

function sortDatedRecordsByIssuedAt(records: DatedDocumentRecord[]) {
  return [...records].sort((leftRecord, rightRecord) => {
    return getDocumentDateTime(rightRecord.issuedAt) - getDocumentDateTime(leftRecord.issuedAt);
  });
}

function sortAcuHistoryByCollectedAt(records: AcuCollectionRecord[]) {
  return [...records].sort((leftRecord, rightRecord) => {
    const collectedAtDelta = getDocumentDateTime(rightRecord.collectedAt) - getDocumentDateTime(leftRecord.collectedAt);

    if (collectedAtDelta !== 0) {
      return collectedAtDelta;
    }

    return getDocumentTimestamp(rightRecord.updatedAt) - getDocumentTimestamp(leftRecord.updatedAt);
  });
}

function getMenuBadgeFromStatusColor(statusColor: BranchSanitaryDocumentStatusColor): DocumentMenuBadgeState {
  const badgeByColor = {
    gris: { label: "Sin registro", tone: "neutral" },
    rojo: { label: "Vencido", tone: "danger" },
    amarillo: { label: "Incompleto", tone: "warning" },
    verde: { label: "Al día", tone: "success" },
  } satisfies Record<BranchSanitaryDocumentStatusColor, DocumentMenuBadgeState>;

  return badgeByColor[statusColor];
}

function getMetadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" ? value : "";
}

function getMetadataValidityMonths(metadata: Record<string, unknown>, fallback: string) {
  const value = metadata.validityMonths;

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "string" && value) {
    return value;
  }

  return fallback;
}

function toStoredPdf(file: BranchSanitaryDocumentFileSummary): UploadedPdf {
  return {
    id: file.id,
    name: file.fileName,
    size: file.fileSizeBytes,
    selectedAt: file.uploadedAt,
    previewUrl: file.fileUrl,
  };
}

function toFileState(file: BranchSanitaryDocumentFileSummary | null | undefined): FileInputState {
  return {
    file: file ? toStoredPdf(file) : null,
    error: null,
  };
}

function findLatestFile(
  files: BranchSanitaryDocumentFileSummary[],
  documentKind: BranchSanitaryDocumentKind,
  owner: { chemicalProductId?: string | null; staffMemberId?: string | null } = {},
) {
  return (
    files.find((file) => {
      if (file.documentKind !== documentKind || !file.isActive) {
        return false;
      }

      if ("chemicalProductId" in owner && file.chemicalProductId !== owner.chemicalProductId) {
        return false;
      }

      if ("staffMemberId" in owner && file.staffMemberId !== owner.staffMemberId) {
        return false;
      }

      return true;
    }) ?? null
  );
}

function buildSanitationPlanRecord(files: BranchSanitaryDocumentFileSummary[]): SanitationPlanRecord | null {
  const file = findLatestFile(files, "sanitation_plan");

  if (!file) {
    return null;
  }

  return {
    id: file.id,
    name: "Plan de saneamiento básico",
    pdf: toStoredPdf(file),
    updatedAt: file.updatedAt,
  };
}

function buildDatedRecords(
  files: BranchSanitaryDocumentFileSummary[],
  documentKind: "pest_control_certificate" | "water_tank_cleaning_certificate",
): DatedDocumentRecord[] {
  const records = files
    .filter((file) => file.documentKind === documentKind && file.isActive)
    .map((file) => ({
      id: file.id,
      issuedAt: getMetadataString(file.metadata, "issuedAt"),
      expiresAt: file.expiresAt ?? "",
      validityMonths: getMetadataValidityMonths(file.metadata, documentKind === "pest_control_certificate" ? "3" : "6"),
      updatedAt: file.updatedAt,
      pdf: toStoredPdf(file),
    }));

  return sortDatedRecordsByIssuedAt(records);
}

function buildAcuHistory(files: BranchSanitaryDocumentFileSummary[]): AcuCollectionRecord[] {
  const records = files
    .filter((file) => file.documentKind === "acu_final_disposal_certificate" && file.isActive)
    .map((file) => ({
      id: file.id,
      collectedAt: getMetadataString(file.metadata, "collectedAt"),
      pdf: toStoredPdf(file),
      updatedAt: file.updatedAt,
    }));

  return sortAcuHistoryByCollectedAt(records);
}

function buildChemicalProductRecords(
  products: BranchChemicalProductSummary[],
  files: BranchSanitaryDocumentFileSummary[],
): ChemicalProductRecord[] {
  return products.map((product) => ({
    id: product.id,
    name: product.name,
    technicalSheet: toFileState(findLatestFile(files, "chemical_technical_sheet", { chemicalProductId: product.id })),
    safetySheet: toFileState(findLatestFile(files, "chemical_safety_sheet", { chemicalProductId: product.id })),
    updatedAt: product.updatedAt,
  }));
}

function buildStaffRecords(
  staffMembers: BranchStaffMemberSummary[],
  files: BranchSanitaryDocumentFileSummary[],
): StaffRecord[] {
  return staffMembers.map((staffMember) => {
    const foodHandlingFile = findLatestFile(files, "food_handling_course", { staffMemberId: staffMember.id });
    const medicalExamFile = findLatestFile(files, "medical_fitness_exam", { staffMemberId: staffMember.id });

    return {
      id: staffMember.id,
      fullName: staffMember.fullName,
      foodHandlingIssuedAt: foodHandlingFile ? getMetadataString(foodHandlingFile.metadata, "issuedAt") : "",
      foodHandlingExpiresAt: foodHandlingFile?.expiresAt ?? "",
      foodHandlingValidityMonths: foodHandlingFile
        ? getMetadataValidityMonths(foodHandlingFile.metadata, DEFAULT_STAFF_VALIDITY_MONTHS)
        : DEFAULT_STAFF_VALIDITY_MONTHS,
      foodHandlingPdf: toFileState(foodHandlingFile),
      medicalExamIssuedAt: medicalExamFile ? getMetadataString(medicalExamFile.metadata, "issuedAt") : "",
      medicalExamExpiresAt: medicalExamFile?.expiresAt ?? "",
      medicalExamValidityMonths: medicalExamFile
        ? getMetadataValidityMonths(medicalExamFile.metadata, DEFAULT_STAFF_VALIDITY_MONTHS)
        : DEFAULT_STAFF_VALIDITY_MONTHS,
      medicalExamPdf: toFileState(medicalExamFile),
      updatedAt: staffMember.updatedAt,
    };
  });
}

function validatePdfFile(file: File, maxSizeBytes: number): FileInputState {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  if (!isPdf) {
    return {
      file: null,
      error: "Solo se permiten archivos PDF.",
    };
  }

  if (file.size > maxSizeBytes) {
    return {
      file: null,
      error: `El PDF no puede superar ${formatFileSize(maxSizeBytes)}.`,
    };
  }

  return {
    file: {
      id: createId("pdf"),
      name: file.name,
      size: file.size,
      selectedAt: new Date().toISOString(),
      previewUrl: URL.createObjectURL(file),
      sourceFile: file,
      isObjectUrl: true,
    },
    error: null,
  };
}

function isExpired(expiresAt: string) {
  if (!expiresAt) {
    return false;
  }

  const expirationDate = new Date(`${expiresAt}T00:00:00`);
  const today = new Date();
  const todayAtMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

  return expirationDate.getTime() < todayAtMidnight;
}

function formatExpirationDetail(expiresAt: string | null | undefined) {
  if (!expiresAt) {
    return "Vence: sin fecha";
  }

  return `${isExpired(expiresAt) ? "Vencido" : "Vence"}: ${formatDate(expiresAt)}`;
}

function DocumentMenuBadge({ badge }: { badge: DocumentMenuBadgeState }) {
  const tone = badge.tone ?? "neutral";
  const dotClassName = {
    neutral: "bg-gray-400",
    success: "bg-green-500",
    warning: "bg-amber-500",
    danger: "bg-red-500",
  }[tone];
  const pingClassName = {
    neutral: "",
    success: "bg-green-400",
    warning: "bg-amber-400",
    danger: "bg-red-400",
  }[tone];

  return (
    <span className="relative flex h-2.5 w-2.5" aria-label={badge.label} role="img">
      {pingClassName ? (
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${pingClassName}`} />
      ) : null}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${dotClassName}`} />
    </span>
  );
}

function formatCountLabel(count: number, singularLabel: string, pluralLabel: string, singularAction: string, pluralAction: string) {
  return `${count} ${count === 1 ? singularLabel : pluralLabel} ${count === 1 ? singularAction : pluralAction}`;
}

function formatStoredRecordCount(sectionId: DocumentSectionId, count: number) {
  if (sectionId === "sanitation_plan") {
    return formatCountLabel(count, "plan", "planes", "almacenado", "almacenados");
  }

  if (sectionId === "staff_records") {
    return formatCountLabel(count, "colaborador", "colaboradores", "registrado", "registrados");
  }

  if (sectionId === "chemical_products") {
    return formatCountLabel(count, "producto", "productos", "registrado", "registrados");
  }

  return formatCountLabel(count, "certificado", "certificados", "almacenado", "almacenados");
}

function getDocumentRegisterActionLabel(sectionId: DocumentSectionId, hasExistingRecord = false) {
  return `+ ${getDocumentRegisterModalLabel(sectionId, hasExistingRecord)}`;
}

function getDocumentRegisterModalLabel(sectionId: DocumentSectionId, hasExistingRecord = false) {
  const labels = DOCUMENT_REGISTER_ACTION_LABELS[sectionId];
  return hasExistingRecord && labels.replace ? labels.replace : labels.create;
}

function DocumentMenuCard({
  item,
  badge,
  countLabel,
  onSelect,
}: {
  item: DocumentMenuItem;
  badge: DocumentMenuBadgeState;
  countLabel: string;
  onSelect: (sectionId: DocumentSectionId) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item.sectionId)}
      className="flex w-full cursor-pointer items-start justify-between gap-4 border-b border-gray-200 px-6 py-4 text-left transition-colors last:border-none hover:bg-gray-50/70 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#2a7f86]/20"
    >
      <span className="min-w-0">
        <span className="block font-medium text-[15px] text-gray-800">
          {item.title}
        </span>
        <span className="mt-1 block text-xs font-medium text-gray-400">{countLabel}</span>
      </span>
      <span className="shrink-0 pt-0.5">
        <DocumentMenuBadge badge={badge} />
      </span>
    </button>
  );
}

function DocumentsToolbar({ activeSectionConfig }: { activeSectionConfig: DocumentSectionMeta }) {
  return (
    <div className="operational-toolbar mt-3 mb-3 flex w-full justify-start sm:mt-4 sm:mb-4">
      <p className="operational-toolbar-copy w-full !max-w-none min-w-0 text-left">
        <strong className="font-semibold">{activeSectionConfig.title}</strong>
        <br />
        <span className="text-[0.92em]">{activeSectionConfig.description}</span>
      </p>
    </div>
  );
}

function DedicatedSectionScreen({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <section className="grid min-h-[70vh] gap-4 transition-all duration-300 ease-in-out">
      <article className="overflow-hidden rounded-2xl dashboard-card-surface">
        <div className="grid gap-5 p-4 sm:p-5">{children}</div>
      </article>
    </section>
  );
}

function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  const className = {
    "Al día": "bg-emerald-50 text-emerald-700 ring-emerald-100",
    Vigente: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    Archivo: "bg-gray-50 text-gray-500 ring-gray-100",
    Completo: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    Vencido: "bg-rose-50 text-rose-700 ring-rose-100",
    Incompleto: "bg-amber-50 text-amber-700 ring-amber-100",
    "Sin registro": "bg-gray-50 text-gray-500 ring-gray-100",
  }[status];

  return (
    <span className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${className}`}>
      {status}
    </span>
  );
}

function DocumentStatusBadges({ statuses }: { statuses: DocumentStatus[] }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {statuses.map((status) => (
        <DocumentStatusBadge key={status} status={status} />
      ))}
    </div>
  );
}

function CompactPdfInput({
  id,
  label,
  state,
  onChange,
  maxSizeBytes = BASE_MAX_FILE_SIZE_BYTES,
  onOpenRequest,
}: {
  id: string;
  label: string;
  state: FileInputState;
  onChange: (state: FileInputState) => void;
  maxSizeBytes?: number;
  onOpenRequest?: () => boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="grid min-w-0 gap-2">
      <input
        ref={fileInputRef}
        id={id}
        type="file"
        accept="application/pdf"
        aria-label={label}
        className="hidden"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0] ?? null;

          if (!file) {
            return;
          }

          onChange(validatePdfFile(file, maxSizeBytes));
          event.currentTarget.value = "";
        }}
      />
      <div className="ui-document-file-control">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gray-800">
            {state.file ? state.file.name : "Seleccionar archivo"}
          </p>
          <p className="text-xs text-gray-400">
            PDF · Máx {formatFileLimitLabel(maxSizeBytes)}
          </p>
        </div>
        <button
          type="button"
          aria-label={state.file ? "Cambiar PDF" : "Subir PDF"}
          onClick={() => {
            if (onOpenRequest?.() === false) {
              return;
            }

            fileInputRef.current?.click();
          }}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#12110f] text-white transition hover:scale-110 hover:bg-[#1d1b18]"
        >
          <UploadFileIcon />
        </button>
      </div>
      {state.error ? <p className="ui-inline-alert ui-inline-alert-error">{state.error}</p> : null}
    </div>
  );
}

function UploadFileIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className="h-5 w-5 shrink-0"
    >
      <path
        d="M6.25 16.25h7.5A2.25 2.25 0 0 0 16 14v-1.25"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="M10 12.75V4.25m0 0L6.75 7.5M10 4.25l3.25 3.25"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="M4.75 11.25v3A1.75 1.75 0 0 0 6.5 16h7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function DocumentUploadField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <article className="rounded-[1.45rem] p-5 text-left dashboard-card-surface dashboard-card-surface-operational">
      <div className="space-y-3">
        <p className="text-sm font-semibold leading-5 tracking-[0.08em] text-[#12110f]">{label}</p>
        <div className="grid gap-3">{children}</div>
      </div>
    </article>
  );
}

function DocumentModalDivider({ className = "" }: { className?: string }) {
  return <div className={`border-t border-[#12110f]/[0.12] ${className}`} />;
}

function DocumentDateInput({
  value,
  onChange,
  onOpenRequest,
  max = getTodayDateValue(),
}: {
  value: string;
  onChange: (value: string) => void;
  onOpenRequest?: () => boolean;
  max?: string;
}) {
  const displayValue = formatDateInputValue(value);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [pickerPosition, setPickerPosition] = useState<{ left: number; top: number; width: number } | null>(null);

  const updatePickerPosition = useCallback(() => {
    const trigger = triggerRef.current;

    if (!trigger) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const pickerWidth = Math.min(284, window.innerWidth - 24);
    const estimatedPickerHeight = 292;
    const bottomTop = rect.bottom + 8;
    const top = bottomTop + estimatedPickerHeight > window.innerHeight ? rect.top - estimatedPickerHeight - 8 : bottomTop;

    setPickerPosition({
      left: Math.min(Math.max(12, rect.left), window.innerWidth - pickerWidth - 12),
      top: Math.max(12, top),
      width: pickerWidth,
    });
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    updatePickerPosition();

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;

      if (triggerRef.current?.contains(target) || pickerRef.current?.contains(target)) {
        return;
      }

      setIsOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("resize", updatePickerPosition);
    window.addEventListener("scroll", updatePickerPosition, true);
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("resize", updatePickerPosition);
      window.removeEventListener("scroll", updatePickerPosition, true);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, updatePickerPosition]);

  return (
    <div className="ui-document-date-field">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => {
          if (onOpenRequest?.() === false) {
            setIsOpen(false);
            return;
          }

          updatePickerPosition();
          setIsOpen((currentValue) => !currentValue);
        }}
        className={`ui-form-control flex items-center text-left ${displayValue ? "" : "text-[#a0a7ad]"}`}
      >
        {displayValue || "DD/MM/AAAA"}
      </button>
      {isOpen && pickerPosition && typeof document !== "undefined" ? createPortal(
        <>
          <div
            className="fixed inset-0 z-[130] bg-[#12110f]/10 backdrop-blur-sm"
            role="presentation"
            onMouseDown={() => setIsOpen(false)}
          />
          <div
            ref={pickerRef}
            style={{
              left: pickerPosition.left,
              top: pickerPosition.top,
              width: pickerPosition.width,
            }}
            className="fixed z-[140]"
          >
            <DatePicker
              compact
              value={value}
              max={max}
              onChange={(nextValue) => {
                onChange(nextValue);
                setIsOpen(false);
              }}
            />
          </div>
        </>,
        document.body,
      ) : null}
    </div>
  );
}

function DocumentValiditySelect({
  value,
  suggestedMonths,
  onChange,
  onOpenRequest,
}: {
  value: string;
  suggestedMonths: string;
  onChange: (value: string) => void;
  onOpenRequest?: () => boolean;
}) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number; width: number } | null>(null);

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;

    if (!trigger) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const estimatedMenuHeight = DOCUMENT_VALIDITY_OPTIONS.length * 38 + 12;
    const bottomTop = rect.bottom + 6;
    const top = bottomTop + estimatedMenuHeight > window.innerHeight ? rect.top - estimatedMenuHeight - 6 : bottomTop;

    setMenuPosition({
      left: rect.left,
      top: Math.max(12, top),
      width: rect.width,
    });
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    updateMenuPosition();

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (!containerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };

    const handleViewportChange = () => updateMenuPosition();

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [isOpen, updateMenuPosition]);

  const selectedLabel = getValidityOptionLabel(value, suggestedMonths);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        onClick={() => {
          if (onOpenRequest?.() === false) {
            setIsOpen(false);
            return;
          }

          setIsOpen((currentValue) => !currentValue);
        }}
        className="neutral-select-trigger min-h-11"
      >
        <span>{selectedLabel}</span>
        <svg
          viewBox="0 0 12 12"
          className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        >
          <path
            d="M2.25 4.5 6 8.25 9.75 4.5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      </button>

      {isOpen && menuPosition && typeof document !== "undefined" ? createPortal(
        <div
          ref={menuRef}
          id={listboxId}
          role="listbox"
          aria-label={DOCUMENT_VALIDITY_INPUT_LABEL}
          className="neutral-select-menu fixed"
          style={{
            left: menuPosition.left,
            top: menuPosition.top,
            width: menuPosition.width,
          }}
        >
          {DOCUMENT_VALIDITY_OPTIONS.map((optionValue) => {
            const isSelected = value === optionValue;
            const isSuggested = optionValue === suggestedMonths;
            const optionLabel = getValidityOptionLabel(optionValue, suggestedMonths);

            return (
              <button
                key={optionValue}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(optionValue);
                  setIsOpen(false);
                }}
                className={[
                  "neutral-select-option",
                  isSuggested ? "neutral-select-option-suggested" : "",
                  isSelected ? "neutral-select-option-selected" : "",
                ].join(" ")}
              >
                <span>{isSelected ? `✓ ${optionLabel}` : optionLabel}</span>
              </button>
            );
          })}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

function DocumentRegisterModal({
  children,
  title,
  titleClassName = "text-sm font-semibold uppercase leading-5 tracking-[0.08em] text-[#12110f]",
  message,
  onCancel,
  onSubmit,
  disabled,
  submitLabel = "Guardar registro",
  maxWidthClassName = "max-w-lg",
}: {
  children: ReactNode;
  title: string;
  titleClassName?: string;
  message?: AdminMessage | null;
  onCancel: () => void;
  onSubmit: () => void;
  disabled?: boolean;
  submitLabel?: string;
  maxWidthClassName?: string;
}) {
  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex min-h-screen w-screen items-center justify-center bg-[#12110f]/40 px-4 py-6 backdrop-blur-md">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        className={`ui-document-modal ui-modal-surface w-full ${maxWidthClassName} max-h-[calc(100vh-3rem)] overflow-y-auto rounded-[1.7rem] p-6 text-left transition-all duration-300 ease-in-out animate-fadeIn`}
        aria-modal="true"
        role="dialog"
      >
        <div className="space-y-2">
          <h3 className={titleClassName}>{title.toLocaleUpperCase("es-CO")}</h3>
        </div>

        <div className="mt-4 grid gap-3">{children}</div>

        {message ? (
          <div className="mt-4">
            <ActionMessage message={message} />
          </div>
        ) : null}

        <DocumentModalDivider className="mt-5" />

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="ui-pill-button-secondary ui-modal-action-secondary"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={disabled}
            className="ui-pill-button-primary ui-modal-action-primary min-h-11 px-5 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

function DocumentDeleteConfirmationModal({
  isDeleting,
  onCancel,
  onConfirm,
}: {
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex min-h-screen w-screen items-center justify-center bg-[#12110f]/40 px-4 backdrop-blur-md">
      <div className="ui-modal-surface w-full max-w-md rounded-[1.7rem] p-6">
        <div className="space-y-3">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#f2e4e0] text-[#7b5750]">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
              <path
                d="M9 3.75h6m-8.25 3h10.5m-9.75 0 .75 11.25a1.5 1.5 0 0 0 1.5 1.4h4.5a1.5 1.5 0 0 0 1.5-1.4l.75-11.25m-6 2.25v6.75m3-6.75v6.75"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              />
            </svg>
          </div>
          <div className="space-y-2">
            <h3 className="ui-modal-title">¿Eliminar?</h3>
            <div className="ui-modal-copy space-y-3">
              <p>Si eliminas este registro ya no se podrá restaurar.</p>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="ui-pill-button-secondary ui-modal-action-secondary"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="ui-pill-button-danger w-full sm:w-auto"
          >
            {isDeleting ? "Eliminando..." : "Confirmar eliminación"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function RegisterControl({
  isRegistering,
  actionLabel,
  onStart,
  onCancel,
}: {
  isRegistering: boolean;
  actionLabel: string;
  onStart: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex justify-end">
      {isRegistering ? (
        <button
          type="button"
          onClick={onCancel}
          className="self-start text-gray-400 hover:text-gray-600 text-sm font-medium transition-colors sm:self-auto"
        >
          - Cancelar registro
        </button>
      ) : (
        <button type="button" onClick={onStart} className="ui-pill-button-primary min-h-11 px-5">
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function ActionMessage({ message }: { message: AdminMessage }) {
  const className =
    message.tone === "success"
      ? "border-emerald-100 bg-emerald-50 text-emerald-700"
      : "border-rose-100 bg-rose-50 text-rose-700";

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm font-medium ${className}`}>
      {message.text}
    </div>
  );
}

function RecordsList({
  children,
  emptyLabel = "No hay registros cargados.",
}: {
  children: ReactNode;
  emptyLabel?: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      {children ? (
        children
      ) : (
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 transition-colors last:border-none hover:bg-gray-50/70">
          <span className="text-sm text-gray-500">{emptyLabel}</span>
          <DocumentStatusBadge status="Sin registro" />
        </div>
      )}
    </div>
  );
}

function RecordRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-4 transition-colors last:border-none hover:bg-gray-50/70">
      {children}
    </div>
  );
}

function RecordActions({ children }: { children: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col items-end gap-2 text-right">
      <RecordActionsMenu>{children}</RecordActionsMenu>
    </div>
  );
}

function RecordActionsMenu({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (!containerRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative -mt-1 flex justify-end">
      {isOpen ? (
        <div
          className="absolute right-full top-1/2 mr-1 flex -translate-y-1/2 items-center gap-1 rounded-full border border-gray-200 bg-white/95 p-1 shadow-[0_10px_24px_rgba(18,17,15,0.12)] backdrop-blur-sm"
        >
          {children}
        </div>
      ) : null}
      <button
        type="button"
        aria-label={isOpen ? "Cerrar acciones" : "Abrir acciones"}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((currentValue) => !currentValue)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition duration-200 ease-out hover:scale-110 hover:bg-gray-100 hover:text-gray-700"
      >
        <EllipsisIcon />
      </button>
    </div>
  );
}

function DeleteRecordButton({
  label = "Eliminar registro",
  disabled,
  onClick,
}: {
  label?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-500 transition duration-200 ease-out hover:scale-110 hover:bg-rose-50 hover:text-rose-500 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:scale-100 disabled:hover:bg-transparent"
    >
      <TrashIcon />
    </button>
  );
}

function EditRecordButton({ label = "Editar registro", onClick }: { label?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-500 transition duration-200 ease-out hover:scale-110 hover:bg-gray-100 hover:text-gray-700"
    >
      <EditIcon />
    </button>
  );
}

function EllipsisIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className="h-6 w-6 shrink-0"
    >
      <path
        d="M5 10h.01M10 10h.01M15 10h.01"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.6"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className="h-5.5 w-5.5 shrink-0"
    >
      <path
        d="M7.5 4.75h5m-7.25 2h9.5m-8.5 0 .55 8.2a1.5 1.5 0 0 0 1.5 1.4h3.4a1.5 1.5 0 0 0 1.5-1.4l.55-8.2M8.75 9.25v4.25m2.5-4.25v4.25"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.55"
      />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className="h-5.5 w-5.5 shrink-0"
    >
      <path
        d="M5.25 14.75h2.2l6.7-6.7a1.56 1.56 0 0 0-2.2-2.2l-6.7 6.7v2.2Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.55"
      />
      <path
        d="m10.95 6.85 2.2 2.2M4.75 16.25h10.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.55"
      />
    </svg>
  );
}

function ExternalPdfIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className={`h-4 w-4 shrink-0 ${className}`}
    >
      <path
        d="M7.5 5.5H5.75A1.75 1.75 0 0 0 4 7.25v7A1.75 1.75 0 0 0 5.75 16h7a1.75 1.75 0 0 0 1.75-1.75V12.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path
        d="M10.5 4H16v5.5M15.5 4.5l-7 7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function DocumentFileLink({
  file,
  label,
  detail,
}: {
  file: UploadedPdf | null;
  label: string;
  detail?: string;
}) {
  if (!file?.previewUrl) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400">
        <ExternalPdfIcon className="invisible" />
        <span>{label}</span>
        <span className="text-gray-400"> &middot; No registrado</span>
      </span>
    );
  }

  return (
    <a
      href={file.previewUrl}
      target="_blank"
      rel="noreferrer"
      className="inline-flex origin-left items-center gap-1 text-xs font-medium text-gray-500 transition duration-200 ease-out hover:scale-[1.035] hover:text-[#2a7f86]"
    >
      <ExternalPdfIcon />
      <span>{label}</span>
      {detail ? <span className="text-gray-400"> &middot; {detail}</span> : null}
    </a>
  );
}

type CompanyAdminDocumentsViewProps = {
  branchId: string;
  companySlug: string;
  branchSlug: string;
  initialChemicalProducts: BranchChemicalProductSummary[];
  initialStaffMembers: BranchStaffMemberSummary[];
  initialSanitaryDocumentFiles: BranchSanitaryDocumentFileSummary[];
  initialSanitaryDocumentCategoryStatuses: BranchSanitaryDocumentCategoryStatusMap;
};

export function CompanyAdminDocumentsView({
  branchId,
  companySlug,
  branchSlug,
  initialChemicalProducts,
  initialStaffMembers,
  initialSanitaryDocumentFiles,
  initialSanitaryDocumentCategoryStatuses,
}: CompanyAdminDocumentsViewProps) {
  const [activeSection, setActiveSection] = useState<DocumentSectionId | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isRegistering, setIsRegistering] = useState(false);
  const [formData, setFormData] = useState<DocumentFormData>(createEmptyDocumentFormData);
  const [actionMessage, setActionMessage] = useState<AdminMessage | null>(null);
  const [missingRequiredNames, setMissingRequiredNames] = useState<Record<RequiredNameField, boolean>>({
    productName: false,
    fullName: false,
  });
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmation | null>(null);
  const productNameInputRef = useRef<HTMLInputElement | null>(null);
  const staffNameInputRef = useRef<HTMLInputElement | null>(null);
  const staffDateMessageTimeoutsRef = useRef<Partial<Record<"foodHandlingDateMessage" | "medicalExamDateMessage", number>>>({});
  const [sanitationPlan, setSanitationPlan] = useState<SanitationPlanRecord | null>(() =>
    buildSanitationPlanRecord(initialSanitaryDocumentFiles),
  );
  const [chemicalProducts, setChemicalProducts] = useState<ChemicalProductRecord[]>(() =>
    buildChemicalProductRecords(initialChemicalProducts, initialSanitaryDocumentFiles),
  );
  const [pestControlRecords, setPestControlRecords] = useState<DatedDocumentRecord[]>(() =>
    buildDatedRecords(initialSanitaryDocumentFiles, "pest_control_certificate"),
  );
  const [waterTankRecords, setWaterTankRecords] = useState<DatedDocumentRecord[]>(() =>
    buildDatedRecords(initialSanitaryDocumentFiles, "water_tank_cleaning_certificate"),
  );
  const [acuHistory, setAcuHistory] = useState<AcuCollectionRecord[]>(() => buildAcuHistory(initialSanitaryDocumentFiles));
  const [staffMembers, setStaffMembers] = useState<StaffRecord[]>(() =>
    buildStaffRecords(initialStaffMembers, initialSanitaryDocumentFiles),
  );
  const activeSectionConfig = DOCUMENT_SECTIONS.find((section) => section.id === activeSection) ?? null;
  const sectionStatusBadges: Record<DocumentSectionId, DocumentMenuBadgeState> = {
    sanitation_plan: getMenuBadgeFromStatusColor(initialSanitaryDocumentCategoryStatuses.sanitation_plan),
    chemical_products: getMenuBadgeFromStatusColor(initialSanitaryDocumentCategoryStatuses.chemical_products),
    pest_control: getMenuBadgeFromStatusColor(initialSanitaryDocumentCategoryStatuses.pest_control),
    water_tank_cleaning: getMenuBadgeFromStatusColor(initialSanitaryDocumentCategoryStatuses.water_tank_cleaning),
    acu_final_disposal: getMenuBadgeFromStatusColor(initialSanitaryDocumentCategoryStatuses.acu_final_disposal),
    staff_records: getMenuBadgeFromStatusColor(initialSanitaryDocumentCategoryStatuses.staff_records),
  };
  const sectionCountLabels: Record<DocumentSectionId, string> = {
    sanitation_plan: formatStoredRecordCount("sanitation_plan", sanitationPlan ? 1 : 0),
    pest_control: formatStoredRecordCount("pest_control", pestControlRecords.length),
    water_tank_cleaning: formatStoredRecordCount("water_tank_cleaning", waterTankRecords.length),
    acu_final_disposal: formatStoredRecordCount("acu_final_disposal", acuHistory.length),
    staff_records: formatStoredRecordCount("staff_records", staffMembers.length),
    chemical_products: formatStoredRecordCount("chemical_products", chemicalProducts.length),
  };

  const resetRegistration = useCallback(() => {
    setIsRegistering(false);
    setFormData(createEmptyDocumentFormData());
    setMissingRequiredNames({ productName: false, fullName: false });
    Object.values(staffDateMessageTimeoutsRef.current).forEach((timeoutId) => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    });
    staffDateMessageTimeoutsRef.current = {};
  }, []);

  const clearActionMessage = useCallback(() => {
    setActionMessage(null);
  }, []);

  const cancelRegistration = useCallback(() => {
    resetRegistration();
    clearActionMessage();
  }, [clearActionMessage, resetRegistration]);

  const showActionMessage = useCallback((message: AdminMessage) => {
    setActionMessage(message);
  }, []);

  useEffect(() => {
    if (actionMessage?.tone !== "success") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setActionMessage(null);
    }, ACTION_MESSAGE_AUTO_DISMISS_MS);

    return () => window.clearTimeout(timeoutId);
  }, [actionMessage]);

  useEffect(() => {
    const showDocumentsMenu = () => {
      setActiveSection(null);
      resetRegistration();
      clearActionMessage();
    };

    window.addEventListener(DOCUMENTS_HOME_EVENT, showDocumentsMenu);

    return () => window.removeEventListener(DOCUMENTS_HOME_EVENT, showDocumentsMenu);
  }, [clearActionMessage, resetRegistration]);

  useEffect(
    () => () => {
      Object.values(staffDateMessageTimeoutsRef.current).forEach((timeoutId) => {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }
      });
    },
    [],
  );

  const updateFormData = (nextData: Partial<DocumentFormData>) => {
    if (nextData.productName !== undefined && nextData.productName.trim()) {
      setMissingRequiredNames((currentValues) => ({ ...currentValues, productName: false }));
    }

    if (nextData.fullName !== undefined && nextData.fullName.trim()) {
      setMissingRequiredNames((currentValues) => ({ ...currentValues, fullName: false }));
    }

    setFormData((currentData) => ({ ...currentData, ...nextData }));
  };

  const requireProductName = () => {
    if (formData.productName.trim()) {
      return true;
    }

    setMissingRequiredNames((currentValues) => ({ ...currentValues, productName: true }));
    window.requestAnimationFrame(() => productNameInputRef.current?.focus());
    return false;
  };

  const requireStaffFullName = () => {
    if (formData.fullName.trim()) {
      return true;
    }

    setMissingRequiredNames((currentValues) => ({ ...currentValues, fullName: true }));
    window.requestAnimationFrame(() => staffNameInputRef.current?.focus());
    return false;
  };

  const requireDocumentPdf = (fileExists: boolean, message = DOCUMENT_DATE_PDF_REQUIRED_MESSAGE) => {
    if (fileExists) {
      return true;
    }

    showActionMessage({
      tone: "error",
      text: message,
    });
    return false;
  };

  const requireStaffPdf = (
    fileExists: boolean,
    messageField: "foodHandlingDateMessage" | "medicalExamDateMessage",
    message = DOCUMENT_DATE_PDF_REQUIRED_MESSAGE,
  ) => {
    if (!requireStaffFullName()) {
      return false;
    }

    if (fileExists) {
      return true;
    }

    showStaffDateMessage(messageField, message);
    return false;
  };

  const requestDeleteConfirmation = (onConfirm: () => void) => {
    setDeleteConfirmation({ onConfirm });
  };

  const confirmPendingDelete = () => {
    const pendingDelete = deleteConfirmation;

    if (!pendingDelete) {
      return;
    }

    setDeleteConfirmation(null);
    pendingDelete.onConfirm();
  };

  const showStaffDateMessage = useCallback((
    field: "foodHandlingDateMessage" | "medicalExamDateMessage",
    message = DOCUMENT_DATE_PDF_REQUIRED_MESSAGE,
  ) => {
    const currentTimeoutId = staffDateMessageTimeoutsRef.current[field];

    if (currentTimeoutId) {
      window.clearTimeout(currentTimeoutId);
    }

    setFormData((currentData) => ({
      ...currentData,
      [field]: message,
    }));

    staffDateMessageTimeoutsRef.current[field] = window.setTimeout(() => {
      setFormData((currentData) => ({
        ...currentData,
        [field]: "",
      }));
      delete staffDateMessageTimeoutsRef.current[field];
    }, ACTION_MESSAGE_AUTO_DISMISS_MS);
  }, []);

  const startRegistration = (nextData?: Partial<DocumentFormData>) => {
    setFormData({ ...createEmptyDocumentFormData(), ...nextData });
    setMissingRequiredNames({ productName: false, fullName: false });
    setIsRegistering(true);
    clearActionMessage();
  };

  const createBaseFormData = () => {
    const nextFormData = new FormData();
    nextFormData.set("branchId", branchId);
    nextFormData.set("companySlug", companySlug);
    nextFormData.set("branchSlug", branchSlug);
    return nextFormData;
  };

  const setResultMessage = (result: { error?: string; success?: string }) => {
    if (result.error) {
      showActionMessage({ tone: "error", text: result.error });
      return false;
    }

    if (result.success) {
      showActionMessage({ tone: "success", text: result.success });
    }

    return true;
  };

  const appendPdfFile = (nextFormData: FormData, key: string, fileState: FileInputState) => {
    if (fileState.file?.sourceFile) {
      nextFormData.set(key, fileState.file.sourceFile);
    }
  };

  const saveSanitationPlanRecord = () => {
    if (!formData.pdf.file) {
      return;
    }

    clearActionMessage();
    startSaving(async () => {
      const nextFormData = createBaseFormData();
      nextFormData.set("documentKind", "sanitation_plan");
      if (sanitationPlan?.id) {
        nextFormData.set("documentId", sanitationPlan.id);
      }
      appendPdfFile(nextFormData, "pdfFile", formData.pdf);

      const result = await saveBranchSanitaryDocumentFileAction(nextFormData);

      if (!setResultMessage(result) || !result.file) {
        return;
      }

      revokeUploadedPdf(formData.pdf.file);
      setSanitationPlan({
        id: result.file.id,
        name: "Plan de saneamiento básico",
        pdf: toStoredPdf(result.file),
        updatedAt: result.file.updatedAt,
      });
      resetRegistration();
    });
  };

  const saveDatedRecord = (
    records: DatedDocumentRecord[],
    setRecords: (records: DatedDocumentRecord[]) => void,
    prefix: string,
  ) => {
    const existingRecord = formData.editingId
      ? records.find((record) => record.id === formData.editingId) ?? null
      : null;
    const selectedPdf = formData.pdf.file ?? existingRecord?.pdf ?? null;

    if (!formData.issuedAt || !selectedPdf) {
      return;
    }

    if (isFutureDocumentDate(formData.issuedAt)) {
      showActionMessage({ tone: "error", text: DOCUMENT_FUTURE_DATE_ERROR_MESSAGE });
      return;
    }

    const expiresAt = getCalculatedExpirationDate(formData.issuedAt, formData.validityMonths);
    const documentKind: BranchSanitaryDocumentKind =
      prefix === "pest-control" ? "pest_control_certificate" : "water_tank_cleaning_certificate";

    clearActionMessage();
    startSaving(async () => {
      const nextFormData = createBaseFormData();
      nextFormData.set("documentKind", documentKind);
      nextFormData.set("expiresAt", expiresAt);
      nextFormData.set("metadata", JSON.stringify({ issuedAt: formData.issuedAt, validityMonths: formData.validityMonths }));
      if (formData.editingId) {
        nextFormData.set("documentId", formData.editingId);
      }
      appendPdfFile(nextFormData, "pdfFile", formData.pdf);

      const result = await saveBranchSanitaryDocumentFileAction(nextFormData);

      if (!setResultMessage(result) || !result.file) {
        return;
      }

      revokeUploadedPdf(formData.pdf.file);
      const nextRecord: DatedDocumentRecord = {
        id: result.file.id,
        issuedAt: formData.issuedAt,
        expiresAt: result.file.expiresAt ?? expiresAt,
        validityMonths: formData.validityMonths,
        updatedAt: result.file.updatedAt,
        pdf: toStoredPdf(result.file),
      };

      setRecords(
        sortDatedRecordsByIssuedAt(
          formData.editingId
            ? records.map((record) => (record.id === formData.editingId ? nextRecord : record))
            : [...records, nextRecord],
        ),
      );
      resetRegistration();
    });
  };

  const saveAcuRecord = () => {
    const existingRecord = formData.editingId
      ? acuHistory.find((record) => record.id === formData.editingId) ?? null
      : null;
    const selectedPdf = formData.pdf.file ?? existingRecord?.pdf ?? null;

    if (!formData.collectedAt || !selectedPdf) {
      return;
    }

    if (isFutureDocumentDate(formData.collectedAt)) {
      showActionMessage({ tone: "error", text: DOCUMENT_FUTURE_DATE_ERROR_MESSAGE });
      return;
    }

    clearActionMessage();
    startSaving(async () => {
      const nextFormData = createBaseFormData();
      nextFormData.set("documentKind", "acu_final_disposal_certificate");
      nextFormData.set(
        "metadata",
        JSON.stringify({
          collectedAt: formData.collectedAt,
        }),
      );
      if (formData.editingId) {
        nextFormData.set("documentId", formData.editingId);
      }
      appendPdfFile(nextFormData, "pdfFile", formData.pdf);

      const result = await saveBranchSanitaryDocumentFileAction(nextFormData);

      if (!setResultMessage(result) || !result.file) {
        return;
      }

      revokeUploadedPdf(formData.pdf.file);
      const nextRecord: AcuCollectionRecord = {
        id: result.file.id,
        collectedAt: formData.collectedAt,
        pdf: toStoredPdf(result.file),
        updatedAt: result.file.updatedAt,
      };

      setAcuHistory((currentRecords) =>
        sortAcuHistoryByCollectedAt(
          formData.editingId
            ? currentRecords.map((record) => (record.id === formData.editingId ? nextRecord : record))
            : [nextRecord, ...currentRecords],
        ),
      );
      resetRegistration();
    });
  };

  const saveChemicalProduct = () => {
    const existingProduct = formData.editingId
      ? chemicalProducts.find((product) => product.id === formData.editingId) ?? null
      : null;
    const technicalSheet = formData.technicalSheet.file
      ? formData.technicalSheet
      : existingProduct?.technicalSheet ?? formData.technicalSheet;
    const safetySheet = formData.safetySheet.file
      ? formData.safetySheet
      : existingProduct?.safetySheet ?? formData.safetySheet;

    if (!formData.productName.trim() || (!technicalSheet.file && !safetySheet.file)) {
      return;
    }

    clearActionMessage();
    startSaving(async () => {
      const nextFormData = createBaseFormData();
      nextFormData.set("productName", formData.productName.trim());
      if (formData.editingId) {
        nextFormData.set("productId", formData.editingId);
      }
      appendPdfFile(nextFormData, "technicalSheetPdf", formData.technicalSheet);
      appendPdfFile(nextFormData, "safetySheetPdf", formData.safetySheet);

      const result = await saveBranchChemicalProductAction(nextFormData);

      if (!setResultMessage(result) || !result.product) {
        return;
      }

      revokeUploadedPdf(formData.technicalSheet.file);
      revokeUploadedPdf(formData.safetySheet.file);

      const technicalSheetFile =
        result.files?.find((file) => file.documentKind === "chemical_technical_sheet") ?? null;
      const safetySheetFile = result.files?.find((file) => file.documentKind === "chemical_safety_sheet") ?? null;
      const nextProduct: ChemicalProductRecord = {
        id: result.product.id,
        name: result.product.name,
        technicalSheet: technicalSheetFile ? toFileState(technicalSheetFile) : technicalSheet,
        safetySheet: safetySheetFile ? toFileState(safetySheetFile) : safetySheet,
        updatedAt: result.product.updatedAt,
      };

      setChemicalProducts((currentProducts) =>
        formData.editingId
          ? currentProducts.map((product) => (product.id === formData.editingId ? nextProduct : product))
          : [nextProduct, ...currentProducts],
      );
      resetRegistration();
    });
  };

  const saveStaffRecord = () => {
    const existingMember = formData.editingId
      ? staffMembers.find((member) => member.id === formData.editingId) ?? null
      : null;
    const hasAtLeastOnePdf = Boolean(
      formData.foodHandlingPdf.file ||
        formData.medicalExamPdf.file ||
        existingMember?.foodHandlingPdf.file ||
        existingMember?.medicalExamPdf.file,
    );

    if (!formData.fullName.trim() || !hasAtLeastOnePdf) {
      return;
    }

    if (
      (formData.foodHandlingPdf.file && !formData.foodHandlingIssuedAt) ||
      (formData.medicalExamPdf.file && !formData.medicalExamIssuedAt)
    ) {
      showActionMessage({ tone: "error", text: "Debes indicar la fecha del PDF que vas a guardar." });
      return;
    }

    if (
      isFutureDocumentDate(formData.foodHandlingIssuedAt) ||
      isFutureDocumentDate(formData.medicalExamIssuedAt)
    ) {
      showActionMessage({ tone: "error", text: DOCUMENT_FUTURE_DATE_ERROR_MESSAGE });
      return;
    }

    const foodHandlingExpiresAt = getCalculatedExpirationDate(
      formData.foodHandlingIssuedAt,
      formData.foodHandlingValidityMonths,
    );
    const medicalExamExpiresAt = getCalculatedExpirationDate(
      formData.medicalExamIssuedAt,
      formData.medicalExamValidityMonths,
    );

    clearActionMessage();
    startSaving(async () => {
      const nextFormData = createBaseFormData();
      nextFormData.set("fullName", formData.fullName.trim());
      nextFormData.set("foodHandlingIssuedAt", formData.foodHandlingIssuedAt);
      nextFormData.set("foodHandlingExpiresAt", foodHandlingExpiresAt);
      nextFormData.set("foodHandlingValidityMonths", formData.foodHandlingValidityMonths);
      nextFormData.set("medicalExamIssuedAt", formData.medicalExamIssuedAt);
      nextFormData.set("medicalExamExpiresAt", medicalExamExpiresAt);
      nextFormData.set("medicalExamValidityMonths", formData.medicalExamValidityMonths);
      if (formData.editingId) {
        nextFormData.set("staffMemberId", formData.editingId);
      }
      appendPdfFile(nextFormData, "foodHandlingPdf", formData.foodHandlingPdf);
      appendPdfFile(nextFormData, "medicalExamPdf", formData.medicalExamPdf);

      const result = await saveBranchStaffMemberAction(nextFormData);

      if (!setResultMessage(result) || !result.staffMember) {
        return;
      }

      revokeUploadedPdf(formData.foodHandlingPdf.file);
      revokeUploadedPdf(formData.medicalExamPdf.file);

      const foodHandlingFile = result.files?.find((file) => file.documentKind === "food_handling_course") ?? null;
      const medicalExamFile = result.files?.find((file) => file.documentKind === "medical_fitness_exam") ?? null;
      const nextMember: StaffRecord = {
        id: result.staffMember.id,
        fullName: result.staffMember.fullName,
        foodHandlingIssuedAt: formData.foodHandlingIssuedAt,
        foodHandlingExpiresAt: foodHandlingFile?.expiresAt ?? foodHandlingExpiresAt,
        foodHandlingValidityMonths: formData.foodHandlingValidityMonths,
        foodHandlingPdf: foodHandlingFile ? toFileState(foodHandlingFile) : formData.foodHandlingPdf,
        medicalExamIssuedAt: formData.medicalExamIssuedAt,
        medicalExamExpiresAt: medicalExamFile?.expiresAt ?? medicalExamExpiresAt,
        medicalExamValidityMonths: formData.medicalExamValidityMonths,
        medicalExamPdf: medicalExamFile ? toFileState(medicalExamFile) : formData.medicalExamPdf,
        updatedAt: result.staffMember.updatedAt,
      };

      setStaffMembers((currentMembers) =>
        formData.editingId
          ? currentMembers.map((member) => (member.id === formData.editingId ? nextMember : member))
          : [nextMember, ...currentMembers],
      );
      resetRegistration();
    });
  };

  const archiveDocumentFile = (documentId: string, onSuccess: () => void) => {
    clearActionMessage();
    startSaving(async () => {
      const nextFormData = createBaseFormData();
      nextFormData.set("documentId", documentId);

      const result = await archiveBranchSanitaryDocumentFileAction(nextFormData);

      if (!setResultMessage(result)) {
        return;
      }

      onSuccess();
    });
  };

  const archiveChemicalProduct = (productId: string) => {
    clearActionMessage();
    startSaving(async () => {
      const nextFormData = createBaseFormData();
      nextFormData.set("productId", productId);

      const result = await archiveBranchChemicalProductAction(nextFormData);

      if (!setResultMessage(result)) {
        return;
      }

      setChemicalProducts((currentProducts) => currentProducts.filter((product) => product.id !== productId));
    });
  };

  const archiveStaffMember = (staffMemberId: string) => {
    clearActionMessage();
    startSaving(async () => {
      const nextFormData = createBaseFormData();
      nextFormData.set("staffMemberId", staffMemberId);

      const result = await archiveBranchStaffMemberAction(nextFormData);

      if (!setResultMessage(result)) {
        return;
      }

      setStaffMembers((currentMembers) => currentMembers.filter((member) => member.id !== staffMemberId));
    });
  };

  const renderPlanSection = () => (
    <div className="grid gap-4">
      <RegisterControl
        isRegistering={isRegistering}
        actionLabel={getDocumentRegisterActionLabel("sanitation_plan", Boolean(sanitationPlan))}
        onStart={() => startRegistration()}
        onCancel={cancelRegistration}
      />

      {isRegistering ? (
        <DocumentRegisterModal
          title={getDocumentRegisterModalLabel("sanitation_plan", Boolean(sanitationPlan))}
          message={actionMessage}
          onCancel={cancelRegistration}
          onSubmit={saveSanitationPlanRecord}
          disabled={isSaving || !formData.pdf.file}
          submitLabel={
            isSaving ? "Guardando..." : getDocumentRegisterModalLabel("sanitation_plan", Boolean(sanitationPlan))
          }
        >
          <DocumentModalDivider />
          <DocumentUploadField label="Plan de saneamiento pdf">
            <CompactPdfInput
              id="sanitation-plan-pdf"
              label="Plan de saneamiento PDF"
              state={formData.pdf}
              maxSizeBytes={SANITATION_PLAN_MAX_FILE_SIZE_BYTES}
              onChange={(pdf) => {
                clearActionMessage();
                updateFormData({ pdf });
              }}
            />
          </DocumentUploadField>
        </DocumentRegisterModal>
      ) : null}

      <RecordsList>
        <RecordRow>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-800">
              {sanitationPlan?.name ?? "Plan de saneamiento básico"}
            </p>
            <DocumentStatusBadges statuses={[sanitationPlan ? "Al día" : "Sin registro"]} />
            <div className="mt-1">
              <DocumentFileLink
                file={sanitationPlan?.pdf ?? null}
                label="Plan"
                detail={`Última actualización: ${
                  sanitationPlan ? formatDate(sanitationPlan.updatedAt.slice(0, 10)) : "sin fecha"
                }`}
              />
            </div>
          </div>
          <RecordActions>
            <DeleteRecordButton
              label="Eliminar plan de saneamiento"
              disabled={!sanitationPlan}
              onClick={() => {
                if (!sanitationPlan) {
                  return;
                }

                requestDeleteConfirmation(() => {
                  archiveDocumentFile(sanitationPlan.id, () => setSanitationPlan(null));
                });
              }}
            />
          </RecordActions>
        </RecordRow>
      </RecordsList>
    </div>
  );

  const renderDatedSection = (
    sectionId: DocumentSectionId,
    records: DatedDocumentRecord[],
    setRecords: (records: DatedDocumentRecord[]) => void,
    suggestedValidityMonths: string,
    prefix: string,
    recordTitle: string,
  ) => (
    <div className="grid gap-4">
      <RegisterControl
        isRegistering={isRegistering}
        actionLabel={getDocumentRegisterActionLabel(sectionId)}
        onStart={() => startRegistration({ validityMonths: suggestedValidityMonths })}
        onCancel={cancelRegistration}
      />

      {isRegistering ? (
        <DocumentRegisterModal
          title={formData.editingId ? "Editar registro" : getDocumentRegisterModalLabel(sectionId)}
          message={actionMessage}
          onCancel={cancelRegistration}
          onSubmit={() => saveDatedRecord(records, setRecords, prefix)}
          disabled={isSaving || !formData.issuedAt || isFutureDocumentDate(formData.issuedAt) || !formData.pdf.file}
          submitLabel={isSaving ? "Guardando..." : formData.editingId ? "Guardar registro" : getDocumentRegisterModalLabel(sectionId)}
        >
          <DocumentModalDivider />
          <DocumentUploadField label="Certificado pdf">
            <CompactPdfInput
              id={`${prefix}-pdf`}
              label="Certificado PDF"
              state={formData.pdf}
              onChange={(pdf) => updateFormData({ pdf })}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="ui-form-field">
                <span className="ui-form-label">{DOCUMENT_DATE_INPUT_LABEL}</span>
                <DocumentDateInput
                  value={formData.issuedAt}
                  onOpenRequest={() => requireDocumentPdf(Boolean(formData.pdf.file))}
                  onChange={(event) => {
                    if (!requireDocumentPdf(Boolean(formData.pdf.file))) {
                      return;
                    }

                    updateFormData({ issuedAt: event });
                  }}
                />
              </label>
              <label className="ui-form-field">
                <span className="ui-form-label">{DOCUMENT_VALIDITY_INPUT_LABEL}</span>
                <DocumentValiditySelect
                  value={formData.validityMonths}
                  suggestedMonths={suggestedValidityMonths}
                  onOpenRequest={() =>
                    requireDocumentPdf(Boolean(formData.pdf.file), DOCUMENT_VALIDITY_PDF_REQUIRED_MESSAGE)
                  }
                  onChange={(validityMonths) => {
                    if (!requireDocumentPdf(Boolean(formData.pdf.file), DOCUMENT_VALIDITY_PDF_REQUIRED_MESSAGE)) {
                      return;
                    }

                    updateFormData({ validityMonths });
                  }}
                />
              </label>
            </div>
            {formData.pdf.file && formData.issuedAt ? (
              <p className="text-xs font-medium text-gray-400">
                Vencimiento: {formatDate(getCalculatedExpirationDate(formData.issuedAt, formData.validityMonths))}
              </p>
            ) : null}
          </DocumentUploadField>
        </DocumentRegisterModal>
      ) : null}

      <RecordsList>
        {records.length
          ? records.map((record) => (
              <RecordRow key={record.id}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800">{recordTitle}</p>
                  <DocumentStatusBadges statuses={[getDatedRecordStatus(record)]} />
                  <div className="mt-1">
                    <DocumentFileLink
                      file={record.pdf}
                      label="Certificado"
                      detail={formatExpirationDetail(record.expiresAt)}
                    />
                  </div>
                </div>
                <RecordActions>
                  <EditRecordButton
                    label="Editar certificado"
                    onClick={() =>
                      startRegistration({
                        editingId: record.id,
                        issuedAt: record.issuedAt,
                        validityMonths: record.validityMonths,
                        pdf: record.pdf ? { file: record.pdf, error: null } : createEmptyFileState(),
                      })
                    }
                  />
                  <DeleteRecordButton
                    label="Eliminar certificado"
                    onClick={() => {
                      requestDeleteConfirmation(() => {
                        archiveDocumentFile(record.id, () =>
                          setRecords(records.filter((currentRecord) => currentRecord.id !== record.id)),
                        );
                      });
                    }}
                  />
                </RecordActions>
              </RecordRow>
            ))
          : null}
      </RecordsList>
    </div>
  );

  const renderAcuSection = () => (
    <div className="grid gap-4">
      <RegisterControl
        isRegistering={isRegistering}
        actionLabel={getDocumentRegisterActionLabel("acu_final_disposal")}
        onStart={() => startRegistration()}
        onCancel={cancelRegistration}
      />

      {isRegistering ? (
        <DocumentRegisterModal
          title={formData.editingId ? "Editar registro" : getDocumentRegisterModalLabel("acu_final_disposal")}
          message={actionMessage}
          onCancel={cancelRegistration}
          onSubmit={saveAcuRecord}
          disabled={isSaving || !formData.collectedAt || isFutureDocumentDate(formData.collectedAt) || !formData.pdf.file}
          submitLabel={
            isSaving
              ? "Guardando..."
              : formData.editingId
                ? "Guardar registro"
                : getDocumentRegisterModalLabel("acu_final_disposal")
          }
        >
          <DocumentModalDivider />
          <DocumentUploadField label="Certificado pdf">
            <CompactPdfInput
              id="acu-pdf"
              label="Certificado PDF"
              state={formData.pdf}
              onChange={(pdf) => updateFormData({ pdf })}
            />
            <div className="grid gap-3">
              <label className="ui-form-field">
                <span className="ui-form-label">{DOCUMENT_DATE_INPUT_LABEL}</span>
                <DocumentDateInput
                  value={formData.collectedAt}
                  onOpenRequest={() => requireDocumentPdf(Boolean(formData.pdf.file))}
                  onChange={(event) => {
                    if (!requireDocumentPdf(Boolean(formData.pdf.file))) {
                      return;
                    }

                    updateFormData({ collectedAt: event });
                  }}
                />
              </label>
            </div>
          </DocumentUploadField>
        </DocumentRegisterModal>
      ) : null}

      <RecordsList>
        {acuHistory.length
          ? acuHistory.map((record, recordIndex) => (
              <RecordRow key={record.id}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800">Recolección - {formatDate(record.collectedAt)}</p>
                  <DocumentStatusBadges statuses={[getAcuRecordStatus(recordIndex)]} />
                  <div className="mt-1">
                    <DocumentFileLink
                      file={record.pdf}
                      label="Certificado"
                      detail={`Expedición: ${formatDate(record.collectedAt)}`}
                    />
                  </div>
                </div>
                <RecordActions>
                  <EditRecordButton
                    label="Editar certificado"
                    onClick={() =>
                      startRegistration({
                        editingId: record.id,
                        collectedAt: record.collectedAt,
                        pdf: { file: record.pdf, error: null },
                      })
                    }
                  />
                  <DeleteRecordButton
                    label="Eliminar certificado"
                    onClick={() => {
                      requestDeleteConfirmation(() => {
                        archiveDocumentFile(record.id, () =>
                          setAcuHistory((currentRecords) =>
                            sortAcuHistoryByCollectedAt(
                              currentRecords.filter((currentRecord) => currentRecord.id !== record.id),
                            ),
                          ),
                        );
                      });
                    }}
                  />
                </RecordActions>
              </RecordRow>
            ))
          : null}
      </RecordsList>
    </div>
  );

  const renderChemicalProductsSection = () => {
    const existingProduct = formData.editingId
      ? chemicalProducts.find((product) => product.id === formData.editingId) ?? null
      : null;
    const hasChemicalPdf = Boolean(
      formData.technicalSheet.file ||
        formData.safetySheet.file ||
        existingProduct?.technicalSheet.file ||
        existingProduct?.safetySheet.file,
    );
    const isProductNameMissing = missingRequiredNames.productName && !formData.productName.trim();

    return (
      <div className="grid gap-4">
        <RegisterControl
          isRegistering={isRegistering}
          actionLabel={getDocumentRegisterActionLabel("chemical_products")}
          onStart={() => startRegistration()}
          onCancel={cancelRegistration}
        />

        {isRegistering ? (
          <DocumentRegisterModal
            title={formData.editingId ? "Editar producto" : getDocumentRegisterModalLabel("chemical_products")}
            message={actionMessage}
            onCancel={cancelRegistration}
            onSubmit={saveChemicalProduct}
            disabled={isSaving || !formData.productName.trim() || !hasChemicalPdf}
            submitLabel={
              isSaving
                ? "Guardando..."
                : formData.editingId
                  ? "Guardar producto"
                  : getDocumentRegisterModalLabel("chemical_products")
            }
          >
            <label className="ui-form-field">
              <span className="ui-form-label">Nombre del producto</span>
              <input
                ref={productNameInputRef}
                value={formData.productName}
                onChange={(event) => updateFormData({ productName: event.currentTarget.value })}
                placeholder="Ej. Amonio cuaternario"
                aria-invalid={isProductNameMissing}
                className={`ui-form-control ${isProductNameMissing ? `ui-form-control-error ${REQUIRED_NAME_ERROR_INPUT_CLASS}` : ""}`}
              />
            </label>
            <DocumentModalDivider />
            <div className="grid gap-3 sm:grid-cols-2">
              <DocumentUploadField label="Ficha técnica pdf">
                <CompactPdfInput
                  id="chemical-technical-sheet"
                  label="Ficha técnica PDF"
                  state={formData.technicalSheet}
                  onOpenRequest={requireProductName}
                  onChange={(technicalSheet) => updateFormData({ technicalSheet })}
                />
              </DocumentUploadField>
              <DocumentUploadField label="Hoja de seguridad pdf">
                <CompactPdfInput
                  id="chemical-safety-sheet"
                  label="Hoja de seguridad PDF"
                  state={formData.safetySheet}
                  onOpenRequest={requireProductName}
                  onChange={(safetySheet) => updateFormData({ safetySheet })}
                />
              </DocumentUploadField>
            </div>
          </DocumentRegisterModal>
        ) : null}

        <RecordsList>
          {chemicalProducts.length
            ? chemicalProducts.map((product) => (
              <RecordRow key={product.id}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-800">{product.name}</p>
                  <DocumentStatusBadges statuses={[getProductStatus(product)]} />
                  <div className="mt-1 grid gap-1">
                    <DocumentFileLink file={product.technicalSheet.file} label="Ficha técnica" />
                    <DocumentFileLink file={product.safetySheet.file} label="Hoja de seguridad" />
                  </div>
                </div>
                <RecordActions>
                  <EditRecordButton
                    label="Editar producto"
                    onClick={() =>
                      startRegistration({
                        editingId: product.id,
                        productName: product.name,
                        technicalSheet: product.technicalSheet,
                        safetySheet: product.safetySheet,
                      })
                    }
                  />
                  <DeleteRecordButton
                    label="Eliminar producto"
                    onClick={() => {
                      requestDeleteConfirmation(() => {
                        archiveChemicalProduct(product.id);
                      });
                    }}
                  />
                </RecordActions>
              </RecordRow>
              ))
            : null}
        </RecordsList>
      </div>
    );
  };

  const renderStaffSection = () => {
    const existingMember = formData.editingId
      ? staffMembers.find((member) => member.id === formData.editingId) ?? null
      : null;
    const hasFoodHandlingPdf = Boolean(formData.foodHandlingPdf.file || existingMember?.foodHandlingPdf.file);
    const hasMedicalExamPdf = Boolean(formData.medicalExamPdf.file || existingMember?.medicalExamPdf.file);
    const isStaffNameMissing = missingRequiredNames.fullName && !formData.fullName.trim();
    const canSaveStaff = Boolean(
      formData.fullName.trim() &&
        (hasFoodHandlingPdf || hasMedicalExamPdf) &&
        (!hasFoodHandlingPdf || formData.foodHandlingIssuedAt) &&
        (!hasMedicalExamPdf || formData.medicalExamIssuedAt) &&
        !isFutureDocumentDate(formData.foodHandlingIssuedAt) &&
        !isFutureDocumentDate(formData.medicalExamIssuedAt),
    );
    const handleStaffDateChange = (
      value: string,
      fileExists: boolean,
      field: "foodHandlingIssuedAt" | "medicalExamIssuedAt",
    ) => {
      const messageField = field === "foodHandlingIssuedAt" ? "foodHandlingDateMessage" : "medicalExamDateMessage";

      if (!requireStaffFullName()) {
        return;
      }

      if (!fileExists) {
        showStaffDateMessage(messageField);
        return;
      }

      clearActionMessage();
      updateFormData(
        field === "foodHandlingIssuedAt"
          ? { foodHandlingIssuedAt: value, foodHandlingDateMessage: "" }
          : { medicalExamIssuedAt: value, medicalExamDateMessage: "" },
      );
    };

    return (
      <div className="grid gap-4">
        <RegisterControl
          isRegistering={isRegistering}
          actionLabel={getDocumentRegisterActionLabel("staff_records")}
          onStart={() =>
            startRegistration({
              foodHandlingValidityMonths: DEFAULT_STAFF_VALIDITY_MONTHS,
              medicalExamValidityMonths: DEFAULT_STAFF_VALIDITY_MONTHS,
            })
          }
          onCancel={cancelRegistration}
        />

        {isRegistering ? (
          <DocumentRegisterModal
            title={formData.editingId ? "Editar empleado" : getDocumentRegisterModalLabel("staff_records")}
            message={actionMessage}
            onCancel={cancelRegistration}
            onSubmit={saveStaffRecord}
            disabled={isSaving || !canSaveStaff}
            submitLabel={
              isSaving
                ? "Guardando..."
                : formData.editingId
                  ? "Guardar empleado"
                  : getDocumentRegisterModalLabel("staff_records")
            }
            maxWidthClassName="max-w-2xl"
          >
            <label className="ui-form-field">
              <input
                ref={staffNameInputRef}
                value={formData.fullName}
                onChange={(event) => updateFormData({ fullName: event.currentTarget.value })}
                placeholder="Nombre del colaborador"
                aria-label="Nombre del colaborador"
                aria-invalid={isStaffNameMissing}
                className={`ui-form-control ${isStaffNameMissing ? `ui-form-control-error ${REQUIRED_NAME_ERROR_INPUT_CLASS}` : ""}`}
              />
            </label>
            <DocumentModalDivider />
            <div className="grid gap-3">
              <DocumentUploadField label="Curso manipulación alimentos">
                <CompactPdfInput
                  id="staff-food-handling-pdf"
                  label="PDF curso manipulación"
                  state={formData.foodHandlingPdf}
                  onOpenRequest={requireStaffFullName}
                  onChange={(foodHandlingPdf) => {
                    clearActionMessage();
                    updateFormData({ foodHandlingPdf, foodHandlingDateMessage: "" });
                  }}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="ui-form-field min-w-0">
                    <span className="ui-form-label">{DOCUMENT_DATE_INPUT_LABEL}</span>
                    <DocumentDateInput
                      value={formData.foodHandlingIssuedAt}
                      onOpenRequest={() => requireStaffPdf(hasFoodHandlingPdf, "foodHandlingDateMessage")}
                      onChange={(event) =>
                        handleStaffDateChange(
                          event,
                          hasFoodHandlingPdf,
                          "foodHandlingIssuedAt",
                        )
                      }
                    />
                  </label>
                  <label className="ui-form-field min-w-0">
                    <span className="ui-form-label">{DOCUMENT_VALIDITY_INPUT_LABEL}</span>
                    <DocumentValiditySelect
                      value={formData.foodHandlingValidityMonths}
                      suggestedMonths={DEFAULT_STAFF_VALIDITY_MONTHS}
                      onOpenRequest={() =>
                        requireStaffPdf(
                          hasFoodHandlingPdf,
                          "foodHandlingDateMessage",
                          DOCUMENT_VALIDITY_PDF_REQUIRED_MESSAGE,
                        )
                      }
                      onChange={(foodHandlingValidityMonths) => {
                        if (
                          !requireStaffPdf(
                            hasFoodHandlingPdf,
                            "foodHandlingDateMessage",
                            DOCUMENT_VALIDITY_PDF_REQUIRED_MESSAGE,
                          )
                        ) {
                          return;
                        }

                        updateFormData({ foodHandlingValidityMonths });
                      }}
                    />
                  </label>
                </div>
                {formData.foodHandlingDateMessage ? (
                  <p className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                    {formData.foodHandlingDateMessage}
                  </p>
                ) : null}
              </DocumentUploadField>
              <DocumentUploadField label="Exámenes médicos de aptitud">
                <CompactPdfInput
                  id="staff-medical-exam-pdf"
                  label="PDF examen médico"
                  state={formData.medicalExamPdf}
                  onOpenRequest={requireStaffFullName}
                  onChange={(medicalExamPdf) => {
                    clearActionMessage();
                    updateFormData({ medicalExamPdf, medicalExamDateMessage: "" });
                  }}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="ui-form-field min-w-0">
                    <span className="ui-form-label">{DOCUMENT_DATE_INPUT_LABEL}</span>
                    <DocumentDateInput
                      value={formData.medicalExamIssuedAt}
                      onOpenRequest={() => requireStaffPdf(hasMedicalExamPdf, "medicalExamDateMessage")}
                      onChange={(event) =>
                        handleStaffDateChange(
                          event,
                          hasMedicalExamPdf,
                          "medicalExamIssuedAt",
                        )
                      }
                    />
                  </label>
                  <label className="ui-form-field min-w-0">
                    <span className="ui-form-label">{DOCUMENT_VALIDITY_INPUT_LABEL}</span>
                    <DocumentValiditySelect
                      value={formData.medicalExamValidityMonths}
                      suggestedMonths={DEFAULT_STAFF_VALIDITY_MONTHS}
                      onOpenRequest={() =>
                        requireStaffPdf(
                          hasMedicalExamPdf,
                          "medicalExamDateMessage",
                          DOCUMENT_VALIDITY_PDF_REQUIRED_MESSAGE,
                        )
                      }
                      onChange={(medicalExamValidityMonths) => {
                        if (
                          !requireStaffPdf(
                            hasMedicalExamPdf,
                            "medicalExamDateMessage",
                            DOCUMENT_VALIDITY_PDF_REQUIRED_MESSAGE,
                          )
                        ) {
                          return;
                        }

                        updateFormData({ medicalExamValidityMonths });
                      }}
                    />
                  </label>
                </div>
                {formData.medicalExamDateMessage ? (
                  <p className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                    {formData.medicalExamDateMessage}
                  </p>
                ) : null}
              </DocumentUploadField>
            </div>
          </DocumentRegisterModal>
        ) : null}

        <RecordsList>
          {staffMembers.length
            ? staffMembers.map((member) => (
                <RecordRow key={member.id}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-800">{member.fullName}</p>
                    <DocumentStatusBadges statuses={getStaffStatusBadges(member)} />
                    <div className="mt-1 grid gap-1">
                      <DocumentFileLink
                        file={member.foodHandlingPdf.file}
                        label="Curso"
                        detail={formatExpirationDetail(member.foodHandlingExpiresAt)}
                      />
                      <DocumentFileLink
                        file={member.medicalExamPdf.file}
                        label="Examen"
                        detail={formatExpirationDetail(member.medicalExamExpiresAt)}
                      />
                    </div>
                  </div>
                  <RecordActions>
                    <EditRecordButton
                      label="Editar empleado"
                      onClick={() =>
                        startRegistration({
                          editingId: member.id,
                          fullName: member.fullName,
                          foodHandlingIssuedAt: member.foodHandlingIssuedAt,
                          foodHandlingValidityMonths: member.foodHandlingValidityMonths,
                          foodHandlingPdf: member.foodHandlingPdf,
                          medicalExamIssuedAt: member.medicalExamIssuedAt,
                          medicalExamValidityMonths: member.medicalExamValidityMonths,
                          medicalExamPdf: member.medicalExamPdf,
                        })
                      }
                    />
                    <DeleteRecordButton
                      label="Eliminar empleado"
                      onClick={() => {
                        requestDeleteConfirmation(() => {
                          archiveStaffMember(member.id);
                        });
                      }}
                    />
                  </RecordActions>
                </RecordRow>
              ))
            : null}
        </RecordsList>
      </div>
    );
  };

  const renderActiveSection = (sectionId: DocumentSectionId) => {
    if (sectionId === "sanitation_plan") {
      return renderPlanSection();
    }

    if (sectionId === "pest_control") {
      return renderDatedSection(
        "pest_control",
        pestControlRecords,
        setPestControlRecords,
        "3",
        "pest-control",
        "Control de plagas",
      );
    }

    if (sectionId === "water_tank_cleaning") {
      return renderDatedSection(
        "water_tank_cleaning",
        waterTankRecords,
        setWaterTankRecords,
        "6",
        "water-tank",
        "Lavado de tanques",
      );
    }

    if (sectionId === "acu_final_disposal") {
      return renderAcuSection();
    }

    if (sectionId === "chemical_products") {
      return renderChemicalProductsSection();
    }

    return renderStaffSection();
  };

  return (
    <>
      <section className="grid gap-5 transition-all duration-300 ease-in-out">
        {activeSectionConfig ? (
          <DocumentsToolbar activeSectionConfig={activeSectionConfig} />
        ) : null}

        {activeSectionConfig ? (
          <DedicatedSectionScreen>
            {!isRegistering && actionMessage ? <ActionMessage message={actionMessage} /> : null}
            {renderActiveSection(activeSectionConfig.id)}
          </DedicatedSectionScreen>
        ) : (
          <div className="mx-auto mt-6 w-full max-w-3xl px-4">
            <article className="rounded-[1.45rem] p-5 text-left dashboard-card-surface dashboard-card-surface-operational">
              <h2 className="mb-4 text-sm font-semibold uppercase leading-5 tracking-[0.08em] text-[#2a7f86]">
                Seleccione
              </h2>
              <RecordsList>
                {DOCUMENT_MENU_ITEMS.map((item) => (
                  <DocumentMenuCard
                    key={item.sectionId}
                    item={item}
                    badge={sectionStatusBadges[item.sectionId]}
                    countLabel={sectionCountLabels[item.sectionId]}
                    onSelect={(sectionId) => {
                      resetRegistration();
                      clearActionMessage();
                      setActiveSection(sectionId);
                    }}
                  />
                ))}
              </RecordsList>
            </article>
          </div>
        )}
      </section>

      {deleteConfirmation ? (
        <DocumentDeleteConfirmationModal
          isDeleting={isSaving}
          onCancel={() => setDeleteConfirmation(null)}
          onConfirm={confirmPendingDelete}
        />
      ) : null}
    </>
  );
}
