"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  currentDocumentCategories,
  reportFormOptions,
  type CurrentDocumentCategoryId,
  type HistoryDocumentCategoryId,
  type ReportFormOptionId,
} from "@/lib/branch-reports/config";
import {
  getHistoryPresetRange,
  getReportPresetRange,
  getTodayDateValue,
  type HistoryPeriodPreset,
  type ReportPeriodPreset,
  validateDateRange,
} from "@/lib/branch-reports/dates";
import type { BranchReportPanelData } from "@/lib/branch-reports/types";

type BranchReportsPanelProps = {
  companySlug: string;
  branchSlug: string;
  data: BranchReportPanelData;
};

type StatusMessage = {
  tone: "info" | "success" | "warning" | "error";
  text: string;
};

type DownloadedPdf = {
  file: File;
  objectUrl: string;
  title: string;
};

const formPresetLabels: Record<Exclude<ReportPeriodPreset, "custom">, string> = {
  last7: "Últimos 7 días",
  last30: "Últimos 30 días",
  last3months: "Últimos 3 meses",
};

const historyPresetLabels: Record<HistoryPeriodPreset, string> = {
  last6months: "Últimos 6 meses",
  last12months: "Últimos 12 meses",
  all: "Todo el historial",
  custom: "Rango personalizado",
};
const preparingPdfMessage = "Preparando el PDF. Esto puede tardar unos segundos.";

function joinBasePath(companySlug: string, branchSlug: string) {
  return `/dashboard/sedes/${encodeURIComponent(companySlug)}/${encodeURIComponent(branchSlug)}`;
}

function parseFilename(response: Response, fallback: string) {
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  return match?.[1] ?? fallback;
}

async function parseErrorMessage(response: Response, fallback: string) {
  const data = await response.json().catch(() => null);
  return typeof data?.error === "string" ? data.error : fallback;
}

function isPdfResponse(response: Response) {
  return (response.headers.get("Content-Type") ?? "").toLocaleLowerCase("es-CO").includes("application/pdf");
}

function getMissingCategories(response: Response) {
  const value = response.headers.get("X-Quimly-Missing-Categories");

  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(value));
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function createDownloadedPdf(blob: Blob, filename: string, title: string): DownloadedPdf {
  const file = new File([blob], filename, { type: "application/pdf" });
  return {
    file,
    objectUrl: URL.createObjectURL(blob),
    title,
  };
}

function triggerDownload(downloadedPdf: DownloadedPdf) {
  const link = document.createElement("a");
  link.href = downloadedPdf.objectUrl;
  link.download = downloadedPdf.file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function canSharePdf(downloadedPdf: DownloadedPdf | null) {
  if (!downloadedPdf || typeof navigator === "undefined" || !("canShare" in navigator)) {
    return false;
  }

  return navigator.canShare({ files: [downloadedPdf.file] });
}

function getSelectionSummary(selectedCount: number, totalCount: number, label: string) {
  if (selectedCount === totalCount) {
    return `Todos los ${label}`;
  }

  if (!selectedCount) {
    return `Sin ${label} seleccionados`;
  }

  return `${selectedCount} de ${totalCount} seleccionados`;
}

function StatusAlert({ message }: { message: StatusMessage | null }) {
  if (!message) {
    return null;
  }

  const className = {
    info: "border-[#b8dfe4] bg-[#eefafb] text-[#2a7f86]",
    success: "border-emerald-100 bg-emerald-50 text-emerald-700",
    warning: "border-amber-100 bg-amber-50 text-amber-700",
    error: "border-rose-100 bg-rose-50 text-rose-700",
  }[message.tone];

  return (
    <p className={`rounded-2xl border px-4 py-3 text-sm font-medium leading-6 ${className}`} aria-live="polite">
      {message.text}
    </p>
  );
}

function ActionButtons({
  downloadedPdf,
  onShare,
}: {
  downloadedPdf: DownloadedPdf | null;
  onShare: () => void;
}) {
  if (!downloadedPdf) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <button
        type="button"
        className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#bcc4ca] bg-white px-5 text-sm font-semibold text-[#4f5961] transition active:scale-[0.98]"
        onClick={() => triggerDownload(downloadedPdf)}
      >
        Descargar otra vez
      </button>
      {canSharePdf(downloadedPdf) ? (
        <button
          type="button"
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#bcc4ca] bg-white px-5 text-sm font-semibold text-[#4f5961] transition active:scale-[0.98]"
          onClick={onShare}
        >
          Compartir PDF
        </button>
      ) : null}
    </div>
  );
}

function SectionHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="grid gap-2">
      <h2 className="text-base font-bold uppercase leading-6 tracking-[0.08em] text-[#2a7f86]">{title}</h2>
      <p className="max-w-2xl text-sm leading-6 text-[#5e6770]">{description}</p>
    </div>
  );
}

function SelectionActions({
  summary,
  onSelectAll,
  onClear,
}: {
  summary: string;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8a9298]">{summary}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-full px-3 py-2 text-xs font-semibold text-[#2a7f86] transition active:scale-[0.98]"
          onClick={onSelectAll}
        >
          Seleccionar todos
        </button>
        <button
          type="button"
          className="rounded-full px-3 py-2 text-xs font-semibold text-[#6d7276] transition active:scale-[0.98]"
          onClick={onClear}
        >
          Limpiar selección
        </button>
      </div>
    </div>
  );
}

function PrimaryButton({
  children,
  disabled,
  onClick,
}: {
  children: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#12110f] px-5 text-sm font-semibold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#9aa2a8] sm:w-fit"
    >
      {children}
    </button>
  );
}

function PeriodButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition active:scale-[0.98] ${
        active
          ? "border-[#12110f] bg-[#12110f] text-white"
          : "border-[#bcc4ca] bg-white/80 text-[#4f5961]"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function DateRangeFields({
  from,
  to,
  today,
  onFromChange,
  onToChange,
}: {
  from: string;
  to: string;
  today: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6d7a7f]">Fecha inicial</span>
        <input
          type="date"
          value={from}
          max={today}
          onChange={(event) => onFromChange(event.currentTarget.value)}
          className="min-h-11 rounded-2xl border border-[#bcc4ca] bg-white px-4 text-sm font-semibold text-[#12110f] outline-none transition focus:border-[#2a7f86] focus:ring-4 focus:ring-[#2a7f86]/10"
        />
      </label>
      <label className="grid gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6d7a7f]">Fecha final</span>
        <input
          type="date"
          value={to}
          max={today}
          onChange={(event) => onToChange(event.currentTarget.value)}
          className="min-h-11 rounded-2xl border border-[#bcc4ca] bg-white px-4 text-sm font-semibold text-[#12110f] outline-none transition focus:border-[#2a7f86] focus:ring-4 focus:ring-[#2a7f86]/10"
        />
      </label>
    </div>
  );
}

