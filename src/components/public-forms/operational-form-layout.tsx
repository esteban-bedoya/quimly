"use client";

import { useEffect, type ReactNode } from "react";

import { OperationalRecordStatusDot } from "@/components/ui/operational-record-status-dot";
import type { OperationalRecordDateStatus } from "@/lib/operational-record-dates";

export const operationalFormStyles = {
  page: "min-h-screen min-h-dvh bg-[#12110F] px-0 pb-5 pt-12 text-[#111816]",
  shell: "mx-auto flex w-full max-w-lg flex-col",
  layoutContent: "grid gap-0",
  header: "px-4 pb-5 pt-4",
  formBody: "grid gap-4 pb-5 pt-2",
  title: "mt-3 text-2xl font-black tracking-[-0.03em] text-[#48c7d2]",
  description: "mt-3 text-base leading-7 text-white/70",
  location: "text-sm font-black tracking-[-0.01em] text-white",
  locationMuted: "text-white/55",
  sectionContainer:
    "grid gap-5 rounded-lg border border-black/[0.06] bg-white p-5 shadow-[0_14px_34px_rgba(17,24,22,0.06)]",
  sectionHeader: "grid",
  sectionTitle: "text-[0.68rem] font-bold uppercase tracking-widest text-[#66736f]",
  field: "grid gap-2.5",
  fieldLabel: "text-[0.95rem] font-black leading-5 text-neutral-950",
  input:
    "min-h-14 rounded-lg border border-[#c7d8d4] bg-white px-4 text-lg font-bold text-neutral-950 outline-none transition placeholder:text-[#7b8c87] focus:border-[#147060] focus:bg-white focus:ring-2 focus:ring-[#147060]/10",
  inputOnWhite:
    "min-h-14 rounded-lg border border-[#c7d8d4] bg-white px-4 text-lg font-bold text-neutral-950 outline-none transition placeholder:text-sm placeholder:text-[#7b8c87] focus:border-[#147060] focus:ring-2 focus:ring-[#147060]/10",
  textareaOnWhite:
    "min-h-24 resize-none rounded-lg border border-[#c7d8d4] bg-white px-4 py-3 text-base font-bold text-neutral-950 outline-none transition placeholder:text-sm placeholder:text-[#7b8c87] focus:border-[#147060] focus:ring-2 focus:ring-[#147060]/10",
  select:
    "min-h-14 rounded-lg border border-[#c7d8d4] bg-white px-4 text-lg font-bold text-neutral-950 outline-none transition focus:border-[#147060] focus:bg-white focus:ring-2 focus:ring-[#147060]/10",
  temperatureInput:
    "min-h-14 rounded-lg border border-[#c7d8d4] bg-white px-4 text-2xl font-black text-neutral-950 outline-none transition focus:border-[#147060] focus:bg-white focus:ring-2 focus:ring-[#147060]/10",
  yesNoGrid: "grid grid-cols-2 gap-3",
  radioLabel: "relative",
  radioInput: "peer sr-only",
  yesButton:
    "flex min-h-14 items-center justify-center rounded-lg border border-black/10 bg-white px-4 text-lg font-black text-neutral-950 transition peer-checked:border-emerald-700 peer-checked:bg-emerald-700 peer-checked:text-white",
  yesButtonLarge:
    "flex min-h-16 items-center justify-center rounded-lg border border-black/10 bg-white px-4 text-lg font-black text-neutral-950 transition peer-checked:border-emerald-700 peer-checked:bg-emerald-700 peer-checked:text-white",
  noButton:
    "flex min-h-14 items-center justify-center rounded-lg border border-black/10 bg-white px-4 text-lg font-black text-neutral-950 transition peer-checked:border-[#8f1d2c] peer-checked:bg-[#8f1d2c] peer-checked:text-white",
  noButtonLarge:
    "flex min-h-16 items-center justify-center rounded-lg border border-black/10 bg-white px-4 text-lg font-black text-neutral-950 transition peer-checked:border-[#8f1d2c] peer-checked:bg-[#8f1d2c] peer-checked:text-white",
  primaryButton:
    "mt-1 min-h-16 rounded-lg bg-[#111816] px-5 text-lg font-black text-white shadow-[0_14px_32px_rgba(17,24,22,0.22)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#aeb9b6] disabled:shadow-none",
  statusWarning: "rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-800",
  statusError: "rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold leading-6 text-rose-800",
  statusSuccess:
    "rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold leading-6 text-emerald-800",
  responsibleSummary: "grid gap-1 px-1 pt-1",
  responsibleLabel: "text-sm font-bold text-[#51645f]",
  responsibleValue: "text-xl font-black text-[#111816]",
  responsibleValueEmpty: "text-xl font-black text-[#7b8c87]",
  poweredBy: "px-4 pb-6 text-right text-xs font-bold text-white/35",
  successDialogBackdrop:
    "fixed inset-0 z-50 flex items-center justify-center bg-[#111816]/35 px-5 backdrop-blur-md",
  successDialogCard: "w-full max-w-sm rounded-3xl bg-white p-6 text-[#111816] shadow-[0_24px_80px_rgba(17,24,22,0.22)]",
  successDialogMessage: "whitespace-pre-line text-xl font-black leading-8 text-[#111816]",
  successDialogButton:
    "mt-6 min-h-14 w-full rounded-2xl bg-[#111816] px-5 text-base font-black text-white transition active:scale-[0.98]",
} as const;

