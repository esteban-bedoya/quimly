"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const BASE_MAX_FILE_SIZE_BYTES = 1.5 * 1024 * 1024;
const SANITATION_PLAN_MAX_FILE_SIZE_BYTES = 6 * 1024 * 1024;
const DOCUMENTS_HOME_EVENT = "quimly:documents-home";

type UploadedPdf = {
  id: string;
  name: string;
  size: number;
  selectedAt: string;
  previewUrl: string | null;
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

type DocumentStatus = "Al día" | "Vencido" | "Incompleto" | "Sin registro" | "Completo";

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
  updatedAt: string;
  pdf: UploadedPdf | null;
};

type AcuCollectionRecord = {
  id: string;
  collectedAt: string;
  quantity: string;
  unit: "Galones" | "Litros";
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
  foodHandlingPdf: FileInputState;
  medicalExamIssuedAt: string;
  medicalExamExpiresAt: string;
  medicalExamPdf: FileInputState;
  updatedAt: string;
};

type DocumentFormData = {
  editingId: string | null;
  pdf: FileInputState;
  issuedAt: string;
  collectedAt: string;
  quantity: string;
  unit: "Galones" | "Litros";
  productName: string;
  technicalSheet: FileInputState;
  safetySheet: FileInputState;
  fullName: string;
  foodHandlingIssuedAt: string;
  foodHandlingPdf: FileInputState;
  medicalExamIssuedAt: string;
  medicalExamPdf: FileInputState;
};

const DOCUMENT_SECTIONS: DocumentSectionMeta[] = [
  {
    id: "sanitation_plan",
    title: "Plan de saneamiento básico",
    description:
      "Contiene 1 documento unificado obligatorio para los cuatro programas de control sanitario (limpieza, plagas, residuos y agua potable).",
  },
  {
    id: "chemical_products",
    title: "Fichas técnicas y hojas de seguridad",
    description:
      "Contiene 2 documentos obligatorios por cada producto químico usado en la operación (ficha técnica y hoja de seguridad).",
  },
  {
    id: "pest_control",
    title: "Certificado de control de plagas",
    description: "Contiene 1 documento obligatorio con vigencia mensual o trimestral.",
  },
  {
    id: "water_tank_cleaning",
    title: "Certificado de lavado de tanques de agua potable",
    description: "Contiene 1 documento obligatorio con vigencia semestral.",
  },
  {
    id: "acu_final_disposal",
    title: "Certificado disposición final de aceites (ACU)",
    description: "Contiene el historial de certificados por cada entrega realizada.",
  },
  {
    id: "staff_records",
    title: "Fichas del personal",
    description:
      "Contiene 2 documentos obligatorios por cada empleado (manipulación de alimentos y exámenes de aptitud médica).",
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
    title: "Fichas del personal (manipulación de alimentos y exámenes médicos)",
  },
  {
    sectionId: "chemical_products",
    title: "Fichas técnicas y hojas de seguridad (de los productos químicos)",
  },
];

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

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Fecha no disponible";
  }

  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return "Fecha no disponible";
  }

  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
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
    collectedAt: "",
    quantity: "",
    unit: "Galones",
    productName: "",
    technicalSheet: createEmptyFileState(),
    safetySheet: createEmptyFileState(),
    fullName: "",
    foodHandlingIssuedAt: "",
    foodHandlingPdf: createEmptyFileState(),
    medicalExamIssuedAt: "",
    medicalExamPdf: createEmptyFileState(),
  };
}