function CheckboxRow({
  checked,
  title,
  detail,
  onChange,
}: {
  checked: boolean;
  title: string;
  detail?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-14 cursor-pointer items-start gap-3 border-b border-[#e6eaed] py-3 last:border-b-0">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="mt-1 h-5 w-5 shrink-0 accent-[#2a7f86]"
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-5 text-[#12110f]">{title}</span>
        {detail ? <span className="mt-1 block text-xs font-medium leading-5 text-[#7f878d]">{detail}</span> : null}
      </span>
    </label>
  );
}

export function BranchReportsPanel({ companySlug, branchSlug, data }: BranchReportsPanelProps) {
  const basePath = joinBasePath(companySlug, branchSlug);
  const today = useMemo(() => getTodayDateValue(), []);
  const defaultFormRange = useMemo(() => getReportPresetRange("last30", today), [today]);
  const defaultHistoryRange = useMemo(() => getHistoryPresetRange("last6months", today), [today]);
  const [formPreset, setFormPreset] = useState<ReportPeriodPreset>("last30");
  const [formFrom, setFormFrom] = useState(defaultFormRange.from);
  const [formTo, setFormTo] = useState(defaultFormRange.to);
  const [selectedForms, setSelectedForms] = useState<ReportFormOptionId[]>(
    reportFormOptions.map((option) => option.id),
  );
  const [selectedDocumentCategories, setSelectedDocumentCategories] = useState<CurrentDocumentCategoryId[]>(
    currentDocumentCategories.map((category) => category.id),
  );
  const [historyPreset, setHistoryPreset] = useState<HistoryPeriodPreset>("all");
  const [historyFrom, setHistoryFrom] = useState(defaultHistoryRange.from);
  const [historyTo, setHistoryTo] = useState(defaultHistoryRange.to);
  const [activeHistoryCategory, setActiveHistoryCategory] = useState<HistoryDocumentCategoryId | null>(null);
  const [isGeneratingForms, setIsGeneratingForms] = useState(false);
  const [isGeneratingDossier, setIsGeneratingDossier] = useState(false);
  const [isGeneratingHistory, setIsGeneratingHistory] = useState(false);
  const [formsStatus, setFormsStatus] = useState<StatusMessage | null>(null);
  const [documentsStatus, setDocumentsStatus] = useState<StatusMessage | null>(null);
  const [historyStatus, setHistoryStatus] = useState<StatusMessage | null>(null);
  const [formsPdf, setFormsPdf] = useState<DownloadedPdf | null>(null);
  const [dossierPdf, setDossierPdf] = useState<DownloadedPdf | null>(null);
  const [historyPdf, setHistoryPdf] = useState<DownloadedPdf | null>(null);
  const isFormsGenerationInFlight = useRef(false);
  const isDossierGenerationInFlight = useRef(false);
  const isHistoryGenerationInFlight = useRef(false);

  function rememberDownloadedPdf(
    setter: (updater: (currentPdf: DownloadedPdf | null) => DownloadedPdf) => void,
    nextPdf: DownloadedPdf,
  ) {
    setter((currentPdf) => {
      if (currentPdf) {
        URL.revokeObjectURL(currentPdf.objectUrl);
      }

      return nextPdf;
    });
    triggerDownload(nextPdf);
  }

  async function shareDownloadedPdf(downloadedPdf: DownloadedPdf | null) {
    if (!downloadedPdf || !canSharePdf(downloadedPdf)) {
      return;
    }

    await navigator.share({
      files: [downloadedPdf.file],
      title: downloadedPdf.title,
    }).catch(() => {});
  }

  function setQuickFormRange(preset: Exclude<ReportPeriodPreset, "custom">) {
    const range = getReportPresetRange(preset, today);
    setFormPreset(preset);
    setFormFrom(range.from);
    setFormTo(range.to);
    setFormsStatus(null);
  }

  function setQuickHistoryRange(preset: Exclude<HistoryPeriodPreset, "custom" | "all">) {
    const range = getHistoryPresetRange(preset, today);
    setHistoryPreset(preset);
    setHistoryFrom(range.from);
    setHistoryTo(range.to);
    setHistoryStatus(null);
  }

  const selectedMissingDocumentCategories = data.documentCategories.filter(
    (category) =>
      selectedDocumentCategories.includes(category.id) &&
      category.availableFileCount === 0,
  );
  const allSelectedDocumentCategoriesAreMissing =
    selectedDocumentCategories.length > 0 &&
    selectedMissingDocumentCategories.length === selectedDocumentCategories.length;

  useEffect(() => {
    return () => {
      if (formsPdf) {
        URL.revokeObjectURL(formsPdf.objectUrl);
      }
    };
  }, [formsPdf]);

  useEffect(() => {
    return () => {
      if (dossierPdf) {
        URL.revokeObjectURL(dossierPdf.objectUrl);
      }
    };
  }, [dossierPdf]);

  useEffect(() => {
    return () => {
      if (historyPdf) {
        URL.revokeObjectURL(historyPdf.objectUrl);
      }
    };
  }, [historyPdf]);

  async function downloadPdf({
    url,
    fallbackFilename,
    title,
    setter,
  }: {
    url: string;
    fallbackFilename: string;
    title: string;
    setter: (updater: (currentPdf: DownloadedPdf | null) => DownloadedPdf) => void;
  }) {
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(await parseErrorMessage(response, "No fue posible generar el PDF. Intenta nuevamente."));
    }

    if (!isPdfResponse(response)) {
      throw new Error("No fue posible generar el PDF. Intenta nuevamente.");
    }

    const filename = parseFilename(response, fallbackFilename);
    const blob = await response.blob();
    const pdf = createDownloadedPdf(blob, filename, title);
    rememberDownloadedPdf(setter, pdf);

    return {
      missingCategories: getMissingCategories(response),
    };
  }

  async function generateFormsReport() {
    if (isFormsGenerationInFlight.current) {
      return;
    }

    const validation = validateDateRange(formFrom, formTo, today);

    if (!selectedForms.length) {
      setFormsStatus({ tone: "error", text: "Selecciona al menos un formulario." });
      return;
    }

    if (!validation.ok) {
      setFormsStatus({ tone: "error", text: validation.error });
      return;
    }

    const params = new URLSearchParams({
      from: validation.from,
      to: validation.to,
      forms: selectedForms.join(","),
    });

    isFormsGenerationInFlight.current = true;
    setIsGeneratingForms(true);
    setFormsStatus({ tone: "info", text: preparingPdfMessage });

    try {
      await downloadPdf({
        url: `${basePath}/reportes/formularios.pdf?${params.toString()}`,
        fallbackFilename: "quimly-reporte-formularios.pdf",
        title: "Reporte de formularios",
        setter: setFormsPdf,
      });
      setFormsStatus({ tone: "success", text: "Reporte generado correctamente." });
    } catch (error) {
      setFormsStatus({
        tone: "error",
        text: error instanceof Error ? error.message : "No fue posible generar el PDF. Intenta nuevamente.",
      });
    } finally {
      isFormsGenerationInFlight.current = false;
      setIsGeneratingForms(false);
    }
  }

  async function generateSanitaryDossier() {
    if (isDossierGenerationInFlight.current) {
      return;
    }

    if (!selectedDocumentCategories.length) {
      setDocumentsStatus({ tone: "error", text: "Selecciona al menos una categoría." });
      return;
    }

    const params = new URLSearchParams({
      categories: selectedDocumentCategories.join(","),
    });

    isDossierGenerationInFlight.current = true;
    setIsGeneratingDossier(true);
    setDocumentsStatus({ tone: "info", text: preparingPdfMessage });

    try {
      const result = await downloadPdf({
        url: `${basePath}/reportes/expediente-sanitario.pdf?${params.toString()}`,
        fallbackFilename: "quimly-expediente-sanitario.pdf",
        title: "Expediente sanitario",
        setter: setDossierPdf,
      });

      if (result.missingCategories.length) {
        setDocumentsStatus({
          tone: "warning",
          text: `Expediente generado. No hay archivos disponibles en ${result.missingCategories.join(", ")}.`,
        });
      } else {
        setDocumentsStatus({ tone: "success", text: "Expediente generado correctamente." });
      }
    } catch (error) {
      setDocumentsStatus({
        tone: "error",
        text: error instanceof Error ? error.message : "No fue posible generar el PDF. Intenta nuevamente.",
      });
    } finally {
      isDossierGenerationInFlight.current = false;
      setIsGeneratingDossier(false);
    }
  }

  async function generateHistoryPdf(categoryId: HistoryDocumentCategoryId) {
    if (isHistoryGenerationInFlight.current) {
      return;
    }

    const params = new URLSearchParams({
      category: categoryId,
      period: historyPreset,
    });

    if (historyPreset !== "all") {
      const range = historyPreset === "custom" ? { from: historyFrom, to: historyTo } : getHistoryPresetRange(historyPreset, today);
      const validation = validateDateRange(range.from, range.to, today);

      if (!validation.ok) {
        setHistoryStatus({ tone: "error", text: validation.error });
        return;
      }

      params.set("from", validation.from);
      params.set("to", validation.to);
    }

    isHistoryGenerationInFlight.current = true;
    setIsGeneratingHistory(true);
    setHistoryStatus({ tone: "info", text: preparingPdfMessage });

    try {
      await downloadPdf({
        url: `${basePath}/reportes/historial-documental.pdf?${params.toString()}`,
        fallbackFilename: "quimly-historial-documental.pdf",
        title: "Historial documental",
        setter: setHistoryPdf,
      });
      setHistoryStatus({ tone: "success", text: "Historial generado correctamente." });
    } catch (error) {
      setHistoryStatus({
        tone: "error",
        text: error instanceof Error ? error.message : "No fue posible generar el PDF. Intenta nuevamente.",
      });
    } finally {
      isHistoryGenerationInFlight.current = false;
      setIsGeneratingHistory(false);
    }
  }

  const formRangeInvalid = !validateDateRange(formFrom, formTo, today).ok;
  const documentsSummary = getSelectionSummary(
    selectedDocumentCategories.length,
    currentDocumentCategories.length,
    "documentos",
  );

  return (
    <div className="grid gap-8 p-4 sm:p-6">
      <section className="grid gap-5">
        <SectionHeader
          title="Reportes de formularios"
          description="Selecciona el periodo y los formularios que deseas incluir."
        />

        <div className="grid gap-3">
          <div className="flex flex-wrap gap-2" aria-label="Periodo del reporte de formularios">
            {Object.entries(formPresetLabels).map(([preset, label]) => (
              <PeriodButton
                key={preset}
                label={label}
                active={formPreset === preset}
                onClick={() => setQuickFormRange(preset as Exclude<ReportPeriodPreset, "custom">)}
              />
            ))}
            <PeriodButton
              label="Rango personalizado"
              active={formPreset === "custom"}
              onClick={() => {
                setFormPreset("custom");
                setFormsStatus(null);
              }}
            />
          </div>

          {formPreset === "custom" ? (
            <DateRangeFields
              from={formFrom}
              to={formTo}
              today={today}
              onFromChange={(value) => {
                setFormFrom(value);
                setFormsStatus(null);
              }}
              onToChange={(value) => {
                setFormTo(value);
                setFormsStatus(null);
              }}
            />
          ) : null}
        </div>

        <div className="grid gap-2">
          <SelectionActions
            summary={getSelectionSummary(selectedForms.length, reportFormOptions.length, "formularios")}
            onSelectAll={() => setSelectedForms(reportFormOptions.map((option) => option.id))}
            onClear={() => setSelectedForms([])}
          />
          <div className="overflow-hidden rounded-[1.2rem] border border-[#e6eaed] bg-white/60 px-4">
            {reportFormOptions.map((option) => (
              <CheckboxRow
                key={option.id}
                checked={selectedForms.includes(option.id)}
                title={option.label}
                onChange={(checked) => {
                  setSelectedForms((currentSelection) =>
                    checked
                      ? [...currentSelection, option.id]
                      : currentSelection.filter((formType) => formType !== option.id),
                  );
                  setFormsStatus(null);
                }}
              />
            ))}
          </div>
        </div>

        <StatusAlert message={formsStatus} />
        <div className="grid gap-3 sm:flex sm:items-center">
          <PrimaryButton
            disabled={isGeneratingForms || !selectedForms.length || formRangeInvalid}
            onClick={generateFormsReport}
          >
            {isGeneratingForms ? "Preparando PDF..." : "Generar reporte de formularios"}
          </PrimaryButton>
          <ActionButtons downloadedPdf={formsPdf} onShare={() => shareDownloadedPdf(formsPdf)} />
        </div>
      </section>

      <section className="grid gap-6 border-t border-[#e6eaed] pt-8">
        <div className="grid gap-5">
          <SectionHeader
            title="Documentos sanitarios"
            description="Selecciona las categorías que deseas incluir. Quimly unirá los archivos actualmente registrados en un solo PDF."
          />

          <div className="grid gap-2">
            <SelectionActions
              summary={documentsSummary}
              onSelectAll={() => setSelectedDocumentCategories(currentDocumentCategories.map((category) => category.id))}
              onClear={() => setSelectedDocumentCategories([])}
            />
            <div className="overflow-hidden rounded-[1.2rem] border border-[#e6eaed] bg-white/60 px-4">
              {data.documentCategories.map((category) => (
                <CheckboxRow
                  key={category.id}
                  checked={selectedDocumentCategories.includes(category.id)}
                  title={category.title}
                  detail={category.countLabel}
                  onChange={(checked) => {
                    setSelectedDocumentCategories((currentSelection) =>
                      checked
                        ? [...currentSelection, category.id]
                        : currentSelection.filter((categoryId) => categoryId !== category.id),
                    );
                    setDocumentsStatus(null);
                  }}
                />
              ))}
            </div>
          </div>

          {selectedMissingDocumentCategories.length ? (
            <StatusAlert
              message={{
                tone: "warning",
                text: allSelectedDocumentCategoriesAreMissing
                  ? "No hay archivos disponibles en las categorías seleccionadas."
                  : `Se generará el expediente con las categorías que tengan archivos. No hay archivos disponibles en ${selectedMissingDocumentCategories
                      .map((category) => category.title)
                      .join(", ")}.`,
              }}
            />
          ) : null}

          <StatusAlert message={documentsStatus} />
          <div className="grid gap-3 sm:flex sm:items-center">
            <PrimaryButton
              disabled={isGeneratingDossier || !selectedDocumentCategories.length}
              onClick={generateSanitaryDossier}
            >
              {isGeneratingDossier ? "Preparando PDF..." : "Generar expediente sanitario en PDF"}
            </PrimaryButton>
            <ActionButtons downloadedPdf={dossierPdf} onShare={() => shareDownloadedPdf(dossierPdf)} />
          </div>
        </div>

        <div className="grid gap-4 border-t border-[#e6eaed] pt-6">
          <SectionHeader
            title="Historial documental"
            description="Descarga certificados y soportes almacenados anteriormente."
          />

          <div className="overflow-hidden rounded-[1.2rem] border border-[#e6eaed] bg-white/60">
            {data.historyCategories.map((category) => {
              const isActive = activeHistoryCategory === category.id;

              return (
                <div key={category.id} className="border-b border-[#e6eaed] p-4 last:border-b-0">
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div>
                      <h3 className="text-sm font-semibold leading-5 text-[#12110f]">{category.title}</h3>
                      <p className="mt-1 text-xs font-medium leading-5 text-[#7f878d]">{category.countLabel}</p>
                    </div>
                    <button
                      type="button"
                      className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#bcc4ca] bg-white px-4 text-sm font-semibold text-[#4f5961] transition active:scale-[0.98]"
                      onClick={() => {
                        setActiveHistoryCategory(isActive ? null : category.id);
                        setHistoryStatus(null);
                      }}
                    >
                      Descargar historial
                    </button>
                  </div>

                  {isActive ? (
                    <div className="mt-4 grid gap-4 rounded-[1rem] border border-[#e6eaed] bg-[#f8fafb] p-4">
                      <div className="flex flex-wrap gap-2" aria-label="Periodo del historial documental">
                        <PeriodButton
                          label={historyPresetLabels.last6months}
                          active={historyPreset === "last6months"}
                          onClick={() => setQuickHistoryRange("last6months")}
                        />
                        <PeriodButton
                          label={historyPresetLabels.last12months}
                          active={historyPreset === "last12months"}
                          onClick={() => setQuickHistoryRange("last12months")}
                        />
                        <PeriodButton
                          label={historyPresetLabels.all}
                          active={historyPreset === "all"}
                          onClick={() => {
                            setHistoryPreset("all");
                            setHistoryStatus(null);
                          }}
                        />
                        <PeriodButton
                          label={historyPresetLabels.custom}
                          active={historyPreset === "custom"}
                          onClick={() => {
                            setHistoryPreset("custom");
                            setHistoryStatus(null);
                          }}
                        />
                      </div>

                      {historyPreset === "custom" ? (
                        <DateRangeFields
                          from={historyFrom}
                          to={historyTo}
                          today={today}
                          onFromChange={(value) => {
                            setHistoryFrom(value);
                            setHistoryStatus(null);
                          }}
                          onToChange={(value) => {
                            setHistoryTo(value);
                            setHistoryStatus(null);
                          }}
                        />
                      ) : null}

                      <StatusAlert message={historyStatus} />
                      <div className="grid gap-3 sm:flex sm:items-center">
                        <PrimaryButton
                          disabled={isGeneratingHistory}
                          onClick={() => generateHistoryPdf(category.id)}
                        >
                          {isGeneratingHistory ? "Preparando PDF..." : "Generar PDF histórico"}
                        </PrimaryButton>
                        <ActionButtons downloadedPdf={historyPdf} onShare={() => shareDownloadedPdf(historyPdf)} />
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
