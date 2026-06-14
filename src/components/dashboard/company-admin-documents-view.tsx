"use client";

import { useRef, useState, type ReactNode } from "react";

const BASE_MAX_FILE_SIZE_BYTES = 1.5 * 1024 * 1024;
const SANITATION_PLAN_MAX_FILE_SIZE_BYTES = 6 * 1024 * 1024;

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

type DocumentsAccordionKey =
  | "sanitation_plan"
  | "chemical_products"
  | "pest_control"
  | "water_tank_cleaning"
  | "acu_final_disposal"
  | "staff_records";

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

function DocumentStatusIndicator({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const toneClassName = {
    neutral: "border-[#d8e5e6] bg-white/82 text-[#66727a]",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    danger: "border-rose-200 bg-rose-50 text-rose-700",
  }[tone];

  return (
    <span
      className={`inline-flex min-h-9 w-fit items-center justify-center rounded-full border px-3 py-1.5 text-xs font-semibold leading-5 ${toneClassName}`}
    >
      {label}
    </span>
  );
}

function getSingleFileIndicator(fileState: FileInputState, expiresAt?: string) {
  if (!fileState.file) {
    return <DocumentStatusIndicator label="Pendiente" />;
  }

  if (!expiresAt) {
    return <DocumentStatusIndicator label="👁️ Ver documento" tone="success" />;
  }

  if (isExpired(expiresAt)) {
    return <DocumentStatusIndicator label={`Vencido · ${formatShortDate(expiresAt)}`} tone="danger" />;
  }

  return <DocumentStatusIndicator label={`Activo · Vence: ${formatShortDate(expiresAt)}`} tone="success" />;
}

function getCountLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
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

function DocumentsAccordionCard({
  accordionKey,
  title,
  description,
  statusIndicator,
  isOpen,
  onToggle,
  children,
}: {
  accordionKey: DocumentsAccordionKey;
  title: string;
  description: string;
  statusIndicator: ReactNode;
  isOpen: boolean;
  onToggle: (accordionKey: DocumentsAccordionKey) => void;
  children: ReactNode;
}) {
  const contentId = `documents-accordion-${accordionKey}`;

  return (
    <article className="rounded-[1.35rem] p-5 dashboard-card-surface">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={contentId}
        onClick={() => onToggle(accordionKey)}
        className="grid w-full cursor-pointer gap-4 text-left sm:grid-cols-[1fr_auto] sm:items-center"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#12110f] text-white transition-transform duration-200 ${
                isOpen ? "rotate-180" : ""
              }`}
            >
              <svg viewBox="0 0 12 12" aria-hidden="true" className="h-3.5 w-3.5">
                <path
                  d="M2.25 4.5 6 8.25 9.75 4.5"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.8"
                />
              </svg>
            </span>
            <h3 className="text-lg font-semibold tracking-[-0.03em] text-[#12110f] sm:text-xl">{title}</h3>
          </div>
          <p className="mt-2 text-sm leading-6 text-[#5e6770]">{description}</p>
        </div>
        <span className="justify-self-start sm:justify-self-end">{statusIndicator}</span>
      </button>

      {isOpen ? (
        <div id={contentId} className="mt-5 border-t border-[#12110f]/10 pt-5">
          {children}
        </div>
      ) : null}
    </article>
  );
}

export function CompanyAdminDocumentsView() {
  const [activeAccordion, setActiveAccordion] = useState<DocumentsAccordionKey | null>(null);
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

  const toggleAccordion = (accordionKey: DocumentsAccordionKey) => {
    setActiveAccordion((currentAccordion) => (currentAccordion === accordionKey ? null : accordionKey));
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

  return (
    <section className="grid gap-5">
      <DocumentsAccordionCard
        accordionKey="sanitation_plan"
        title="Plan de saneamiento básico"
        description="Contiene 1 documento unificado obligatorio para los cuatro programas de control sanitario (limpieza, plagas, residuos y agua potable)."
        statusIndicator={getSingleFileIndicator(sanitationPlan)}
        isOpen={activeAccordion === "sanitation_plan"}
        onToggle={toggleAccordion}
      >
        <PdfDropzone
          id="sanitation-plan-pdf"
          label="Plan de saneamiento básico"
          state={sanitationPlan}
          maxSizeBytes={SANITATION_PLAN_MAX_FILE_SIZE_BYTES}
          onChange={setSanitationPlan}
          helper="Sube un solo PDF con los 4 programas: Limpieza, Plagas, Residuos y Agua Potable."
        />
      </DocumentsAccordionCard>

      <DocumentsAccordionCard
        accordionKey="chemical_products"
        title="Fichas técnicas y hojas de seguridad"
        description="Contiene 2 documentos obligatorios por cada producto químico usado en la operación (ficha técnica y hoja de seguridad)."
        statusIndicator={
          chemicalProducts.length ? (
            <DocumentStatusIndicator
              label={`🧪 ${getCountLabel(chemicalProducts.length, "Químico", "Químicos")}`}
              tone="success"
            />
          ) : (
            <DocumentStatusIndicator label="0 Productos" />
          )
        }
        isOpen={activeAccordion === "chemical_products"}
        onToggle={toggleAccordion}
      >
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
            <article key={product.id} className="grid gap-4 rounded-2xl bg-white/54 p-4">
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
      </DocumentsAccordionCard>

      <DocumentsAccordionCard
        accordionKey="pest_control"
        title="Control de plagas (Fumigación)"
        description="Contiene 1 documento obligatorio con vigencia mensual o trimestral."
        statusIndicator={getSingleFileIndicator(pestControlCertificate, pestControlCertificate.expiresAt)}
        isOpen={activeAccordion === "pest_control"}
        onToggle={toggleAccordion}
      >
        <ExpiringPdfDropzone
          id="pest-control-certificate"
          label="Certificado de control de plagas"
          legalText="Vigencia legal: máximo 1 mes (mensual) o 3 meses (trimestral), según el riesgo."
          state={pestControlCertificate}
          onChange={setPestControlCertificate}
        />
      </DocumentsAccordionCard>

      <DocumentsAccordionCard
        accordionKey="water_tank_cleaning"
        title="Lavado y desinfección de tanques"
        description="Contiene 1 documento obligatorio con vigencia semestral."
        statusIndicator={getSingleFileIndicator(waterTankCertificate, waterTankCertificate.expiresAt)}
        isOpen={activeAccordion === "water_tank_cleaning"}
        onToggle={toggleAccordion}
      >
        <ExpiringPdfDropzone
          id="water-tank-cleaning-certificate"
          label="Certificado de lavado y desinfección de tanques"
          legalText="Vigencia legal: máximo 6 meses (semestral)."
          state={waterTankCertificate}
          onChange={setWaterTankCertificate}
        />
      </DocumentsAccordionCard>

      <DocumentsAccordionCard
        accordionKey="acu_final_disposal"
        title="Disposición final de aceites (ACU)"
        description="Contiene el historial de certificados por cada entrega realizada."
        statusIndicator={
          activeAcuRecords.length ? (
            <DocumentStatusIndicator
              label={`📄 ${getCountLabel(activeAcuRecords.length, "Entrega", "Entregas")}`}
              tone="success"
            />
          ) : (
            <DocumentStatusIndicator label="Sin registros" />
          )
        }
        isOpen={activeAccordion === "acu_final_disposal"}
        onToggle={toggleAccordion}
      >
        <div className="grid gap-4">
          <div className="grid gap-3 rounded-2xl bg-white/54 p-4">
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
            <p className="text-sm font-semibold text-[#12110f]">Historial de entregas</p>

            {activeAcuRecords.length === 0 ? (
              <p className="ui-empty-state-block">Todavía no hay certificados ACU cargados.</p>
            ) : null}

            {activeAcuRecords.map((record) => (
                <article key={record.id} className="grid gap-3 rounded-2xl bg-white/54 p-4">
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
      </DocumentsAccordionCard>

      <DocumentsAccordionCard
        accordionKey="staff_records"
        title="Fichas del personal"
        description="Contiene 2 documentos obligatorios por cada empleado (manipulación de alimentos y exámenes de aptitud médica)."
        statusIndicator={
          staffMembers.length ? (
            <DocumentStatusIndicator
              label={`👤 ${getCountLabel(staffMembers.length, "Empleado", "Empleados")}`}
              tone="success"
            />
          ) : (
            <DocumentStatusIndicator label="0 Empleados" />
          )
        }
        isOpen={activeAccordion === "staff_records"}
        onToggle={toggleAccordion}
      >
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
            <article key={member.id} className="grid gap-4 rounded-2xl bg-white/54 p-4">
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
      </DocumentsAccordionCard>
    </section>
  );
}
