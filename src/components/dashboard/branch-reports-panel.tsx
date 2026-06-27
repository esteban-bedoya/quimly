"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { DatePicker } from "@/components/ui/date-time-picker";
import {
  reportFormOptions,
  type CurrentDocumentCategoryId,
  type HistoryDocumentCategoryId,
  type ReportFormOptionId,
} from "@/lib/branch-reports/config";
import {
  getHistoryPresetRange,
  getReportPresetRange,
  getTodayDateValue,
  MAX_CUSTOM_REPORT_RANGE_ERROR_MESSAGE,
  MAX_CUSTOM_REPORT_RANGE_MESSAGE,
  MAX_CUSTOM_REPORT_RANGE_MONTHS,
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
  body?: string;
};

type DownloadedPdf = {
  url: string;
  downloadUrl: string;
  filename: string;
  expiresAt: string;
  sizeBytes: number;
  title: string;
};

type FormsReportSummary = {
  selectedFormCount: number;
  includedFormCount: number;
  missingForms: string[];
};

type ReportDatePickerFieldId = "form-from" | "form-to" | "history-from" | "history-to";
type ActiveReportModal = "forms" | "documents" | "history";

const formPresetLabels: Record<Exclude<ReportPeriodPreset, "custom">, string> = {
  last7: "Últimos 7 días",
  last30: "Últimos 30 días",
  last3months: "Últimos 3 meses",
};

const historyPresetLabels: Record<HistoryPeriodPreset, string> = {
  last6months: "Últimos 6 meses",
  last12months: "Últimos 12 meses",
  custom: "Rango personalizado",
};
const preparingPdfMessage = "Generando PDF.\nEsto puede tardar unos segundos.";
const generatePdfButtonLabel = "Generar PDF";
const emptyCategoryHighlightDurationMs = 5000;

function joinBasePath(companySlug: string, branchSlug: string) {
  return `/dashboard/sedes/${encodeURIComponent(companySlug)}/${encodeURIComponent(branchSlug)}`;
}

async function parseErrorMessage(response: Response, fallback: string) {
  const data = await response.json().catch(() => null);
  return typeof data?.error === "string" ? data.error : fallback;
}

function isGeneratedPdfResponse(
  data: unknown,
): data is Omit<DownloadedPdf, "title"> & { success: true; missingCategories?: string[]; formReportSummary?: unknown } {
  if (!data || typeof data !== "object") {
    return false;
  }

  const record = data as Record<string, unknown>;
  return (
    record.success === true &&
    typeof record.url === "string" &&
    typeof record.downloadUrl === "string" &&
    typeof record.filename === "string" &&
    typeof record.expiresAt === "string" &&
    typeof record.sizeBytes === "number"
  );
}

function getResponseMissingCategories(data: { missingCategories?: unknown }) {
  return Array.isArray(data.missingCategories)
    ? data.missingCategories.filter((item): item is string => typeof item === "string")
    : [];
}

function getResponseFormsReportSummary(data: { formReportSummary?: unknown }): FormsReportSummary | null {
  const summary = data.formReportSummary;

  if (!summary || typeof summary !== "object") {
    return null;
  }

  const record = summary as Record<string, unknown>;
  const missingForms = Array.isArray(record.missingForms)
    ? record.missingForms.filter((item): item is string => typeof item === "string")
    : [];

  if (typeof record.selectedFormCount !== "number" || typeof record.includedFormCount !== "number") {
    return null;
  }

  return {
    selectedFormCount: record.selectedFormCount,
    includedFormCount: record.includedFormCount,
    missingForms,
  };
}

function formatBulletList(items: string[]) {
  return items.map((item) => `• ${item}`).join("\n");
}

function getMissingFormsMessage(count: number) {
  if (count === 1) {
    return "1 formulario seleccionado no tenía registros en el periodo.";
  }

  return `${count} formularios seleccionados no tenían registros en el periodo.`;
}

function isGeneratedReportExpired(report: DownloadedPdf) {
  return Date.parse(report.expiresAt) <= Date.now();
}