export function OperationalFormLayout({
  title,
  description,
  companyName,
  branchName,
  dateLabel,
  recordDateStatus,
  isDateModified,
  onDateEdit,
  children,
}: {
  title: string;
  description?: string | null;
  companyName: string;
  branchName: string;
  dateLabel?: string;
  recordDateStatus?: OperationalRecordDateStatus;
  isDateModified?: boolean;
  onDateEdit?: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    document.documentElement.classList.add("public-form-document");
    document.body.classList.add("public-form-document");

    return () => {
      document.documentElement.classList.remove("public-form-document");
      document.body.classList.remove("public-form-document");
    };
  }, []);

  return (
    <main className={operationalFormStyles.page} data-public-form-shell>
      <div className={operationalFormStyles.shell}>
        <div className={operationalFormStyles.layoutContent}>
          <OperationalFormHeader
            title={title}
            description={description}
            companyName={companyName}
            branchName={branchName}
            dateLabel={dateLabel}
            recordDateStatus={recordDateStatus}
            isDateModified={isDateModified}
            onDateEdit={onDateEdit}
          />
          {children}
          <p className={operationalFormStyles.poweredBy}>Powered by Quimly</p>
        </div>
      </div>
    </main>
  );
}

export function OperationalFormHeader({
  title,
  description,
  companyName,
  branchName,
  dateLabel,
  recordDateStatus,
  isDateModified,
  onDateEdit,
}: {
  title: string;
  description?: string | null;
  companyName: string;
  branchName: string;
  dateLabel?: string;
  recordDateStatus?: OperationalRecordDateStatus;
  isDateModified?: boolean;
  onDateEdit?: () => void;
}) {
  return (
    <header className={operationalFormStyles.header}>
      <p className={operationalFormStyles.location}>
        {companyName}
        <span className={`px-2 ${operationalFormStyles.locationMuted}`}>|</span>
        <span className={operationalFormStyles.locationMuted}>{branchName}</span>
      </p>
      {title ? <h1 className={operationalFormStyles.title}>{title}</h1> : null}
      {description ? <p className={operationalFormStyles.description}>{description}</p> : null}
      {dateLabel && onDateEdit ? (
        <button
          type="button"
          onClick={onDateEdit}
          className="mt-7 ml-auto block max-w-max text-right text-[11px] font-black uppercase tracking-[0.22em] text-white transition active:scale-[0.98]"
        >
          <span className="block">Cambiar fecha y hora:</span>
          <span className="mt-1 flex items-center justify-end gap-2 tracking-[0.16em]">
            {recordDateStatus ? <OperationalRecordStatusDot status={recordDateStatus} /> : null}
            <span className={isDateModified ? "text-[#48c7d2]" : "text-white"}>{dateLabel}</span>
          </span>
        </button>
      ) : null}
    </header>
  );
}

export function OperationalFormSectionContainer({ children }: { children: ReactNode }) {
  return <section className={operationalFormStyles.sectionContainer}>{children}</section>;
}

export function OperationalFormSectionTitle({ title }: { title: string }) {
  return (
    <div className={operationalFormStyles.sectionHeader}>
      <h2 className={operationalFormStyles.sectionTitle}>{title}</h2>
    </div>
  );
}

export function OperationalFormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <OperationalFormSectionContainer>
      <OperationalFormSectionTitle title={title} />
      {children}
    </OperationalFormSectionContainer>
  );
}

export function OperationalFormSubmitButton({
  children,
  disabled,
}: {
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button type="submit" disabled={disabled} className={operationalFormStyles.primaryButton}>
      {children}
    </button>
  );
}

export function OperationalFormResponsibleSummary({ responsibleName }: { responsibleName: string }) {
  const displayName = responsibleName.trim();

  return (
    <div className={operationalFormStyles.responsibleSummary} aria-live="polite">
      <p className={operationalFormStyles.responsibleLabel}>Responsable del registro</p>
      <p className={displayName ? operationalFormStyles.responsibleValue : operationalFormStyles.responsibleValueEmpty}>
        {displayName || "Sin definir"}
      </p>
    </div>
  );
}

export function OperationalFormSuccessDialog({ open, onAccept }: { open: boolean; onAccept: () => void }) {
  if (!open) {
    return null;
  }

  return (
    <div className={operationalFormStyles.successDialogBackdrop} role="presentation">
      <section
        aria-modal="true"
        className={operationalFormStyles.successDialogCard}
        role="dialog"
        aria-label="Registro guardado"
      >
        <div className={operationalFormStyles.successDialogMessage}>
          <p className="font-bold">Firma registrada.</p>
          <p className="font-normal">Puedes cerrar esta pantalla o registrar otro control.</p>
        </div>
        <button type="button" className={operationalFormStyles.successDialogButton} onClick={onAccept}>
          Aceptar
        </button>
      </section>
    </div>
  );
}