function revokeUploadedPdf(file: UploadedPdf | null) {
  if (!file?.previewUrl) {
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

function getProductStatus(product: ChemicalProductRecord): DocumentStatus {
  return product.technicalSheet.file && product.safetySheet.file ? "Completo" : "Incompleto";
}

function getStaffStatus(record: StaffRecord): DocumentStatus {
  const hasCourse = Boolean(record.foodHandlingPdf.file);
  const hasMedicalExam = Boolean(record.medicalExamPdf.file);
  const courseExpired = hasCourse && isExpired(record.foodHandlingExpiresAt);
  const medicalExamExpired = hasMedicalExam && isExpired(record.medicalExamExpiresAt);

  if (!hasCourse && !hasMedicalExam) {
    return "Sin registro";
  }

  if (courseExpired || medicalExamExpired) {
    return "Vencido";
  }

  if (!hasCourse || !hasMedicalExam || !record.foodHandlingIssuedAt || !record.medicalExamIssuedAt) {
    return "Incompleto";
  }

  return "Al día";
}

function getLatestDatedRecord(records: DatedDocumentRecord[]) {
  return records[0] ?? null;
}

function getAggregatedProductStatus(products: ChemicalProductRecord[]): DocumentStatus {
  if (products.length === 0) {
    return "Sin registro";
  }

  return products.every((product) => getProductStatus(product) === "Completo") ? "Completo" : "Incompleto";
}

function getAggregatedStaffStatus(records: StaffRecord[]): DocumentStatus {
  if (records.length === 0) {
    return "Sin registro";
  }

  const statuses = records.map(getStaffStatus);

  if (statuses.includes("Vencido")) {
    return "Vencido";
  }

  if (statuses.includes("Incompleto") || statuses.includes("Sin registro")) {
    return "Incompleto";
  }

  return "Al día";
}

function getMenuBadgeFromStatus(status: DocumentStatus): DocumentMenuBadgeState {
  const tone = {
    "Al día": "success",
    Completo: "success",
    Vencido: "danger",
    Incompleto: "warning",
    "Sin registro": "neutral",
  } satisfies Record<DocumentStatus, NonNullable<DocumentMenuBadgeState["tone"]>>;

  return {
    label: status,
    tone: tone[status],
  };
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

function DocumentMenuBadge({ badge }: { badge: DocumentMenuBadgeState }) {
  const toneClassName = {
    neutral: "text-gray-500",
    success: "text-emerald-700",
    warning: "text-amber-700",
    danger: "text-rose-700",
  }[badge.tone ?? "neutral"];

  return <span className={`text-xs font-medium ${toneClassName}`}>{badge.label}</span>;
}

function DocumentMenuCard({
  item,
  badge,
  onSelect,
}: {
  item: DocumentMenuItem;
  badge: DocumentMenuBadgeState;
  onSelect: (sectionId: DocumentSectionId) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item.sectionId)}
      className="block w-full cursor-pointer rounded-xl bg-[#fafbfc] px-2 py-4 text-left transition-all duration-200 ease-out hover:scale-[1.015] hover:bg-white hover:shadow-sm hover:ring-1 hover:ring-inset hover:ring-gray-300 focus:outline-none focus:ring-2 focus:ring-[#2a7f86]/20 active:scale-[0.995]"
    >
      <span className="flex items-start gap-3">
        <span className="font-medium text-[15px] text-gray-800">{item.title}</span>
        <span className="ml-auto shrink-0 pt-0.5">
          <DocumentMenuBadge badge={badge} />
        </span>
      </span>
    </button>
  );
}

function DocumentsToolbar({
  activeSectionConfig,
  onBack,
}: {
  activeSectionConfig: DocumentSectionMeta | null;
  onBack: () => void;
}) {
  if (!activeSectionConfig) {
    return null;
  }

  return (
    <div className="operational-toolbar mt-3 mb-10 flex w-full items-center justify-between gap-3 sm:mt-4 sm:mb-12 sm:gap-4 lg:items-end">
      <button
        type="button"
        onClick={onBack}
        className="ui-muted-action ui-muted-action-large operational-toolbar-action shrink-0"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4 shrink-0">
          <path
            d="M10 3.5 5.5 8l4.5 4.5M6 8h7"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.4"
          />
        </svg>
        <span className="operational-toolbar-action-label-short">Volver</span>
        <span className="operational-toolbar-action-label-full">Volver a selección</span>
      </button>

      <p className="operational-toolbar-copy min-w-0 text-right">
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

function CompactPdfInput({
  id,
  label,
  state,
  onChange,
  maxSizeBytes = BASE_MAX_FILE_SIZE_BYTES,
}: {
  id: string;
  label: string;
  state: FileInputState;
  onChange: (state: FileInputState) => void;
  maxSizeBytes?: number;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="grid gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">{label}</span>
      <input
        ref={fileInputRef}
        id={id}
        type="file"
        accept="application/pdf"
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
      <div className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white px-4 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gray-800">
            {state.file ? state.file.name : "Selecciona un PDF"}
          </p>
          <p className="text-xs text-gray-400">
            {state.file ? `${formatFileSize(state.file.size)} · ${formatDateTime(state.file.selectedAt)}` : "PDF"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="shrink-0 rounded-full bg-[#12110f] px-4 py-2 text-xs font-semibold text-white transition hover:scale-[1.02]"
        >
          {state.file ? "Cambiar" : "Subir"}
        </button>
      </div>
      {state.error ? <p className="text-xs font-medium text-rose-600">{state.error}</p> : null}
    </div>
  );
}

function InlineDocumentForm({
  children,
  onSubmit,
  disabled,
  submitLabel = "Guardar registro",
}: {
  children: ReactNode;
  onSubmit: () => void;
  disabled?: boolean;
  submitLabel?: string;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="bg-gray-50/60 border border-gray-100 rounded-2xl p-6 mb-6 text-left transition-all duration-300 ease-in-out animate-fadeIn"
    >
      <div className="grid gap-4">{children}</div>
      <div className="mt-5 flex justify-end">
        <button
          type="submit"
          disabled={disabled}
          className="ui-pill-button-primary min-h-11 px-5 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {submitLabel}
        </button>
      </div>
    </form>
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
          className="text-gray-400 hover:text-gray-600 text-sm font-medium transition-colors"
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

function UploadPolicyNote({ maxSizeLabel }: { maxSizeLabel: string }) {
  return (
    <p className="text-right text-xs font-medium leading-5 text-gray-400">
      Archivo permitido: PDF · Peso máximo: {maxSizeLabel}
    </p>
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
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      {children ? (
        children
      ) : (
        <div className="flex items-center justify-between py-4 px-6 border-b border-gray-50 last:border-none hover:bg-gray-50/50 transition-colors">
          <span className="text-sm text-gray-500">{emptyLabel}</span>
          <DocumentStatusBadge status="Sin registro" />
        </div>
      )}
    </div>
  );
}

function RecordRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 px-6 border-b border-gray-50 last:border-none hover:bg-gray-50/50 transition-colors">
      {children}
    </div>
  );
}

function PdfViewButton({ file }: { file: UploadedPdf | null }) {
  if (!file?.previewUrl) {
    return (
      <button type="button" disabled className="text-xs font-medium text-gray-300">
        Ver PDF
      </button>
    );
  }

  return (
    <a href={file.previewUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-[#2a7f86]">
      Ver PDF
    </a>
  );
}

export function CompanyAdminDocumentsView() {
  const sanitationPlanInputRef = useRef<HTMLInputElement | null>(null);
  const [activeSection, setActiveSection] = useState<DocumentSectionId | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [formData, setFormData] = useState<DocumentFormData>(createEmptyDocumentFormData);
  const [sanitationPlan, setSanitationPlan] = useState<SanitationPlanRecord | null>(null);
  const [chemicalProducts, setChemicalProducts] = useState<ChemicalProductRecord[]>([]);
  const [pestControlRecords, setPestControlRecords] = useState<DatedDocumentRecord[]>([]);
  const [waterTankRecords, setWaterTankRecords] = useState<DatedDocumentRecord[]>([]);
  const [acuHistory, setAcuHistory] = useState<AcuCollectionRecord[]>([]);
  const [staffMembers, setStaffMembers] = useState<StaffRecord[]>([]);
  const activeSectionConfig = DOCUMENT_SECTIONS.find((section) => section.id === activeSection) ?? null;
  const latestPestControl = getLatestDatedRecord(pestControlRecords);
  const latestWaterTank = getLatestDatedRecord(waterTankRecords);
  const sectionStatusBadges: Record<DocumentSectionId, DocumentMenuBadgeState> = {
    sanitation_plan: getMenuBadgeFromStatus(sanitationPlan ? "Al día" : "Sin registro"),
    chemical_products: getMenuBadgeFromStatus(getAggregatedProductStatus(chemicalProducts)),
    pest_control: getMenuBadgeFromStatus(latestPestControl ? getDatedRecordStatus(latestPestControl) : "Sin registro"),
    water_tank_cleaning: getMenuBadgeFromStatus(latestWaterTank ? getDatedRecordStatus(latestWaterTank) : "Sin registro"),
    acu_final_disposal: getMenuBadgeFromStatus(acuHistory.length ? "Al día" : "Sin registro"),
    staff_records: getMenuBadgeFromStatus(getAggregatedStaffStatus(staffMembers)),
  };

  const resetRegistration = () => {
    setIsRegistering(false);
    setFormData(createEmptyDocumentFormData());
  };

  useEffect(() => {
    const showDocumentsMenu = () => {
      setActiveSection(null);
      resetRegistration();
    };

    window.addEventListener(DOCUMENTS_HOME_EVENT, showDocumentsMenu);

    return () => window.removeEventListener(DOCUMENTS_HOME_EVENT, showDocumentsMenu);
  }, []);

  const updateFormData = (nextData: Partial<DocumentFormData>) => {
    setFormData((currentData) => ({ ...currentData, ...nextData }));
  };

  const startRegistration = (nextData?: Partial<DocumentFormData>) => {
    setFormData({ ...createEmptyDocumentFormData(), ...nextData });
    setIsRegistering(true);
  };

  const replaceSanitationPlan = (file: File | null) => {
    if (!file) {
      return;
    }

    const nextFileState = validatePdfFile(file, SANITATION_PLAN_MAX_FILE_SIZE_BYTES);

    if (!nextFileState.file) {
      updateFormData({ pdf: nextFileState });
      return;
    }

    revokeUploadedPdf(sanitationPlan?.pdf ?? null);
    setSanitationPlan({
      id: createId("sanitation-plan"),
      name: "Plan de Saneamiento Básico",
      pdf: nextFileState.file,
      updatedAt: new Date().toISOString(),
    });
    updateFormData({ pdf: createEmptyFileState() });
  };

  const saveDatedRecord = (
    records: DatedDocumentRecord[],
    setRecords: (records: DatedDocumentRecord[]) => void,
    monthsToExpire: number,
    prefix: string,
  ) => {
    const existingRecord = formData.editingId
      ? records.find((record) => record.id === formData.editingId) ?? null
      : null;
    const selectedPdf = formData.pdf.file ?? existingRecord?.pdf ?? null;

    if (!formData.issuedAt || !selectedPdf) {
      return;
    }

    if (existingRecord?.pdf && formData.pdf.file && existingRecord.pdf.id !== formData.pdf.file.id) {
      revokeUploadedPdf(existingRecord.pdf);
    }

    const nextRecord: DatedDocumentRecord = {
      id: formData.editingId ?? createId(prefix),
      issuedAt: formData.issuedAt,
      expiresAt: addMonthsToDate(formData.issuedAt, monthsToExpire),
      updatedAt: new Date().toISOString(),
      pdf: selectedPdf,
    };

    setRecords(
      formData.editingId
        ? records.map((record) => (record.id === formData.editingId ? nextRecord : record))
        : [nextRecord, ...records],
    );
    resetRegistration();
  };

  const saveAcuRecord = () => {
    const existingRecord = formData.editingId
      ? acuHistory.find((record) => record.id === formData.editingId) ?? null
      : null;
    const selectedPdf = formData.pdf.file ?? existingRecord?.pdf ?? null;

    if (!formData.collectedAt || !formData.quantity || !selectedPdf) {
      return;
    }

    if (existingRecord?.pdf && formData.pdf.file && existingRecord.pdf.id !== formData.pdf.file.id) {
      revokeUploadedPdf(existingRecord.pdf);
    }

    const nextRecord: AcuCollectionRecord = {
      id: formData.editingId ?? createId("acu-record"),
      collectedAt: formData.collectedAt,
      quantity: formData.quantity,
      unit: formData.unit,
      pdf: selectedPdf,
      updatedAt: new Date().toISOString(),
    };

    setAcuHistory((currentRecords) =>
      formData.editingId
        ? currentRecords.map((record) => (record.id === formData.editingId ? nextRecord : record))
        : [nextRecord, ...currentRecords],
    );
    resetRegistration();
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

    if (
      existingProduct?.technicalSheet.file &&
      formData.technicalSheet.file &&
      existingProduct.technicalSheet.file.id !== formData.technicalSheet.file.id
    ) {
      revokeUploadedPdf(existingProduct.technicalSheet.file);
    }

    if (
      existingProduct?.safetySheet.file &&
      formData.safetySheet.file &&
      existingProduct.safetySheet.file.id !== formData.safetySheet.file.id
    ) {
      revokeUploadedPdf(existingProduct.safetySheet.file);
    }

    const nextProduct: ChemicalProductRecord = {
      id: formData.editingId ?? createId("chemical-product"),
      name: formData.productName.trim(),
      technicalSheet,
      safetySheet,
      updatedAt: new Date().toISOString(),
    };

    setChemicalProducts((currentProducts) =>
      formData.editingId
        ? currentProducts.map((product) => (product.id === formData.editingId ? nextProduct : product))
        : [nextProduct, ...currentProducts],
    );
    resetRegistration();
  };

  const saveStaffRecord = () => {
    const existingMember = formData.editingId
      ? staffMembers.find((member) => member.id === formData.editingId) ?? null
      : null;
    const hasAtLeastOnePdf = Boolean(formData.foodHandlingPdf.file || formData.medicalExamPdf.file);

    if (!formData.fullName.trim() || !hasAtLeastOnePdf) {
      return;
    }

    if (
      existingMember?.foodHandlingPdf.file &&
      formData.foodHandlingPdf.file &&
      existingMember.foodHandlingPdf.file.id !== formData.foodHandlingPdf.file.id
    ) {
      revokeUploadedPdf(existingMember.foodHandlingPdf.file);
    }

    if (
      existingMember?.medicalExamPdf.file &&
      formData.medicalExamPdf.file &&
      existingMember.medicalExamPdf.file.id !== formData.medicalExamPdf.file.id
    ) {
      revokeUploadedPdf(existingMember.medicalExamPdf.file);
    }

    const nextMember: StaffRecord = {
      id: formData.editingId ?? createId("staff-member"),
      fullName: formData.fullName.trim(),
      foodHandlingIssuedAt: formData.foodHandlingIssuedAt,
      foodHandlingExpiresAt: addMonthsToDate(formData.foodHandlingIssuedAt, 12),
      foodHandlingPdf: formData.foodHandlingPdf,
      medicalExamIssuedAt: formData.medicalExamIssuedAt,
      medicalExamExpiresAt: addMonthsToDate(formData.medicalExamIssuedAt, 12),
      medicalExamPdf: formData.medicalExamPdf,
      updatedAt: new Date().toISOString(),
    };

    setStaffMembers((currentMembers) =>
      formData.editingId
        ? currentMembers.map((member) => (member.id === formData.editingId ? nextMember : member))
        : [nextMember, ...currentMembers],
    );
    resetRegistration();
  };

  const renderPlanSection = () => (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <input
          ref={sanitationPlanInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          tabIndex={-1}
          onChange={(event) => {
            replaceSanitationPlan(event.currentTarget.files?.[0] ?? null);
            event.currentTarget.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => sanitationPlanInputRef.current?.click()}
          className="ui-pill-button-primary min-h-11 px-5"
        >
          {sanitationPlan ? "Reemplazar documento" : "Subir documento"}
        </button>
      </div>
      <UploadPolicyNote maxSizeLabel="6 MB" />

      {formData.pdf.error ? <p className="text-right text-xs font-medium text-rose-600">{formData.pdf.error}</p> : null}

      <RecordsList>
        <RecordRow>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-800">
              {sanitationPlan?.name ?? "Plan de Saneamiento Básico"}
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Última actualización: {sanitationPlan ? formatDate(sanitationPlan.updatedAt.slice(0, 10)) : "—"}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
            <DocumentStatusBadge status={sanitationPlan ? "Al día" : "Sin registro"} />
            {sanitationPlan ? <PdfViewButton file={sanitationPlan.pdf} /> : null}
            <button
              type="button"
              disabled={!sanitationPlan}
              onClick={() => {
                revokeUploadedPdf(sanitationPlan?.pdf ?? null);
                setSanitationPlan(null);
              }}
              className="text-xs font-medium text-rose-500 transition hover:text-rose-700 disabled:text-gray-300"
            >
              Eliminar
            </button>
          </div>
        </RecordRow>
      </RecordsList>
    </div>
  );

  const renderDatedSection = (
    records: DatedDocumentRecord[],
    setRecords: (records: DatedDocumentRecord[]) => void,
    monthsToExpire: number,
    prefix: string,
    dateLabel: string,
  ) => (
    <div className="grid gap-4">
      <RegisterControl
        isRegistering={isRegistering}
        actionLabel="+ Registrar dato"
        onStart={() => startRegistration()}
        onCancel={resetRegistration}
      />
      <UploadPolicyNote maxSizeLabel="1.5 MB" />

      {isRegistering ? (
        <InlineDocumentForm
          onSubmit={() => saveDatedRecord(records, setRecords, monthsToExpire, prefix)}
          disabled={!formData.issuedAt || !formData.pdf.file}
        >
          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
              {dateLabel}
            </span>
            <input
              type="date"
              value={formData.issuedAt}
              onChange={(event) => updateFormData({ issuedAt: event.currentTarget.value })}
              className="ui-document-form-control"
            />
          </label>
          {formData.issuedAt ? (
            <p className="text-xs font-medium text-gray-400">
              Vencimiento: {formatDate(addMonthsToDate(formData.issuedAt, monthsToExpire))}
            </p>
          ) : null}
          <CompactPdfInput
            id={`${prefix}-pdf`}
            label="Certificado PDF"
            state={formData.pdf}
            onChange={(pdf) => updateFormData({ pdf })}
          />
        </InlineDocumentForm>
      ) : null}

      <RecordsList>
        {records.length
          ? records.map((record) => (
              <RecordRow key={record.id}>
                <div className="grid min-w-0 gap-1 sm:grid-cols-2 sm:gap-8">
                  <p className="text-sm text-gray-700">
                    <span className="block text-xs text-gray-400">{dateLabel}</span>
                    {formatDate(record.issuedAt)}
                  </p>
                  <p className="text-sm text-gray-700">
                    <span className="block text-xs text-gray-400">Vencimiento</span>
                    {formatDate(record.expiresAt)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
                  <DocumentStatusBadge status={getDatedRecordStatus(record)} />
                  <PdfViewButton file={record.pdf} />
                  <button
                    type="button"
                    onClick={() =>
                      startRegistration({
                        editingId: record.id,
                        issuedAt: record.issuedAt,
                        pdf: record.pdf ? { file: record.pdf, error: null } : createEmptyFileState(),
                      })
                    }
                    className="text-xs font-medium text-gray-500 transition hover:text-gray-800"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecords(records.filter((currentRecord) => currentRecord.id !== record.id))}
                    className="text-xs font-medium text-rose-500 transition hover:text-rose-700"
                  >
                    Eliminar
                  </button>
                </div>
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
        actionLabel="+ Registrar dato"
        onStart={() => startRegistration()}
        onCancel={resetRegistration}
      />
      <UploadPolicyNote maxSizeLabel="1.5 MB" />

      {isRegistering ? (
        <InlineDocumentForm
          onSubmit={saveAcuRecord}
          disabled={!formData.collectedAt || !formData.quantity || !formData.pdf.file}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                Fecha recolección
              </span>
              <input
                type="date"
                value={formData.collectedAt}
                onChange={(event) => updateFormData({ collectedAt: event.currentTarget.value })}
                className="ui-document-form-control"
              />
            </label>
            <div className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Cantidad</span>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.quantity}
                  onChange={(event) => updateFormData({ quantity: event.currentTarget.value })}
                  className="ui-document-form-control"
                />
                <select
                  value={formData.unit}
                  onChange={(event) => updateFormData({ unit: event.currentTarget.value as "Galones" | "Litros" })}
                  className="ui-document-form-control"
                >
                  <option>Galones</option>
                  <option>Litros</option>
                </select>
              </div>
            </div>
          </div>
          <CompactPdfInput id="acu-pdf" label="Certificado PDF" state={formData.pdf} onChange={(pdf) => updateFormData({ pdf })} />
        </InlineDocumentForm>
      ) : null}

      <RecordsList>
        {acuHistory.length
          ? acuHistory.map((record) => (
              <RecordRow key={record.id}>
                <div className="grid min-w-0 gap-1 sm:grid-cols-3 sm:gap-6">
                  <p className="text-sm text-gray-700">
                    <span className="block text-xs text-gray-400">Recolección</span>
                    {formatDate(record.collectedAt)}
                  </p>
                  <p className="text-sm text-gray-700">
                    <span className="block text-xs text-gray-400">Cantidad</span>
                    {record.quantity} {record.unit}
                  </p>
                  <p className="text-sm text-gray-400">
                    <span className="block text-xs text-gray-400">Vencimiento</span>
                    Hasta la próxima recolección
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
                  <DocumentStatusBadge status="Al día" />
                  <PdfViewButton file={record.pdf} />
                  <button
                    type="button"
                    onClick={() =>
                      startRegistration({
                        editingId: record.id,
                        collectedAt: record.collectedAt,
                        quantity: record.quantity,
                        unit: record.unit,
                        pdf: { file: record.pdf, error: null },
                      })
                    }
                    className="text-xs font-medium text-gray-500 transition hover:text-gray-800"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      revokeUploadedPdf(record.pdf);
                      setAcuHistory(acuHistory.filter((currentRecord) => currentRecord.id !== record.id));
                    }}
                    className="text-xs font-medium text-rose-500 transition hover:text-rose-700"
                  >
                    Eliminar
                  </button>
                </div>
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

    return (
      <div className="grid gap-4">
        <RegisterControl
          isRegistering={isRegistering}
          actionLabel="+ Registrar dato"
          onStart={() => startRegistration()}
          onCancel={resetRegistration}
        />
        <UploadPolicyNote maxSizeLabel="1.5 MB" />

        {isRegistering ? (
          <InlineDocumentForm
            onSubmit={saveChemicalProduct}
            disabled={!formData.productName.trim() || !hasChemicalPdf}
            submitLabel={formData.editingId ? "Guardar producto" : "Registrar producto"}
          >
          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
              Nombre del producto
            </span>
            <input
              value={formData.productName}
              onChange={(event) => updateFormData({ productName: event.currentTarget.value })}
              placeholder="Ej. Amonio cuaternario"
              className="ui-document-form-control"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <CompactPdfInput
              id="chemical-technical-sheet"
              label="Ficha técnica PDF"
              state={formData.technicalSheet}
              onChange={(technicalSheet) => updateFormData({ technicalSheet })}
            />
            <CompactPdfInput
              id="chemical-safety-sheet"
              label="Hoja de seguridad PDF"
              state={formData.safetySheet}
              onChange={(safetySheet) => updateFormData({ safetySheet })}
            />
          </div>
          </InlineDocumentForm>
        ) : null}

        <RecordsList>
          {chemicalProducts.length
            ? chemicalProducts.map((product) => (
              <RecordRow key={product.id}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-800">{product.name}</p>
                  <p className="mt-1 text-xs text-gray-400">Actualizado {formatDateTime(product.updatedAt)}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
                  <DocumentStatusBadge status={getProductStatus(product)} />
                  <span className="text-xs text-gray-500">
                    Ficha: {product.technicalSheet.file ? "Cargado" : "Faltante"}
                  </span>
                  <PdfViewButton file={product.technicalSheet.file} />
                  <span className="text-xs text-gray-500">
                    Seguridad: {product.safetySheet.file ? "Cargado" : "Faltante"}
                  </span>
                  <PdfViewButton file={product.safetySheet.file} />
                  <button
                    type="button"
                    onClick={() =>
                      startRegistration({
                        editingId: product.id,
                        productName: product.name,
                        technicalSheet: product.technicalSheet,
                        safetySheet: product.safetySheet,
                      })
                    }
                    className="text-xs font-medium text-gray-500 transition hover:text-gray-800"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      revokeUploadedPdf(product.technicalSheet.file);
                      revokeUploadedPdf(product.safetySheet.file);
                      setChemicalProducts(chemicalProducts.filter((currentProduct) => currentProduct.id !== product.id));
                    }}
                    className="text-xs font-medium text-rose-500 transition hover:text-rose-700"
                  >
                    Eliminar
                  </button>
                </div>
              </RecordRow>
              ))
            : null}
        </RecordsList>
      </div>
    );
  };

  const renderStaffSection = () => {
    const canSaveStaff = Boolean(formData.fullName.trim() && (formData.foodHandlingPdf.file || formData.medicalExamPdf.file));

    return (
      <div className="grid gap-4">
        <RegisterControl
          isRegistering={isRegistering}
          actionLabel="+ Registrar dato"
          onStart={() => startRegistration()}
          onCancel={resetRegistration}
        />
        <UploadPolicyNote maxSizeLabel="1.5 MB" />

        {isRegistering ? (
          <InlineDocumentForm
            onSubmit={saveStaffRecord}
            disabled={!canSaveStaff}
            submitLabel={formData.editingId ? "Guardar empleado" : "Registrar empleado"}
          >
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Nombre</span>
              <input
                value={formData.fullName}
                onChange={(event) => updateFormData({ fullName: event.currentTarget.value })}
                placeholder="Nombre del empleado"
                className="ui-document-form-control"
              />
            </label>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="grid gap-3">
                <label className="grid gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                    Fecha curso manipulación
                  </span>
                  <input
                    type="date"
                    value={formData.foodHandlingIssuedAt}
                    onChange={(event) => updateFormData({ foodHandlingIssuedAt: event.currentTarget.value })}
                    className="ui-document-form-control"
                  />
                </label>
                <CompactPdfInput
                  id="staff-food-handling-pdf"
                  label="PDF curso manipulación"
                  state={formData.foodHandlingPdf}
                  onChange={(foodHandlingPdf) => updateFormData({ foodHandlingPdf })}
                />
              </div>
              <div className="grid gap-3">
                <label className="grid gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                    Fecha examen médico
                  </span>
                  <input
                    type="date"
                    value={formData.medicalExamIssuedAt}
                    onChange={(event) => updateFormData({ medicalExamIssuedAt: event.currentTarget.value })}
                    className="ui-document-form-control"
                  />
                </label>
                <CompactPdfInput
                  id="staff-medical-exam-pdf"
                  label="PDF examen médico"
                  state={formData.medicalExamPdf}
                  onChange={(medicalExamPdf) => updateFormData({ medicalExamPdf })}
                />
              </div>
            </div>
          </InlineDocumentForm>
        ) : null}

        <RecordsList>
          {staffMembers.length
            ? staffMembers.map((member) => (
                <RecordRow key={member.id}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-800">{member.fullName}</p>
                    <p className="mt-1 text-xs text-gray-400">
                      Curso vence {member.foodHandlingExpiresAt ? formatDate(member.foodHandlingExpiresAt) : "sin fecha"} ·
                      Examen vence {member.medicalExamExpiresAt ? formatDate(member.medicalExamExpiresAt) : " sin fecha"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
                    <DocumentStatusBadge status={getStaffStatus(member)} />
                    <PdfViewButton file={member.foodHandlingPdf.file} />
                    <PdfViewButton file={member.medicalExamPdf.file} />
                    <button
                      type="button"
                      onClick={() =>
                        startRegistration({
                          editingId: member.id,
                          fullName: member.fullName,
                          foodHandlingIssuedAt: member.foodHandlingIssuedAt,
                          foodHandlingPdf: member.foodHandlingPdf,
                          medicalExamIssuedAt: member.medicalExamIssuedAt,
                          medicalExamPdf: member.medicalExamPdf,
                        })
                      }
                      className="text-xs font-medium text-gray-500 transition hover:text-gray-800"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        revokeUploadedPdf(member.foodHandlingPdf.file);
                        revokeUploadedPdf(member.medicalExamPdf.file);
                        setStaffMembers(staffMembers.filter((currentMember) => currentMember.id !== member.id));
                      }}
                      className="text-xs font-medium text-rose-500 transition hover:text-rose-700"
                    >
                      Eliminar
                    </button>
                  </div>
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
      return renderDatedSection(pestControlRecords, setPestControlRecords, 3, "pest-control", "Fecha del control");
    }

    if (sectionId === "water_tank_cleaning") {
      return renderDatedSection(waterTankRecords, setWaterTankRecords, 6, "water-tank", "Fecha de lavado");
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
    <section className="grid gap-5 transition-all duration-300 ease-in-out">
      {activeSectionConfig ? (
        <DocumentsToolbar
          activeSectionConfig={activeSectionConfig}
          onBack={() => {
            resetRegistration();
            setActiveSection(null);
          }}
        />
      ) : null}

      {activeSectionConfig ? (
        <DedicatedSectionScreen>{renderActiveSection(activeSectionConfig.id)}</DedicatedSectionScreen>
      ) : (
        <div className="mx-auto mt-6 w-full max-w-3xl px-4">
          <article className="rounded-[1.45rem] p-5 text-left dashboard-card-surface dashboard-card-surface-operational">
            <h2 className="mb-4 text-sm font-semibold uppercase leading-5 tracking-[0.08em] text-[#2a7f86]">
              Seleccione
            </h2>
            <div>
              {DOCUMENT_MENU_ITEMS.map((item, index) => (
                <div key={item.sectionId}>
                  <DocumentMenuCard
                    item={item}
                    badge={sectionStatusBadges[item.sectionId]}
                    onSelect={(sectionId) => {
                      resetRegistration();
                      setActiveSection(sectionId);
                    }}
                  />
                  {index < DOCUMENT_MENU_ITEMS.length - 1 ? (
                    <div className="my-1 border-b border-gray-100" />
                  ) : null}
                </div>
              ))}
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
