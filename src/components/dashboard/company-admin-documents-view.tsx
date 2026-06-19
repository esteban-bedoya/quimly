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

type ChemicalProduct = {
  id: string;
  name: string;
  technicalSheet: FileInputState;
  safetySheet: FileInputState;
};

type ExpiringDocumentState = FileInputState & {
  expiresAt: string;
};

type StaffDocumentKey = "food_handling_course" | "medical_fitness_exam";

type StaffDocument = {
  key: StaffDocumentKey;
  title: string;
  legalText: string;
  fileState: ExpiringDocumentState;
};

type StaffMember = {
  id: string;
  fullName: string;
  documents: Record<StaffDocumentKey, StaffDocument>;
};

type AcuCertificateRecord = UploadedPdf & {
  uploadedAt: string;
  isActive: boolean;
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

type PdfDropzoneProps = {
  id: string;
  label: string;
  state: FileInputState;
  maxSizeBytes?: number;
  onChange: (state: FileInputState) => void;
  helper?: ReactNode;
  selectLabel?: string;
  replaceLabel?: string;
  showRemove?: boolean;
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

function formatShortDate(value: string) {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function createEmptyFileState(): FileInputState {
  return {
    file: null,
    error: null,
  };
}

function createEmptyExpiringFileState(): ExpiringDocumentState {
  return {
    ...createEmptyFileState(),
    expiresAt: "",
  };
}

function revokeUploadedPdf(file: UploadedPdf | null) {
  if (!file?.previewUrl) {
    return;
  }

  URL.revokeObjectURL(file.previewUrl);
}

function createChemicalProduct(): ChemicalProduct {
  return {
    id: createId("chemical-product"),
    name: "",
    technicalSheet: createEmptyFileState(),
    safetySheet: createEmptyFileState(),
  };
}

function createStaffMember(): StaffMember {
  return {
    id: createId("staff-member"),
    fullName: "",
    documents: {
      food_handling_course: {
        key: "food_handling_course",
        title: "Curso de manipulación",
        legalText: "Vigencia Legal: 1 año (Anual).",
        fileState: createEmptyExpiringFileState(),
      },
      medical_fitness_exam: {
        key: "medical_fitness_exam",
        title: "Examen médico de aptitud",
        legalText: "Vigencia Legal: 1 año (Anual) o antes si es necesario.",
        fileState: createEmptyExpiringFileState(),
      },
    },
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

function getExpirationStatus(expiresAt: string) {
  if (!expiresAt) {
    return {
      label: "Sin fecha de vencimiento",
      className: "border-[#d8e5e6] bg-white text-[#66727a]",
    };
  }

  const expirationDate = new Date(`${expiresAt}T00:00:00`);
  const today = new Date();
  const todayAtMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const diffInDays = Math.ceil((expirationDate.getTime() - todayAtMidnight) / (1000 * 60 * 60 * 24));

  if (diffInDays < 0) {
    return {
      label: `Vencido desde ${formatDate(expiresAt)}`,
      className: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }

  if (diffInDays <= 30) {
    return {
      label: `Vence ${formatDate(expiresAt)}`,
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }

  return {
    label: `Vence ${formatDate(expiresAt)}`,
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
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

function getSanitationPlanBadge(fileState: FileInputState): DocumentMenuBadgeState {
  return fileState.file ? { label: "Activo", tone: "success" } : { label: "Pendiente", tone: "warning" };
}

function getExpiringDocumentBadge(state: ExpiringDocumentState): DocumentMenuBadgeState {
  if (!state.file) {
    return { label: "Sin cargar" };
  }

  if (!state.expiresAt) {
    return { label: "Sin fecha", tone: "warning" };
  }

  if (isExpired(state.expiresAt)) {
    return { label: "Vencido", tone: "danger" };
  }

  return { label: `Vence: ${formatShortDate(state.expiresAt)}`, tone: "success" };
}

function getFixedCountLabel(count: number, label: string) {
  return `${count} ${label}`;
}

function PdfDropzone({
  id,
  label,
  state,
  maxSizeBytes = BASE_MAX_FILE_SIZE_BYTES,
  onChange,
  helper,
  selectLabel = "Seleccionar archivo",
  replaceLabel = "Cambiar",
  showRemove = true,
}: PdfDropzoneProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const maxSizeLabel = formatFileSize(maxSizeBytes);
  const actionLabel = state.file ? replaceLabel : selectLabel;
  const clearFile = () => {
    revokeUploadedPdf(state.file);
    onChange(createEmptyFileState());
  };

  return (
    <div className="grid gap-2">
      <span className="ui-document-form-label">{label}</span>
      <div className="rounded-[1.15rem] border border-dashed border-[#b8c4c8] bg-white/72 p-3 shadow-[0_10px_24px_rgba(18,17,15,0.045)]">
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
              clearFile();
              return;
            }

            revokeUploadedPdf(state.file);
            onChange(validatePdfFile(file, maxSizeBytes));
            event.currentTarget.value = "";
          }}
        />

        <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          {state.file ? (
            <div className="min-w-0">
              <p className="truncate font-semibold text-[#12110f]">{state.file.name}</p>
              <p className="text-xs leading-5 text-[#6f7a80]">
                {formatFileSize(state.file.size)} · {formatDateTime(state.file.selectedAt)}
              </p>
            </div>
          ) : (
            <p className="text-sm font-medium text-[#7f878d]">PDF requerido · Máx. {maxSizeLabel}</p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {state.file?.previewUrl ? (
              <a
                href={state.file.previewUrl}
                target="_blank"
                rel="noreferrer"
                className="ui-pill-button-secondary min-h-11 px-4"
              >
                Ver PDF
              </a>
            ) : null}

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="ui-pill-button-primary min-h-11 px-4"
            >
              {actionLabel}
            </button>

            {showRemove && state.file ? (
              <button
                type="button"
                onClick={clearFile}
                className="ui-pill-button-secondary min-h-11 px-4 text-[#7b5750]"
              >
                Quitar
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {helper ? <div className="text-xs leading-5 text-[#6d777d]">{helper}</div> : null}
      {state.error ? <p className="ui-inline-alert ui-inline-alert-error">{state.error}</p> : null}
    </div>
  );
}

function ExpiringPdfDropzone({
  id,
  label,
  legalText,
  state,
  onChange,
  selectLabel,
  replaceLabel,
}: {
  id: string;
  label: string;
  legalText: string;
  state: ExpiringDocumentState;
  onChange: (state: ExpiringDocumentState) => void;
  selectLabel?: string;
  replaceLabel?: string;
}) {
  const expirationStatus = getExpirationStatus(state.expiresAt);

  return (
    <div className="grid gap-3 rounded-[1.25rem] bg-white/54 p-4">
      <PdfDropzone
        id={id}
        label={label}
        state={state}
        onChange={(nextState) => {
          onChange({
            ...nextState,
            expiresAt: nextState.file ? "" : state.expiresAt,
          });
        }}
        helper={<span>{legalText}</span>}
        selectLabel={selectLabel}
        replaceLabel={replaceLabel}
      />

      {state.file ? (
        <div className="grid gap-3">
          <label className="grid gap-2">
            <span className="ui-document-form-label">Fecha de vencimiento</span>
            <input
              type="date"
              required
              value={state.expiresAt}
              onChange={(event) => onChange({ ...state, expiresAt: event.currentTarget.value })}
              className="ui-document-form-control"
            />
          </label>

          <span
            className={`w-fit rounded-full border px-3 py-1.5 text-xs font-semibold ${expirationStatus.className}`}
          >
            {expirationStatus.label}
          </span>
        </div>
      ) : null}
    </div>
  );
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

export function CompanyAdminDocumentsView() {
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [sanitationPlan, setSanitationPlan] = useState<FileInputState>(createEmptyFileState);
  const [chemicalProducts, setChemicalProducts] = useState<ChemicalProduct[]>([]);
  const [pestControlCertificate, setPestControlCertificate] = useState<ExpiringDocumentState>(
    createEmptyExpiringFileState,
  );
  const [waterTankCertificate, setWaterTankCertificate] = useState<ExpiringDocumentState>(
    createEmptyExpiringFileState,
  );
  const [acuUpload, setAcuUpload] = useState<FileInputState>(createEmptyFileState);
  const [acuHistory, setAcuHistory] = useState<AcuCertificateRecord[]>([]);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const activeAcuRecords = acuHistory.filter((record) => record.isActive);
  const activeSectionConfig = DOCUMENT_SECTIONS.find((section) => section.id === activeSection) ?? null;
  const sectionStatusBadges: Record<DocumentSectionId, DocumentMenuBadgeState> = {
    sanitation_plan: getSanitationPlanBadge(sanitationPlan),
    chemical_products: {
      label: getFixedCountLabel(chemicalProducts.length, "Productos"),
      tone: chemicalProducts.length ? "success" : "neutral",
    },
    pest_control: getExpiringDocumentBadge(pestControlCertificate),
    water_tank_cleaning: getExpiringDocumentBadge(waterTankCertificate),
    acu_final_disposal: activeAcuRecords.length
      ? { label: getFixedCountLabel(activeAcuRecords.length, "Certificados"), tone: "success" }
      : { label: "Sin registros" },
    staff_records: staffMembers.length
      ? { label: getFixedCountLabel(staffMembers.length, "Empleados"), tone: "success" }
      : { label: "Sin personal" },
  };

  useEffect(() => {
    const showDocumentsMenu = () => setActiveSection(null);

    window.addEventListener(DOCUMENTS_HOME_EVENT, showDocumentsMenu);

    return () => window.removeEventListener(DOCUMENTS_HOME_EVENT, showDocumentsMenu);
  }, []);

  const updateChemicalProduct = (productId: string, update: (product: ChemicalProduct) => ChemicalProduct) => {
    setChemicalProducts((currentProducts) =>
      currentProducts.map((product) => (product.id === productId ? update(product) : product)),
    );
  };

  const updateStaffMember = (memberId: string, update: (member: StaffMember) => StaffMember) => {
    setStaffMembers((currentMembers) =>
      currentMembers.map((member) => (member.id === memberId ? update(member) : member)),
    );
  };

  const saveAcuCertificate = () => {
    const currentFile = acuUpload.file;

    if (!currentFile) {
      return;
    }

    setAcuHistory((currentHistory) => [
      {
        ...currentFile,
        uploadedAt: currentFile.selectedAt,
        isActive: true,
      },
      ...currentHistory,
    ]);
    setAcuUpload(createEmptyFileState());
  };

  const deactivateAcuCertificate = (recordId: string) => {
    setAcuHistory((currentHistory) =>
      currentHistory.map((record) => (record.id === recordId ? { ...record, isActive: false } : record)),
    );
  };

  const renderActiveSection = (sectionId: DocumentSectionId) => {
    if (sectionId === "sanitation_plan") {
      return (
        <PdfDropzone
          id="sanitation-plan-pdf"
          label="Plan de saneamiento básico"
          state={sanitationPlan}
          maxSizeBytes={SANITATION_PLAN_MAX_FILE_SIZE_BYTES}
          onChange={setSanitationPlan}
          helper="Sube un solo PDF con los 4 programas: Limpieza, Plagas, Residuos y Agua Potable."
        />
      );
    }

    if (sectionId === "chemical_products") {
      return (
        <div className="grid gap-4">
          <button
            type="button"
            onClick={() => setChemicalProducts((currentProducts) => [createChemicalProduct(), ...currentProducts])}
            className="ui-pill-button-primary min-h-12 w-full px-5 sm:w-fit"
          >
            + Agregar producto químico
          </button>

          {chemicalProducts.length === 0 ? (
            <p className="ui-empty-state-block">
              Agrega un producto químico para cargar su ficha técnica y su hoja de seguridad.
            </p>
          ) : null}

          {chemicalProducts.map((product, index) => (
            <article key={product.id} className="grid gap-4 rounded-2xl border border-[#d8e5e6] bg-white/72 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <label className="grid flex-1 gap-2">
                  <span className="ui-document-form-label">Nombre del producto</span>
                  <input
                    value={product.name}
                    onChange={(event) => {
                      const nextName = event.currentTarget.value;

                      updateChemicalProduct(product.id, (currentProduct) => ({
                        ...currentProduct,
                        name: nextName,
                      }));
                    }}
                    placeholder="Ej. Amonio cuaternario"
                    className="ui-document-form-control"
                  />
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setChemicalProducts((currentProducts) =>
                      currentProducts.filter((currentProduct) => currentProduct.id !== product.id),
                    )
                  }
                  className="ui-pill-button-secondary min-h-11 px-5 text-[#7b5750]"
                >
                  Eliminar
                </button>
              </div>

              <div className="grid gap-4">
                <PdfDropzone
                  id={`technical-sheet-${product.id}`}
                  label={`Ficha técnica ${index + 1}`}
                  state={product.technicalSheet}
                  onChange={(nextState) =>
                    updateChemicalProduct(product.id, (currentProduct) => ({
                      ...currentProduct,
                      technicalSheet: nextState,
                    }))
                  }
                />
                <PdfDropzone
                  id={`safety-sheet-${product.id}`}
                  label="Hoja de seguridad - MSDS"
                  state={product.safetySheet}
                  onChange={(nextState) =>
                    updateChemicalProduct(product.id, (currentProduct) => ({
                      ...currentProduct,
                      safetySheet: nextState,
                    }))
                  }
                />
              </div>
            </article>
          ))}
        </div>
      );
    }

    if (sectionId === "pest_control") {
      return (
        <ExpiringPdfDropzone
          id="pest-control-certificate"
          label="Certificado de control de plagas"
          legalText="Vigencia legal: máximo 1 mes (mensual) o 3 meses (trimestral), según el riesgo."
          state={pestControlCertificate}
          onChange={setPestControlCertificate}
        />
      );
    }

    if (sectionId === "water_tank_cleaning") {
      return (
        <ExpiringPdfDropzone
          id="water-tank-cleaning-certificate"
          label="Certificado de lavado y desinfección de tanques"
          legalText="Vigencia legal: máximo 6 meses (semestral)."
          state={waterTankCertificate}
          onChange={setWaterTankCertificate}
        />
      );
    }

    if (sectionId === "acu_final_disposal") {
      return (
        <div className="grid gap-4">
          <div className="grid gap-3 rounded-2xl border border-[#d8e5e6] bg-white/72 p-4">
            <PdfDropzone
              id="acu-certificate-upload"
              label="Certificado de la entrega del día"
              state={acuUpload}
              onChange={setAcuUpload}
              helper="Registra un PDF por cada entrega de aceite usado."
              showRemove={false}
            />

            {acuUpload.file ? (
              <button
                type="button"
                onClick={saveAcuCertificate}
                className="ui-pill-button-primary min-h-12 w-full px-5"
              >
                Guardar entrega del día
              </button>
            ) : null}
          </div>

          <div className="grid gap-3">
            <p className="text-sm font-semibold text-[#12110f]">Historial de certificados</p>

            {activeAcuRecords.length === 0 ? (
              <p className="ui-empty-state-block">Todavía no hay certificados ACU cargados.</p>
            ) : null}

            {activeAcuRecords.map((record) => (
              <article key={record.id} className="grid gap-3 rounded-2xl border border-[#d8e5e6] bg-white/72 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#12110f]">{record.name}</p>
                  <p className="mt-1 text-xs leading-5 text-[#6d777d]">
                    {formatFileSize(record.size)} · cargado {formatDateTime(record.uploadedAt)}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {record.previewUrl ? (
                    <a
                      href={record.previewUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="ui-pill-button-secondary min-h-11 px-4"
                    >
                      Ver PDF
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => deactivateAcuCertificate(record.id)}
                    className="ui-pill-button-secondary min-h-11 px-4 text-[#7b5750]"
                  >
                    Eliminar
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="grid gap-4">
        <button
          type="button"
          onClick={() => setStaffMembers((currentMembers) => [createStaffMember(), ...currentMembers])}
          className="ui-pill-button-primary min-h-12 w-full px-5 sm:w-fit"
        >
          + Agregar empleado
        </button>

        {staffMembers.length === 0 ? (
          <p className="ui-empty-state-block">
            Agrega un empleado para cargar su curso de manipulación y su examen médico de aptitud.
          </p>
        ) : null}

        {staffMembers.map((member, index) => (
          <article key={member.id} className="grid gap-4 rounded-2xl border border-[#d8e5e6] bg-white/72 p-4">
            <label className="grid gap-2">
              <span className="ui-document-form-label">Nombre del empleado</span>
              <input
                value={member.fullName}
                onChange={(event) => {
                  const nextFullName = event.currentTarget.value;

                  updateStaffMember(member.id, (currentMember) => ({
                    ...currentMember,
                    fullName: nextFullName,
                  }));
                }}
                placeholder={`Empleado ${index + 1}`}
                className="ui-document-form-control"
              />
            </label>

            <div className="grid gap-4">
              {Object.values(member.documents).map((documentItem) => (
                <ExpiringPdfDropzone
                  key={documentItem.key}
                  id={`staff-${member.id}-${documentItem.key}`}
                  label={documentItem.title}
                  legalText={documentItem.legalText}
                  state={documentItem.fileState}
                  selectLabel="Subir"
                  replaceLabel="Cambiar"
                  onChange={(nextState) =>
                    updateStaffMember(member.id, (currentMember) => ({
                      ...currentMember,
                      documents: {
                        ...currentMember.documents,
                        [documentItem.key]: {
                          ...currentMember.documents[documentItem.key],
                          fileState: nextState,
                        },
                      },
                    }))
                  }
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() =>
                setStaffMembers((currentMembers) =>
                  currentMembers.filter((currentMember) => currentMember.id !== member.id),
                )
              }
              className="ui-pill-button-secondary min-h-12 w-full px-5 text-[#7b5750]"
            >
              Eliminar empleado
            </button>
          </article>
        ))}
      </div>
    );
  };

  return (
    <section className="grid gap-5 transition-all duration-300 ease-in-out">
      {activeSectionConfig ? (
        <DocumentsToolbar activeSectionConfig={activeSectionConfig} onBack={() => setActiveSection(null)} />
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
                    onSelect={(sectionId) => setActiveSection(sectionId)}
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