function triggerDownload(downloadedPdf: DownloadedPdf) {
  const link = document.createElement("a");
  link.href = downloadedPdf.downloadUrl || downloadedPdf.url;
  link.download = downloadedPdf.filename;
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function canSharePdf(downloadedPdf: DownloadedPdf | null) {
  if (!downloadedPdf || typeof navigator === "undefined" || !("share" in navigator)) {
    return false;
  }

  if ("canShare" in navigator) {
    return navigator.canShare({ url: downloadedPdf.url });
  }

  return true;
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
    <div className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${className}`} aria-live="polite">
      <p className={`whitespace-pre-line ${message.body ? "font-semibold" : "font-medium"}`}>{message.text}</p>
      {message.body ? <p className="mt-1 whitespace-pre-line font-normal">{message.body}</p> : null}
    </div>
  );
}

function ActionButtons({
  downloadedPdf,
  onOpen,
  onDownload,
  onShare,
}: {
  downloadedPdf: DownloadedPdf | null;
  onOpen: () => void;
  onDownload: () => void;
  onShare: () => void;
}) {
  if (!downloadedPdf) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <button
        type="button"
        className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#12110f] bg-[#12110f] px-5 text-sm font-semibold text-white transition hover:scale-[1.02] hover:border-[#2b2824] hover:bg-[#2b2824] active:scale-[0.98]"
        onClick={onOpen}
      >
        Abrir
      </button>
      <button
        type="button"
        className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#bcc4ca] bg-white px-5 text-sm font-semibold text-[#4f5961] transition hover:scale-[1.02] hover:border-[#9aa2a8] hover:bg-[#e7e7e7] hover:text-[#12110f] active:scale-[0.98]"
        onClick={onDownload}
      >
        Descargar
      </button>
      {canSharePdf(downloadedPdf) ? (
        <button
          type="button"
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#bcc4ca] bg-white px-5 text-sm font-semibold text-[#4f5961] transition hover:scale-[1.02] hover:border-[#9aa2a8] hover:bg-[#e7e7e7] hover:text-[#12110f] active:scale-[0.98]"
          onClick={onShare}
        >
          Compartir
        </button>
      ) : null}
    </div>
  );
}

function ReportGenerationModal({
  title,
  status,
  detailStatus,
  downloadedPdf,
  isGenerating,
  onOpen,
  onDownload,
  onShare,
  onClose,
}: {
  title: string;
  status: StatusMessage | null;
  detailStatus?: StatusMessage | null;
  downloadedPdf: DownloadedPdf | null;
  isGenerating: boolean;
  onOpen: () => void;
  onDownload: () => void;
  onShare: () => void;
  onClose: () => void;
}) {
  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex min-h-screen w-screen items-center justify-center bg-[#12110f]/40 px-4 py-6 backdrop-blur-md">
      <div
        className="ui-document-modal ui-modal-surface w-full max-w-sm max-h-[calc(100vh-3rem)] overflow-y-auto rounded-[1.7rem] p-6 text-left transition-all duration-300 ease-in-out animate-fadeIn"
        aria-busy={isGenerating}
        aria-modal="true"
        role="dialog"
      >
        <div className="space-y-2">
          <h3 className="ui-modal-title">{title}</h3>
        </div>

        <div className="mt-4 grid gap-4">
          {isGenerating ? (
            <div className="flex items-center gap-3 rounded-2xl border border-[#e6eaed] bg-[#f8fafb] px-4 py-3 text-sm font-medium text-[#4f5961]">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#c7d2d6] border-t-[#2a7f86]" aria-hidden="true" />
              <span className="grid leading-5">
                <span>Generando PDF.</span>
                <span>Esto puede tardar unos segundos.</span>
              </span>
            </div>
          ) : null}
          {!isGenerating ? <StatusAlert message={status} /> : null}
          {!isGenerating ? <StatusAlert message={detailStatus ?? null} /> : null}
          {!isGenerating ? (
            <ActionButtons downloadedPdf={downloadedPdf} onOpen={onOpen} onDownload={onDownload} onShare={onShare} />
          ) : null}
        </div>

        {!isGenerating ? (
          <>
            <div className="mt-5 h-px bg-[#e6eaed]" />
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                className="ui-pill-button-secondary ui-modal-action-secondary"
              >
                Cerrar
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>,
    document.body,
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

function ReportPanelCard({ children }: { children: ReactNode }) {
  return (
    <section className="grid gap-5 rounded-[1.45rem] p-5 dashboard-card-surface dashboard-card-surface-operational sm:p-6">
      {children}
    </section>
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
          ? "border-[#2a7f86] bg-[#e8f6f7] text-[#1f6f76] shadow-[0_1px_2px_rgba(42,127,134,0.08)]"
          : "border-[#bcc4ca] bg-white/80 text-[#4f5961]"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
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

function ReportDateInput({
  id,
  value,
  min,
  max,
  activeField,
  onActiveFieldChange,
  onChange,
}: {
  id: ReportDatePickerFieldId;
  value: string;
  min?: string;
  max: string;
  activeField: ReportDatePickerFieldId | null;
  onActiveFieldChange: (field: ReportDatePickerFieldId | null) => void;
  onChange: (value: string) => void;
}) {
  const displayValue = formatDateInputValue(value);
  const isOpen = activeField === id;
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
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

      onActiveFieldChange(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onActiveFieldChange(null);
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
  }, [isOpen, onActiveFieldChange, updatePickerPosition]);

  return (
    <div className="ui-document-date-field">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => {
          updatePickerPosition();
          onActiveFieldChange(isOpen ? null : id);
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
            onMouseDown={() => onActiveFieldChange(null)}
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
              showMonthYearSelect
              minYear={2023}
              value={value}
              min={min}
              max={max}
              onChange={(nextValue) => {
                onChange(nextValue);
                onActiveFieldChange(null);
              }}
            />
          </div>
        </>,
        document.body,
      ) : null}
    </div>
  );
}

function DateRangeFields({
  from,
  to,
  today,
  activeField,
  fromFieldId,
  toFieldId,
  isRangeTooLong,
  onActiveFieldChange,
  onFromChange,
  onToChange,
}: {
  from: string;
  to: string;
  today: string;
  activeField: ReportDatePickerFieldId | null;
  fromFieldId: ReportDatePickerFieldId;
  toFieldId: ReportDatePickerFieldId;
  isRangeTooLong: boolean;
  onActiveFieldChange: (field: ReportDatePickerFieldId | null) => void;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6d7a7f]">Fecha inicial</span>
          <ReportDateInput
            id={fromFieldId}
            value={from}
            max={to || today}
            activeField={activeField}
            onActiveFieldChange={onActiveFieldChange}
            onChange={onFromChange}
          />
        </label>
        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6d7a7f]">Fecha final</span>
          <ReportDateInput
            id={toFieldId}
            value={to}
            min={from || undefined}
            max={today}
            activeField={activeField}
            onActiveFieldChange={onActiveFieldChange}
            onChange={onToChange}
          />
        </label>
      </div>
      {isRangeTooLong ? (
        <p className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-medium leading-6 text-rose-700">
          {MAX_CUSTOM_REPORT_RANGE_ERROR_MESSAGE}
        </p>
      ) : (
        <p className="flex items-center gap-1.5 text-xs font-medium leading-5 text-[#3f747a]">
          <svg className="h-4 w-4 shrink-0 text-[#2a7f86]" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 7.35v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="8" cy="4.85" r="0.75" fill="currentColor" />
          </svg>
          {MAX_CUSTOM_REPORT_RANGE_MESSAGE}
        </p>
      )}
    </div>
  );
}

function CheckboxRow({
  checked,
  title,
  detail,
  disabled,
  detailHighlighted,
  onChange,
  onDisabledClick,
}: {
  checked: boolean;
  title: string;
  detail?: string;
  disabled?: boolean;
  detailHighlighted?: boolean;
  onChange: (checked: boolean) => void;
  onDisabledClick?: () => void;
}) {
  return (
    <label
      aria-disabled={disabled ? true : undefined}
      className={`flex min-h-14 items-start gap-3 border-b border-[#e6eaed] py-3 transition last:border-b-0 ${
        disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer"
      }`}
      onClick={(event) => {
        if (!disabled) {
          return;
        }

        event.preventDefault();
        onDisabledClick?.();
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        aria-disabled={disabled ? true : undefined}
        onChange={(event) => {
          if (disabled) {
            onDisabledClick?.();
            return;
          }

          onChange(event.currentTarget.checked);
        }}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={`mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition duration-150 peer-focus-visible:ring-4 peer-focus-visible:ring-[#2a7f86]/15 ${
          checked
            ? "border-[#2a7f86] bg-[#2a7f86] text-white shadow-[0_6px_14px_rgba(42,127,134,0.24)]"
            : disabled
              ? "border-[#d5dbdf] bg-[#f5f7f8] text-transparent"
            : "border-[#bcc4ca] bg-white text-transparent"
        }`}
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
          <path
            d="M3.5 8.2 6.5 11 12.5 5"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.2"
          />
        </svg>
      </span>
      <span className="min-w-0">
        <span className={`block text-sm font-semibold leading-5 ${disabled ? "text-[#5f676e]" : "text-[#12110f]"}`}>
          {title}
        </span>
        {detail ? (
          <span
            className={`mt-1 block w-fit font-medium leading-5 transition ${
              detailHighlighted
                ? "rounded-2xl border border-amber-100 bg-amber-50 px-4 py-2 text-sm text-amber-700"
                : "text-xs text-[#7f878d]"
            }`}
          >
            {detail}
          </span>
        ) : null}
      </span>
    </label>
  );
}

export function BranchReportsPanel({ companySlug, branchSlug, data }: BranchReportsPanelProps) {
  const basePath = joinBasePath(companySlug, branchSlug);
  const today = useMemo(() => getTodayDateValue(), []);
  const defaultFormRange = useMemo(() => getReportPresetRange("last30", today), [today]);
  const defaultHistoryRange = useMemo(() => getHistoryPresetRange("last6months", today), [today]);
  const availableDocumentCategoryIds = useMemo(
    () =>
      data.documentCategories
        .filter((category) => category.availableFileCount > 0)
        .map((category) => category.id),
    [data.documentCategories],
  );
  const availableDocumentCategoryIdSet = useMemo(
    () => new Set<CurrentDocumentCategoryId>(availableDocumentCategoryIds),
    [availableDocumentCategoryIds],
  );
  const emptyDocumentCategoryIds = useMemo(
    () =>
      data.documentCategories
        .filter((category) => category.availableFileCount === 0)
        .map((category) => category.id),
    [data.documentCategories],
  );
  const [formPreset, setFormPreset] = useState<ReportPeriodPreset>("last30");
  const [formFrom, setFormFrom] = useState(defaultFormRange.from);
  const [formTo, setFormTo] = useState(defaultFormRange.to);
  const [selectedForms, setSelectedForms] = useState<ReportFormOptionId[]>(
    reportFormOptions.map((option) => option.id),
  );
  const [selectedDocumentCategories, setSelectedDocumentCategories] = useState<CurrentDocumentCategoryId[]>(
    availableDocumentCategoryIds,
  );
  const [historyPreset, setHistoryPreset] = useState<HistoryPeriodPreset>("last6months");
  const [historyFrom, setHistoryFrom] = useState(defaultHistoryRange.from);
  const [historyTo, setHistoryTo] = useState(defaultHistoryRange.to);
  const [activeHistoryCategory, setActiveHistoryCategory] = useState<HistoryDocumentCategoryId | null>(null);
  const [activeDatePickerField, setActiveDatePickerField] = useState<ReportDatePickerFieldId | null>(null);
  const [isGeneratingForms, setIsGeneratingForms] = useState(false);
  const [isGeneratingDossier, setIsGeneratingDossier] = useState(false);
  const [isGeneratingHistory, setIsGeneratingHistory] = useState(false);
  const [formsStatus, setFormsStatus] = useState<StatusMessage | null>(null);
  const [formsDetailStatus, setFormsDetailStatus] = useState<StatusMessage | null>(null);
  const [documentsStatus, setDocumentsStatus] = useState<StatusMessage | null>(null);
  const [historyStatus, setHistoryStatus] = useState<StatusMessage | null>(null);
  const [activeReportModal, setActiveReportModal] = useState<ActiveReportModal | null>(null);
  const [emptyDocumentCategoryHighlights, setEmptyDocumentCategoryHighlights] = useState<
    Partial<Record<CurrentDocumentCategoryId, boolean>>
  >({});
  const [emptyHistoryCategoryHighlights, setEmptyHistoryCategoryHighlights] = useState<
    Partial<Record<HistoryDocumentCategoryId, boolean>>
  >({});
  const [formsPdf, setFormsPdf] = useState<DownloadedPdf | null>(null);
  const [dossierPdf, setDossierPdf] = useState<DownloadedPdf | null>(null);
  const [historyPdf, setHistoryPdf] = useState<DownloadedPdf | null>(null);
  const isFormsGenerationInFlight = useRef(false);
  const isDossierGenerationInFlight = useRef(false);
  const isHistoryGenerationInFlight = useRef(false);
  const emptyDocumentCategoryHighlightTimeouts = useRef<Partial<Record<CurrentDocumentCategoryId, number>>>({});
  const emptyHistoryCategoryHighlightTimeouts = useRef<Partial<Record<HistoryDocumentCategoryId, number>>>({});

  useEffect(() => {
    const documentTimeouts = emptyDocumentCategoryHighlightTimeouts.current;
    const historyTimeouts = emptyHistoryCategoryHighlightTimeouts.current;

    return () => {
      Object.values(documentTimeouts).forEach((timeoutId) => {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }
      });
      Object.values(historyTimeouts).forEach((timeoutId) => {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }
      });
    };
  }, []);

  function clearEmptyDocumentCategoryHighlights() {
    Object.values(emptyDocumentCategoryHighlightTimeouts.current).forEach((timeoutId) => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    });
    emptyDocumentCategoryHighlightTimeouts.current = {};
    setEmptyDocumentCategoryHighlights({});
  }

  function showEmptyDocumentCategoryHighlights(categoryIds: CurrentDocumentCategoryId[]) {
    clearEmptyDocumentCategoryHighlights();

    if (!categoryIds.length) {
      return;
    }

    setEmptyDocumentCategoryHighlights(
      categoryIds.reduce<Partial<Record<CurrentDocumentCategoryId, boolean>>>((highlights, categoryId) => {
        highlights[categoryId] = true;
        return highlights;
      }, {}),
    );

    categoryIds.forEach((categoryId) => {
      emptyDocumentCategoryHighlightTimeouts.current[categoryId] = window.setTimeout(() => {
        setEmptyDocumentCategoryHighlights((currentHighlights) => ({ ...currentHighlights, [categoryId]: false }));
        delete emptyDocumentCategoryHighlightTimeouts.current[categoryId];
      }, emptyCategoryHighlightDurationMs);
    });
  }

  function showEmptyDocumentCategoryHighlight(categoryId: CurrentDocumentCategoryId) {
    showEmptyDocumentCategoryHighlights([categoryId]);
  }

  function showEmptyHistoryCategoryHighlight(categoryId: HistoryDocumentCategoryId) {
    const currentTimeoutId = emptyHistoryCategoryHighlightTimeouts.current[categoryId];

    if (currentTimeoutId) {
      window.clearTimeout(currentTimeoutId);
    }

    setActiveHistoryCategory(null);
    setEmptyHistoryCategoryHighlights((currentHighlights) => ({ ...currentHighlights, [categoryId]: true }));
    emptyHistoryCategoryHighlightTimeouts.current[categoryId] = window.setTimeout(() => {
      setEmptyHistoryCategoryHighlights((currentHighlights) => ({ ...currentHighlights, [categoryId]: false }));
      delete emptyHistoryCategoryHighlightTimeouts.current[categoryId];
    }, emptyCategoryHighlightDurationMs);
  }

  function clearExpiredReport(
    report: DownloadedPdf,
    setter: (nextPdf: DownloadedPdf | null) => void,
    setStatus: (message: StatusMessage) => void,
  ) {
    if (!isGeneratedReportExpired(report)) {
      return false;
    }

    setter(null);
    setStatus({ tone: "error", text: "El enlace venció. Genera nuevamente el reporte." });
    return true;
  }

  function openGeneratedReport(
    report: DownloadedPdf | null,
    setter: (nextPdf: DownloadedPdf | null) => void,
    setStatus: (message: StatusMessage) => void,
  ) {
    if (!report || clearExpiredReport(report, setter, setStatus)) {
      return;
    }

    const openedWindow = window.open(report.url, "_blank", "noopener,noreferrer");

    if (openedWindow) {
      openedWindow.opener = null;
    }
  }

  function downloadGeneratedReport(
    report: DownloadedPdf | null,
    setter: (nextPdf: DownloadedPdf | null) => void,
    setStatus: (message: StatusMessage) => void,
  ) {
    if (!report || clearExpiredReport(report, setter, setStatus)) {
      return;
    }

    triggerDownload(report);
  }

  async function shareDownloadedPdf(
    downloadedPdf: DownloadedPdf | null,
    setter: (nextPdf: DownloadedPdf | null) => void,
    setStatus: (message: StatusMessage) => void,
  ) {
    if (!downloadedPdf || clearExpiredReport(downloadedPdf, setter, setStatus) || !canSharePdf(downloadedPdf)) {
      return;
    }

    await navigator.share({
      title: downloadedPdf.title,
      url: downloadedPdf.url,
    }).catch(() => {});
  }

  function setQuickFormRange(preset: Exclude<ReportPeriodPreset, "custom">) {
    const range = getReportPresetRange(preset, today);
    setFormPreset(preset);
    setFormFrom(range.from);
    setFormTo(range.to);
    setActiveDatePickerField(null);
    setFormsStatus(null);
    setFormsDetailStatus(null);
  }

  function setQuickHistoryRange(preset: Exclude<HistoryPeriodPreset, "custom">) {
    const range = getHistoryPresetRange(preset, today);
    setHistoryPreset(preset);
    setHistoryFrom(range.from);
    setHistoryTo(range.to);
    setActiveDatePickerField(null);
    setHistoryStatus(null);
  }

  const selectedAvailableDocumentCategories = selectedDocumentCategories.filter((categoryId) =>
    availableDocumentCategoryIdSet.has(categoryId),
  );

  async function downloadPdf({
    url,
    title,
    setter,
  }: {
    url: string;
    title: string;
    setter: (nextPdf: DownloadedPdf) => void;
  }) {
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(await parseErrorMessage(response, "No fue posible generar el PDF. Intenta nuevamente."));
    }

    const data = await response.json().catch(() => null);

    if (!isGeneratedPdfResponse(data)) {
      throw new Error("No fue posible generar el PDF. Intenta nuevamente.");
    }

    setter({
      url: data.url,
      downloadUrl: data.downloadUrl,
      filename: data.filename,
      expiresAt: data.expiresAt,
      sizeBytes: data.sizeBytes,
      title,
    });

    return {
      missingCategories: getResponseMissingCategories(data),
      formsReportSummary: getResponseFormsReportSummary(data),
    };
  }

  async function generateFormsReport() {
    if (isFormsGenerationInFlight.current) {
      return;
    }

    setActiveReportModal("forms");

    const validation = validateDateRange(formFrom, formTo, today, { maxMonths: MAX_CUSTOM_REPORT_RANGE_MONTHS });

    if (!selectedForms.length) {
      setFormsDetailStatus(null);
      setFormsStatus({ tone: "error", text: "Selecciona al menos un formulario." });
      return;
    }

    if (!validation.ok) {
      setFormsDetailStatus(null);
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
    setFormsPdf(null);
    setFormsDetailStatus(null);
    setFormsStatus({ tone: "info", text: preparingPdfMessage });

    try {
      const result = await downloadPdf({
        url: `${basePath}/reportes/formularios.pdf?${params.toString()}`,
        title: "Reporte de formularios",
        setter: setFormsPdf,
      });

      if (result.formsReportSummary?.missingForms.length) {
        setFormsStatus({
          tone: "success",
          text: "Tu PDF está listo.",
        });
        setFormsDetailStatus({
          tone: "warning",
          text: getMissingFormsMessage(result.formsReportSummary.missingForms.length),
          body: formatBulletList(result.formsReportSummary.missingForms),
        });
      } else {
        setFormsStatus({ tone: "success", text: "Tu PDF está listo." });
        setFormsDetailStatus(null);
      }
    } catch (error) {
      setFormsDetailStatus(null);
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

    setActiveReportModal("documents");

    if (!selectedAvailableDocumentCategories.length) {
      setDocumentsStatus({ tone: "error", text: "Selecciona al menos una categoría." });
      return;
    }

    const params = new URLSearchParams({
      categories: selectedAvailableDocumentCategories.join(","),
    });

    isDossierGenerationInFlight.current = true;
    setIsGeneratingDossier(true);
    setDossierPdf(null);
    setDocumentsStatus({ tone: "info", text: preparingPdfMessage });

    try {
      await downloadPdf({
        url: `${basePath}/reportes/expediente-sanitario.pdf?${params.toString()}`,
        title: "Documentos sanitarios",
        setter: setDossierPdf,
      });

      setDocumentsStatus({ tone: "success", text: "Tu PDF está listo." });
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

    setActiveReportModal("history");

    const params = new URLSearchParams({
      category: categoryId,
      period: historyPreset,
    });

    const range = historyPreset === "custom" ? { from: historyFrom, to: historyTo } : getHistoryPresetRange(historyPreset, today);
    const validation = validateDateRange(range.from, range.to, today, { maxMonths: MAX_CUSTOM_REPORT_RANGE_MONTHS });

    if (!validation.ok) {
      setHistoryStatus({ tone: "error", text: validation.error });
      return;
    }

    params.set("from", validation.from);
    params.set("to", validation.to);

    isHistoryGenerationInFlight.current = true;
    setIsGeneratingHistory(true);
    setHistoryPdf(null);
    setHistoryStatus({ tone: "info", text: preparingPdfMessage });

    try {
      await downloadPdf({
        url: `${basePath}/reportes/historial-documental.pdf?${params.toString()}`,
        title: "Historial documental",
        setter: setHistoryPdf,
      });
      setHistoryStatus({ tone: "success", text: "Tu PDF está listo." });
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

  const formRangeValidation = validateDateRange(formFrom, formTo, today, {
    maxMonths: MAX_CUSTOM_REPORT_RANGE_MONTHS,
  });
  const historyRangeValidation = validateDateRange(historyFrom, historyTo, today, {
    maxMonths: MAX_CUSTOM_REPORT_RANGE_MONTHS,
  });
  const formRangeInvalid = !formRangeValidation.ok;
  const historyRangeInvalid = !historyRangeValidation.ok;
  const formCustomRangeIsTooLong =
    formPreset === "custom" && !formRangeValidation.ok && formRangeValidation.error === MAX_CUSTOM_REPORT_RANGE_ERROR_MESSAGE;
  const historyCustomRangeIsTooLong =
    historyPreset === "custom" &&
    !historyRangeValidation.ok &&
    historyRangeValidation.error === MAX_CUSTOM_REPORT_RANGE_ERROR_MESSAGE;
  const documentsSummary = getSelectionSummary(
    selectedAvailableDocumentCategories.length,
    data.documentCategories.length,
    "documentos",
  );
  const activeModalContent = activeReportModal
    ? {
        forms: {
          title: "Reporte de formularios",
          status: formsStatus,
          detailStatus: formsDetailStatus,
          downloadedPdf: formsPdf,
          isGenerating: isGeneratingForms,
          onOpen: () => openGeneratedReport(formsPdf, setFormsPdf, setFormsStatus),
          onDownload: () => downloadGeneratedReport(formsPdf, setFormsPdf, setFormsStatus),
          onShare: () => shareDownloadedPdf(formsPdf, setFormsPdf, setFormsStatus),
        },
        documents: {
          title: "Documentos sanitarios",
          status: documentsStatus,
          detailStatus: null,
          downloadedPdf: dossierPdf,
          isGenerating: isGeneratingDossier,
          onOpen: () => openGeneratedReport(dossierPdf, setDossierPdf, setDocumentsStatus),
          onDownload: () => downloadGeneratedReport(dossierPdf, setDossierPdf, setDocumentsStatus),
          onShare: () => shareDownloadedPdf(dossierPdf, setDossierPdf, setDocumentsStatus),
        },
        history: {
          title: "Historial documental",
          status: historyStatus,
          detailStatus: null,
          downloadedPdf: historyPdf,
          isGenerating: isGeneratingHistory,
          onOpen: () => openGeneratedReport(historyPdf, setHistoryPdf, setHistoryStatus),
          onDownload: () => downloadGeneratedReport(historyPdf, setHistoryPdf, setHistoryStatus),
          onShare: () => shareDownloadedPdf(historyPdf, setHistoryPdf, setHistoryStatus),
        },
      }[activeReportModal]
    : null;

  return (
    <div className="grid gap-4">
      <ReportPanelCard>
        <SectionHeader
          title="REPORTE DE FORMULARIOS"
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
                  setFormFrom("");
                  setFormTo("");
                  setActiveDatePickerField(null);
                  setFormsStatus(null);
                  setFormsDetailStatus(null);
                }}
              />
          </div>

          {formPreset === "custom" ? (
            <DateRangeFields
              from={formFrom}
              to={formTo}
              today={today}
              activeField={activeDatePickerField}
              fromFieldId="form-from"
              toFieldId="form-to"
              isRangeTooLong={formCustomRangeIsTooLong}
              onActiveFieldChange={setActiveDatePickerField}
              onFromChange={(value) => {
                setFormFrom(value);
                setFormsStatus(null);
                setFormsDetailStatus(null);
              }}
              onToChange={(value) => {
                setFormTo(value);
                setFormsStatus(null);
                setFormsDetailStatus(null);
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
                  setFormsDetailStatus(null);
                }}
              />
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:flex sm:items-center">
          <PrimaryButton
            disabled={isGeneratingForms || !selectedForms.length || formRangeInvalid}
            onClick={generateFormsReport}
          >
            {isGeneratingForms ? "Preparando PDF..." : generatePdfButtonLabel}
          </PrimaryButton>
        </div>
      </ReportPanelCard>

      <ReportPanelCard>
        <SectionHeader
          title="Documentos sanitarios"
          description="Selecciona las categorías que deseas incluir. Quimly unirá los archivos actualmente registrados en un solo PDF."
        />

        <div className="grid gap-2">
          <SelectionActions
            summary={documentsSummary}
            onSelectAll={() => {
              setSelectedDocumentCategories(availableDocumentCategoryIds);
              showEmptyDocumentCategoryHighlights(emptyDocumentCategoryIds);
              setDocumentsStatus(null);
            }}
            onClear={() => {
              setSelectedDocumentCategories([]);
              clearEmptyDocumentCategoryHighlights();
              setDocumentsStatus(null);
            }}
          />
          <div className="overflow-hidden rounded-[1.2rem] border border-[#e6eaed] bg-white/60 px-4">
            {data.documentCategories.map((category) => {
              const hasAvailableFiles = category.availableFileCount > 0;

              return (
                <CheckboxRow
                  key={category.id}
                  checked={hasAvailableFiles && selectedAvailableDocumentCategories.includes(category.id)}
                  title={category.title}
                  detail={category.countLabel}
                  disabled={!hasAvailableFiles}
                  detailHighlighted={Boolean(emptyDocumentCategoryHighlights[category.id])}
                  onDisabledClick={() => showEmptyDocumentCategoryHighlight(category.id)}
                  onChange={(checked) => {
                    clearEmptyDocumentCategoryHighlights();
                    setSelectedDocumentCategories((currentSelection) => {
                      const nextSelection = currentSelection.filter((categoryId) => categoryId !== category.id);

                      if (!checked || !hasAvailableFiles) {
                        return nextSelection;
                      }

                      return [...nextSelection, category.id];
                    });
                    setDocumentsStatus(null);
                  }}
                />
              );
            })}
          </div>
        </div>

        <div className="grid gap-3 sm:flex sm:items-center">
          <PrimaryButton
            disabled={isGeneratingDossier || !selectedAvailableDocumentCategories.length}
            onClick={generateSanitaryDossier}
          >
            {isGeneratingDossier ? "Preparando PDF..." : generatePdfButtonLabel}
          </PrimaryButton>
        </div>
      </ReportPanelCard>

      <ReportPanelCard>
        <SectionHeader
          title="Historial documental"
          description="Descarga el histórico de certificados y soportes almacenados."
        />

        <div className="overflow-hidden rounded-[1.2rem] border border-[#e6eaed] bg-white/60">
          {data.historyCategories.map((category) => {
            const isActive = activeHistoryCategory === category.id;
            const hasStoredCertificates = category.availableFileCount > 0;
            const shouldHighlightEmptyHistoryCategory = Boolean(emptyHistoryCategoryHighlights[category.id]);

            return (
              <div
                key={category.id}
                aria-disabled={!hasStoredCertificates ? true : undefined}
                className={`border-b border-[#e6eaed] p-4 transition last:border-b-0 ${
                  hasStoredCertificates ? "" : "cursor-not-allowed opacity-70"
                }`}
                onClick={() => {
                  if (!hasStoredCertificates) {
                    showEmptyHistoryCategoryHighlight(category.id);
                  }
                }}
              >
                <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <h3
                      className={`text-sm font-semibold leading-5 ${
                        hasStoredCertificates ? "text-[#12110f]" : "text-[#5f676e]"
                      }`}
                    >
                      {category.title}
                    </h3>
                    <p
                      className={`mt-1 w-fit font-medium leading-5 transition ${
                        shouldHighlightEmptyHistoryCategory
                          ? "rounded-2xl border border-amber-100 bg-amber-50 px-4 py-2 text-sm text-amber-700"
                          : "text-xs text-[#7f878d]"
                      }`}
                    >
                      {category.countLabel}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-disabled={!hasStoredCertificates ? true : undefined}
                    aria-expanded={hasStoredCertificates ? isActive : false}
                    className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-4 text-sm font-semibold transition active:scale-[0.98] ${
                      hasStoredCertificates
                        ? "border-[#bcc4ca] bg-white text-[#4f5961]"
                        : "border-[#d5dbdf] bg-[#f5f7f8] text-[#7f878d]"
                    }`}
                    onClick={(event) => {
                      if (!hasStoredCertificates) {
                        event.preventDefault();
                        event.stopPropagation();
                        showEmptyHistoryCategoryHighlight(category.id);
                        return;
                      }

                      event.stopPropagation();

                      setActiveHistoryCategory(isActive ? null : category.id);
                      setHistoryStatus(null);
                    }}
                  >
                    <span>Elegir periodo</span>
                    <svg
                      viewBox="0 0 16 16"
                      aria-hidden="true"
                      className={`h-4 w-4 shrink-0 transition-transform duration-200 ${isActive ? "rotate-180" : ""}`}
                    >
                      <path
                        d="M4 6 8 10l4-4"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.8"
                      />
                    </svg>
                  </button>
                </div>

                {isActive && hasStoredCertificates ? (
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
                        label={historyPresetLabels.custom}
                        active={historyPreset === "custom"}
                        onClick={() => {
                          setHistoryPreset("custom");
                          setHistoryFrom("");
                          setHistoryTo("");
                          setActiveDatePickerField(null);
                          setHistoryStatus(null);
                        }}
                      />
                    </div>

                    {historyPreset === "custom" ? (
                      <DateRangeFields
                        from={historyFrom}
                        to={historyTo}
                        today={today}
                        activeField={activeDatePickerField}
                        fromFieldId="history-from"
                        toFieldId="history-to"
                        isRangeTooLong={historyCustomRangeIsTooLong}
                        onActiveFieldChange={setActiveDatePickerField}
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

                    <div className="grid gap-3 sm:flex sm:items-center">
                      <PrimaryButton
                        disabled={isGeneratingHistory || (historyPreset === "custom" && historyRangeInvalid)}
                        onClick={() => generateHistoryPdf(category.id)}
                      >
                        {isGeneratingHistory ? "Preparando PDF..." : generatePdfButtonLabel}
                      </PrimaryButton>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </ReportPanelCard>
      {activeModalContent ? (
        <ReportGenerationModal
          title={activeModalContent.title}
          status={activeModalContent.status}
          detailStatus={activeModalContent.detailStatus}
          downloadedPdf={activeModalContent.downloadedPdf}
          isGenerating={activeModalContent.isGenerating}
          onOpen={activeModalContent.onOpen}
          onDownload={activeModalContent.onDownload}
          onShare={activeModalContent.onShare}
          onClose={() => setActiveReportModal(null)}
        />
      ) : null}
    </div>
  );
}
